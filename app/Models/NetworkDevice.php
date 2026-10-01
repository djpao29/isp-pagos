<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use InvalidArgumentException;
use PDO;

/**
 * Modelo NetworkDevice
 * Gestiona el inventario de red (AP, CPE, OLT, Router, PTP, Switch)
 * con validación de MAC, IP, Frecuencia, Coordenadas GPS y aislamiento Multi-ISP.
 */
final class NetworkDevice
{
    private PDO $db;

    public const ALLOWED_TYPES = ['AP', 'CPE', 'OLT', 'Router', 'PTP', 'Switch'];
    public const ALLOWED_STATUSES = ['online', 'offline', 'warning', 'maintenance'];

    public function __construct(?PDO $db = null)
    {
        $this->db = $db ?? Database::getConnection();
    }

    /**
     * Lista y filtra dispositivos de red por múltiples criterios.
     *
     * @param int   $ispId   ID del tenant ISP
     * @param array $filters Criterios: search, device_type, brand, frequency_band, status, customer_id
     * @return array<int, array<string, mixed>>
     */
    public function search(int $ispId, array $filters = []): array
    {
        $sql = "
            SELECT 
                ni.*,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                c.customer_code,
                c.status AS customer_status,
                p.name AS parent_device_name,
                p.device_type AS parent_device_type
            FROM network_inventory ni
            LEFT JOIN customers c ON c.id = ni.customer_id AND c.isp_id = ni.isp_id
            LEFT JOIN network_inventory p ON p.id = ni.parent_device_id AND p.isp_id = ni.isp_id
            WHERE ni.isp_id = :isp_id
        ";

        $params = [':isp_id' => $ispId];

        if (!empty($filters['search'])) {
            $sql .= " AND (
                ni.name LIKE :q
                OR ni.device_code LIKE :q
                OR ni.brand LIKE :q
                OR ni.model LIKE :q
                OR ni.mac_address LIKE :q
                OR ni.ip_address LIKE :q
                OR ni.ssid LIKE :q
                OR ni.physical_location LIKE :q
                OR CONCAT(c.first_name, ' ', c.last_name) LIKE :q
            )";
            $params[':q'] = '%' . trim((string)$filters['search']) . '%';
        }

        if (!empty($filters['device_type']) && in_array($filters['device_type'], self::ALLOWED_TYPES, true)) {
            $sql .= " AND ni.device_type = :device_type";
            $params[':device_type'] = $filters['device_type'];
        }

        if (!empty($filters['brand'])) {
            $sql .= " AND ni.brand = :brand";
            $params[':brand'] = trim((string)$filters['brand']);
        }

        if (!empty($filters['frequency_band'])) {
            $sql .= " AND ni.frequency_band = :frequency_band";
            $params[':frequency_band'] = trim((string)$filters['frequency_band']);
        }

        if (!empty($filters['status']) && in_array($filters['status'], self::ALLOWED_STATUSES, true)) {
            $sql .= " AND ni.status = :status";
            $params[':status'] = $filters['status'];
        }

        if (!empty($filters['customer_id'])) {
            $sql .= " AND ni.customer_id = :customer_id";
            $params[':customer_id'] = (int)$filters['customer_id'];
        }

