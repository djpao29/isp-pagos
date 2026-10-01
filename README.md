# NetCore ISP — Sistema Integral de Gestión WISP & FTTH (PHP 8.2+ & MySQL 8+)

Sistema profesional Multi-Tenant para Proveedores de Servicios de Internet (WISP y FTTH), diseñado con arquitectura MVC limpia, PDO con consultas preparadas, control de acceso basado en roles (RBAC), integración real con MikroTik RouterOS API, abstracción de drivers para OLT/FTTH, WhatsApp, Pasarelas de Pago, OCR de comprobantes, Asistente IA con funciones controladas y **Módulo de Inventario de Red con Mapa GIS (Leaflet / OpenStreetMap)**.

---

## 1. Análisis de Arquitectura y Estructura de Carpetas

```
/
├── app/
│   ├── Core/
│   │   └── Database.php                    # Singleton PDO MySQL 8+ con UTF8MB4 y Prepared Statements
│   ├── Controllers/
│   │   └── NetworkInventoryController.php  # Controlador MVC y API REST para AP, CPE, OLT y Routers
│   ├── Models/
│   │   └── NetworkDevice.php               # Modelo PDO con filtros multicriterio, validación MAC/IP/GPS
│   ├── Drivers/
│   │   ├── Contracts/
│   │   │   └── IspContracts.php            # MikrotikDriverInterface, OLTDriverInterface, WhatsAppProviderInterface, PaymentGatewayInterface
│   │   └── Mikrotik/
│   │       └── RouterOSApiDriver.php       # Cliente de sockets TCP/SSL para MikroTik RouterOS API (8728/8729)
│   └── Services/
│       └── BillingLifecycleService.php     # Flujo Facturación -> Vencimiento -> Suspensión MikroTik -> Pago -> Reactivación
├── database/
│   └── migrations/
│       ├── 001_full_isp_schema.sql         # Esquema MySQL 8+ normalizado (35+ tablas con FK, índices, DECIMAL)
│       └── 002_network_inventory.sql       # Tabla unificada network_inventory (AP, CPE, OLT, Router, PTP, Switch) + Seed
├── resources/
│   └── views/
│       └── network/
│           └── inventory.php               # Vista responsive con tabla dinámica AJAX y mapa Leaflet/OpenStreetMap
├── artisan                                 # CLI para tareas CRON (invoices:generate, customers:suspend, mikrotik:sync, etc.)
├── server.ts                               # Servidor Full-Stack API REST + Motor de persistencia + Proxy IA/Socket en vivo
└── .env.example                            # Variables de entorno documentadas sin secretos expuestos
```

---

## 2. Módulo de Inventario de Red y Mapa GIS (Leaflet / OpenStreetMap)

El módulo de inventario de red (`network_inventory`) permite registrar, buscar, auditar y geolocalizar:
- **Access Points (AP)**: Ubiquiti Rocket Prism, Mimosa A5c, Cambium ePMP, MikroTik mANTBox (frecuencia MHz, banda 2.4/5/6/60 GHz, ancho de canal, SSID, potencia dBm, torre/nodo).
- **Customer Premises Equipment (CPE)**: Antenas receptoras y ONUs/Routers domiciliarios vinculados directamente a un `customer_id`, y enlazados a un `parent_device_id` (AP u OLT).
- **OLTs FTTH**: Equipos de cabecera GPON/EPON (ZTE C320/C300, Huawei MA5800, VSOL, FiberHome) con información de potencia óptica Tx dBm, slots/puertos PON y ubicación en rack/nodo.
- **Routers de Borde / Core**: Equipos MikroTik CCR/RB con IP de gestión, MAC, versión de RouterOS y ubicación GPS.

### Criterios de Búsqueda Soportados (`GET /api/v1/network-inventory`)
- `search`: Búsqueda instantánea por Nombre, Código, Marca, Modelo, Dirección MAC, Dirección IP, SSID, Ubicación física o Nombre del Cliente asociado.
- `device_type`: `AP`, `CPE`, `OLT`, `Router`, `PTP`, `Switch`.
- `brand`: `Ubiquiti`, `MikroTik`, `Mimosa`, `Cambium`, `ZTE`, `Huawei`, `VSOL`, `TP-Link`.
- `frequency_band`: `2.4 GHz`, `5 GHz`, `6 GHz`, `60 GHz`, `Fibra Óptica GPON`, `Fibra / 10GbE`.
- `status`: `online`, `warning`, `offline`, `maintenance`.
- `customer_id`: Filtra los CPEs/equipos asignados a un cliente específico.

---

## 3. Flujo de Facturación → Vencimiento → Suspensión → Pago → Reactivación

1. **Generación (`php artisan invoices:generate`)**: Crea facturas mensuales para clientes en estado `Activo` usando tarifas `DECIMAL(12,2)`.
2. **Detección de Vencimiento (`php artisan invoices:check-overdue`)**: Marca como `Vencida` toda factura impaga tras su `due_date`.
3. **Suspensión Automática (`php artisan customers:suspend`)**:
   - Verifica periodo de gracia y que el cliente no tenga una `payment_promise` en estado `Pendiente` vigente.
   - Cambia el cliente a `Moroso`/`Suspendido`.
   - Conecta por API a MikroTik (`RouterOSApiDriver`), asigna el perfil `CORTADOS_MOROSOS` / address-list `MOROSOS_ISP` y reinicia la sesión PPPoE activa.
   - Registra el evento en `audit_logs` con `old_values` y `new_values`.
   - Envía notificación de corte por WhatsApp (`WhatsAppProviderInterface`).
4. **Recepción de Pago / OCR y Reactivación (`php artisan customers:reactivate`)**:
   - Si el comprobante llega por WhatsApp/Portal, pasa por OCR quedando en estado `Pendiente de revisión`.
   - Al validar el pago, la factura pasa a `Pagada`, el cliente a `Activo`, se restaura su perfil original en MikroTik, se registra en auditoría y se envía recibo por WhatsApp.

---

## 4. Configuración de Tareas CRON en Linux VPS

```cron
# Generar facturas el día 1 de cada mes a las 00:05
5 0 1 * * /usr/bin/php /var/www/netcore-isp/artisan invoices:generate >> /var/www/netcore-isp/storage/logs/cron.log 2>&1

# Verificar facturas vencidas todos los días a las 01:00
0 1 * * * /usr/bin/php /var/www/netcore-isp/artisan invoices:check-overdue >> /var/www/netcore-isp/storage/logs/cron.log 2>&1

# Ejecutar cortes automáticos a las 02:00 AM
0 2 * * * /usr/bin/php /var/www/netcore-isp/artisan customers:suspend >> /var/www/netcore-isp/storage/logs/cron.log 2>&1

# Sincronizar estado de MikroTik y niveles ópticos OLT cada 5 minutos
*/5 * * * * /usr/bin/php /var/www/netcore-isp/artisan mikrotik:sync >> /var/www/netcore-isp/storage/logs/cron.log 2>&1
*/10 * * * * /usr/bin/php /var/www/netcore-isp/artisan olt:sync >> /var/www/netcore-isp/storage/logs/cron.log 2>&1
```
