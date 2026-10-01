<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Models\NetworkDevice;
use InvalidArgumentException;
use Throwable;

/**
 * Controlador MVC y API REST para el Módulo de Inventario de Red
 * Soporta operaciones AJAX/fetch (JSON) y renderizado de vista con mapa Leaflet/OpenStreetMap.
 */
final class NetworkInventoryController
{
    private NetworkDevice $model;

    public function __construct(?NetworkDevice $model = null)
    {
        $this->model = $model ?? new NetworkDevice();
    }

    /**
     * GET /api/v1/network-inventory
     * Lista dispositivos con búsqueda multicriterio y coordenadas GeoJSON para Leaflet.
     */
    public function indexJson(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $ispId = (int)($_SESSION['isp_id'] ?? 1);

        $filters = [
            'search'         => $_GET['search'] ?? '',
            'device_type'    => $_GET['device_type'] ?? '',
            'brand'          => $_GET['brand'] ?? '',
            'frequency_band' => $_GET['frequency_band'] ?? '',
            'status'         => $_GET['status'] ?? '',
            'customer_id'    => $_GET['customer_id'] ?? '',
        ];

        $devices = $this->model->search($ispId, $filters);

        $stats = [
            'total'   => count($devices),
            'ap'      => count(array_filter($devices, fn($d) => $d['device_type'] === 'AP')),
            'cpe'     => count(array_filter($devices, fn($d) => $d['device_type'] === 'CPE')),
            'olt'     => count(array_filter($devices, fn($d) => $d['device_type'] === 'OLT')),
            'router'  => count(array_filter($devices, fn($d) => $d['device_type'] === 'Router')),
            'online'  => count(array_filter($devices, fn($d) => $d['status'] === 'online')),
            'offline' => count(array_filter($devices, fn($d) => $d['status'] === 'offline')),
        ];

        echo json_encode([
            'status'  => 'success',
            'stats'   => $stats,
            'devices' => $devices,
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * POST /api/v1/network-inventory
     * Registra un nuevo AP, CPE, OLT o Router y registra auditoría.
     */
    public function storeJson(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $this->verifyCsrfToken();

        try {
            $ispId = (int)($_SESSION['isp_id'] ?? 1);
            $payload = json_decode((string)file_get_contents('php://input'), true) ?? $_POST;

            $newId = $this->model->create($ispId, $payload);
            $device = $this->model->findById($ispId, $newId);

            http_response_code(201);
            echo json_encode([
                'status'  => 'success',
                'message' => 'Dispositivo registrado correctamente en el inventario de red.',
                'device'  => $device,
            ], JSON_UNESCAPED_UNICODE);
        } catch (InvalidArgumentException $e) {
            http_response_code(422);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Error al guardar el dispositivo en la base de datos.']);
        }
    }

    /**
     * PUT /api/v1/network-inventory/{id}
     * Actualiza un dispositivo de red existente.
     */
    public function updateJson(int $id): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $this->verifyCsrfToken();

        try {
            $ispId = (int)($_SESSION['isp_id'] ?? 1);
            $payload = json_decode((string)file_get_contents('php://input'), true) ?? $_POST;

            $this->model->update($ispId, $id, $payload);
            $device = $this->model->findById($ispId, $id);

            echo json_encode([
                'status'  => 'success',
                'message' => 'Dispositivo actualizado correctamente.',
                'device'  => $device,
            ], JSON_UNESCAPED_UNICODE);
        } catch (InvalidArgumentException $e) {
            http_response_code(422);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Error al actualizar el dispositivo.']);
        }
    }

    /**
     * DELETE /api/v1/network-inventory/{id}
     */
    public function destroyJson(int $id): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $this->verifyCsrfToken();

        $ispId = (int)($_SESSION['isp_id'] ?? 1);
        $this->model->delete($ispId, $id);

        echo json_encode([
            'status'  => 'success',
            'message' => 'Dispositivo eliminado del inventario.',
        ]);
    }

    private function verifyCsrfToken(): void
    {
        $headerToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');
        $sessionToken = $_SESSION['csrf_token'] ?? '';
        if (!empty($sessionToken) && !hash_equals($sessionToken, $headerToken)) {
            http_response_code(419);
            echo json_encode(['status' => 'error', 'message' => 'Token CSRF inválido o expirado.']);
            exit;
        }
    }
}