        $sql .= " ORDER BY FIELD(ni.device_type, 'Router', 'OLT', 'AP', 'PTP', 'Switch', 'CPE'), ni.name ASC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * Obtiene un dispositivo por ID garantizando aislamiento Multi-ISP.
     */
    public function findById(int $ispId, int $id): ?array
    {
        $stmt = $this->db->prepare("
            SELECT ni.*, CONCAT(c.first_name, ' ', c.last_name) AS customer_name
            FROM network_inventory ni
            LEFT JOIN customers c ON c.id = ni.customer_id AND c.isp_id = ni.isp_id
            WHERE ni.isp_id = :isp_id AND ni.id = :id
            LIMIT 1
        ");
        $stmt->execute([':isp_id' => $ispId, ':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Registra un nuevo dispositivo en el inventario de red.
     */
    public function create(int $ispId, array $data): int
    {
        $clean = $this->validateAndSanitize($data);

        $stmt = $this->db->prepare("
            INSERT INTO network_inventory (
                isp_id, device_code, name, device_type, brand, model,
                mac_address, ip_address, frequency_mhz, frequency_band, ssid,
                channel_width_mhz, signal_dbm, firmware_version,
                physical_location, gps_lat, gps_lng,
                customer_id, parent_device_id, status, notes, last_seen_at
            ) VALUES (
                :isp_id, :device_code, :name, :device_type, :brand, :model,
                :mac_address, :ip_address, :frequency_mhz, :frequency_band, :ssid,
                :channel_width_mhz, :signal_dbm, :firmware_version,
                :physical_location, :gps_lat, :gps_lng,
                :customer_id, :parent_device_id, :status, :notes, NOW()
            )
        ");

        $stmt->execute([
            ':isp_id'            => $ispId,
            ':device_code'       => $clean['device_code'],
            ':name'              => $clean['name'],
            ':device_type'       => $clean['device_type'],
            ':brand'             => $clean['brand'],
            ':model'             => $clean['model'],
            ':mac_address'       => $clean['mac_address'],
            ':ip_address'        => $clean['ip_address'],
            ':frequency_mhz'     => $clean['frequency_mhz'],
            ':frequency_band'    => $clean['frequency_band'],
            ':ssid'              => $clean['ssid'],
            ':channel_width_mhz' => $clean['channel_width_mhz'],
            ':signal_dbm'        => $clean['signal_dbm'],
            ':firmware_version'  => $clean['firmware_version'],
            ':physical_location' => $clean['physical_location'],
            ':gps_lat'           => $clean['gps_lat'],
            ':gps_lng'           => $clean['gps_lng'],
            ':customer_id'       => $clean['customer_id'],
            ':parent_device_id'  => $clean['parent_device_id'],
            ':status'            => $clean['status'],
            ':notes'             => $clean['notes'],
        ]);

        return (int)$this->db->lastInsertId();
    }

    /**
     * Actualiza un dispositivo existente.
     */
    public function update(int $ispId, int $id, array $data): bool
    {
        $clean = $this->validateAndSanitize($data);

        $stmt = $this->db->prepare("
            UPDATE network_inventory SET
                device_code       = :device_code,
                name              = :name,
                device_type       = :device_type,
                brand             = :brand,
                model             = :model,
                mac_address       = :mac_address,
                ip_address        = :ip_address,
                frequency_mhz     = :frequency_mhz,
                frequency_band    = :frequency_band,
                ssid              = :ssid,
                channel_width_mhz = :channel_width_mhz,
                signal_dbm        = :signal_dbm,
                firmware_version  = :firmware_version,
                physical_location = :physical_location,
                gps_lat           = :gps_lat,
                gps_lng           = :gps_lng,
                customer_id       = :customer_id,
                parent_device_id  = :parent_device_id,
                status            = :status,
                notes             = :notes
            WHERE isp_id = :isp_id AND id = :id
        ");

        return $stmt->execute([
            ':isp_id'            => $ispId,
            ':id'                => $id,
            ':device_code'       => $clean['device_code'],
            ':name'              => $clean['name'],
            ':device_type'       => $clean['device_type'],
            ':brand'             => $clean['brand'],
            ':model'             => $clean['model'],
            ':mac_address'       => $clean['mac_address'],
            ':ip_address'        => $clean['ip_address'],
            ':frequency_mhz'     => $clean['frequency_mhz'],
            ':frequency_band'    => $clean['frequency_band'],
            ':ssid'              => $clean['ssid'],
            ':channel_width_mhz' => $clean['channel_width_mhz'],
            ':signal_dbm'        => $clean['signal_dbm'],
            ':firmware_version'  => $clean['firmware_version'],
            ':physical_location' => $clean['physical_location'],
            ':gps_lat'           => $clean['gps_lat'],
            ':gps_lng'           => $clean['gps_lng'],
            ':customer_id'       => $clean['customer_id'],
            ':parent_device_id'  => $clean['parent_device_id'],
            ':status'            => $clean['status'],
            ':notes'             => $clean['notes'],
        ]);
    }

    /**
     * Elimina un dispositivo de red del inventario.
     */
    public function delete(int $ispId, int $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM network_inventory WHERE isp_id = :isp_id AND id = :id");
        return $stmt->execute([':isp_id' => $ispId, ':id' => $id]);
    }

    /**
     * Valida estrictamente MAC, IP, coordenadas GPS y campos obligatorios.
     */
    private function validateAndSanitize(array $input): array
    {
        $type = trim((string)($input['device_type'] ?? ''));
        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException("Tipo de dispositivo inválido: {$type}");
        }

        $mac = strtoupper(trim((string)($input['mac_address'] ?? '')));
        if (!preg_match('/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/', $mac)) {
            throw new InvalidArgumentException("Formato de dirección MAC inválido ({$mac}). Use AA:BB:CC:DD:EE:FF.");
        }

        $ip = trim((string)($input['ip_address'] ?? ''));
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            throw new InvalidArgumentException("Dirección IP inválida ({$ip}).");
        }

        $lat = (float)($input['gps_lat'] ?? 0);
        $lng = (float)($input['gps_lng'] ?? 0);
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            throw new InvalidArgumentException("Coordenadas GPS fuera de rango válido.");
        }

        $wirelessTypes = ['AP', 'CPE', 'PTP'];
        $freqMhz = !empty($input['frequency_mhz']) ? (int)$input['frequency_mhz'] : null;
        $ssid    = !empty($input['ssid']) ? htmlspecialchars(trim((string)$input['ssid']), ENT_QUOTES, 'UTF-8') : null;

        if (!in_array($type, $wirelessTypes, true) && empty($input['ssid'])) {
            $ssid = null;
        }

        return [
            'device_code'       => strtoupper(trim((string)($input['device_code'] ?? ($type . '-' . rand(100, 999))))),
            'name'              => htmlspecialchars(trim((string)($input['name'] ?? '')), ENT_QUOTES, 'UTF-8'),
            'device_type'       => $type,
            'brand'             => htmlspecialchars(trim((string)($input['brand'] ?? '')), ENT_QUOTES, 'UTF-8'),
            'model'             => htmlspecialchars(trim((string)($input['model'] ?? '')), ENT_QUOTES, 'UTF-8'),
            'mac_address'       => $mac,
            'ip_address'        => $ip,
            'frequency_mhz'     => $freqMhz,
            'frequency_band'    => !empty($input['frequency_band']) ? trim((string)$input['frequency_band']) : ($freqMhz ? ($freqMhz >= 4900 ? '5 GHz' : '2.4 GHz') : 'Fibra / Ethernet'),
            'ssid'              => $ssid,
            'channel_width_mhz' => !empty($input['channel_width_mhz']) ? (int)$input['channel_width_mhz'] : null,
            'signal_dbm'        => isset($input['signal_dbm']) && $input['signal_dbm'] !== '' ? (float)$input['signal_dbm'] : null,
            'firmware_version'  => !empty($input['firmware_version']) ? trim((string)$input['firmware_version']) : null,
            'physical_location' => htmlspecialchars(trim((string)($input['physical_location'] ?? '')), ENT_QUOTES, 'UTF-8'),
            'gps_lat'           => $lat,
            'gps_lng'           => $lng,
            'customer_id'       => !empty($input['customer_id']) ? (int)$input['customer_id'] : null,
            'parent_device_id'  => !empty($input['parent_device_id']) ? (int)$input['parent_device_id'] : null,
            'status'            => in_array($input['status'] ?? 'online', self::ALLOWED_STATUSES, true) ? $input['status'] : 'online',
            'notes'             => !empty($input['notes']) ? htmlspecialchars(trim((string)$input['notes']), ENT_QUOTES, 'UTF-8') : null,
        ];
    }
}
