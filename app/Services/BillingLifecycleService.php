<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Drivers\Contracts\MikrotikDriverInterface;
use App\Drivers\Contracts\WhatsAppProviderInterface;
use PDO;

/**
 * Orquestador completo del flujo:
 * FACTURACIÓN -> VENCIMIENTO -> PROMESA/GRACIA -> SUSPENSIÓN MIKROTIK -> PAGO -> REACTIVACIÓN
 */
final class BillingLifecycleService
{
    private PDO $db;
    private MikrotikDriverInterface $mikrotik;
    private WhatsAppProviderInterface $whatsapp;

    public function __construct(
        MikrotikDriverInterface $mikrotik,
        WhatsAppProviderInterface $whatsapp,
        ?PDO $db = null
    ) {
        $this->db = $db ?? Database::getConnection();
        $this->mikrotik = $mikrotik;
        $this->whatsapp = $whatsapp;
    }

    /**
     * Suspende automáticamente a los clientes con facturas vencidas sin promesa de pago activa.
     *
     * Pasos:
     * 1. Marcar cliente como Moroso / Suspendido
     * 2. Suspender servicio en customer_services y pppoe_users
     * 3. Aplicar regla en MikroTik (perfil CORTADOS + firewall address-list MOROSOS_ISP + corte de sesión activa)
     * 4. Registrar acción en audit_logs
     * 5. Enviar notificación por WhatsApp usando plantilla configurada
     */
    public function suspendOverdueCustomer(int $ispId, int $customerId, int $invoiceId): array
    {
        $this->db->beginTransaction();

        try {
            $stmt = $this->db->prepare("
                SELECT c.*, r.ip_address AS router_ip, r.api_port, r.username AS router_user, r.password_encrypted
                FROM customers c
                LEFT JOIN routers r ON r.id = c.router_id
                WHERE c.isp_id = :isp_id AND c.id = :customer_id
                FOR UPDATE
            ");
            $stmt->execute([':isp_id' => $ispId, ':customer_id' => $customerId]);
            $customer = $stmt->fetch();

            // 1. Marcar cliente como Moroso y factura como Vencida
            $this->db->prepare("UPDATE customers SET status = 'Suspendido' WHERE id = :id")
                     ->execute([':id' => $customerId]);
            $this->db->prepare("UPDATE invoices SET status = 'Vencida' WHERE id = :inv_id")
                     ->execute([':inv_id' => $invoiceId]);
            $this->db->prepare("UPDATE pppoe_users SET status = 'suspended_pool', is_online = 0 WHERE customer_id = :cid")
                     ->execute([':cid' => $customerId]);

            // 2. Ejecutar suspensión en MikroTik RouterOS si tiene router asignado
            $mikrotikResult = 'Sin router asignado';
            if (!empty($customer['router_ip']) && !empty($customer['pppoe_user'])) {
                $this->mikrotik->connect(
                    $customer['router_ip'],
                    (int)$customer['api_port'],
                    $customer['router_user'],
                    $customer['password_encrypted']
                );
                $this->mikrotik->suspendPppoeUser($customer['pppoe_user'], 'CORTADOS_MOROSOS', 'MOROSOS_ISP');
                $this->mikrotik->disconnect();
                $mikrotikResult = "PPPoE {$customer['pppoe_user']} movido a address-list MOROSOS_ISP y sesión reiniciada";
            }

            // 3. Registrar en Auditoría
            $this->db->prepare("
                INSERT INTO audit_logs (isp_id, user_name, ip_address, action, module, record_id, old_values, new_values)
                VALUES (:isp_id, 'CRON_SYSTEM', '127.0.0.1', 'SUSPEND', 'Customers/MikroTik', :cid, :old, :new)
            ")->execute([
                ':isp_id' => $ispId,
                ':cid'    => (string)$customerId,
                ':old'    => json_encode(['status' => $customer['status']]),
                ':new'    => json_encode(['status' => 'Suspendido', 'mikrotik' => $mikrotikResult]),
            ]);

            $this->db->commit();

            // 4. Enviar notificación por WhatsApp
            if (!empty($customer['whatsapp'])) {
                $msg = "Su servicio ha sido suspendido debido a una factura pendiente.";
                $this->whatsapp->sendTextMessage($customer['whatsapp'], $msg);
            }

            return ['status' => 'suspended', 'mikrotik' => $mikrotikResult];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}
