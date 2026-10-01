-- ============================================================================
-- NETCORE ISP - SISTEMA INTEGRAL DE GESTIÓN WISP & FTTH (MULTI-TENANT)
-- Motor: MySQL 8.0+ / MariaDB 10.6+ (InnoDB, utf8mb4_unicode_ci)
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. PLANES DE SUSCRIPCIÓN DEL SOFTWARE (SaaS Multi-ISP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_plans` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(32) NOT NULL UNIQUE COMMENT 'FREE_TRIAL, BASIC, PRO, ENTERPRISE',
    `name` VARCHAR(100) NOT NULL,
    `price_monthly` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `trial_days` INT UNSIGNED NOT NULL DEFAULT 7,
    `max_customers` INT UNSIGNED NULL COMMENT 'NULL = ilimitado (ej. durante Trial o Enterprise)',
    `max_routers` INT UNSIGNED NOT NULL DEFAULT 1,
    `max_olts` INT UNSIGNED NOT NULL DEFAULT 1,
    `has_whatsapp` TINYINT(1) NOT NULL DEFAULT 1,
    `has_portal` TINYINT(1) NOT NULL DEFAULT 1,
    `has_ai_assistant` TINYINT(1) NOT NULL DEFAULT 0,
    `has_payment_gateways` TINYINT(1) NOT NULL DEFAULT 1,
    `modules_json` JSON NOT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. EMPRESAS ISP (MULTI-TENANT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `isps` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(32) NOT NULL UNIQUE,
    `name` VARCHAR(150) NOT NULL,
    `legal_name` VARCHAR(200) NULL,
    `tax_id` VARCHAR(50) NULL,
    `logo_url` VARCHAR(255) NULL,
    `domain` VARCHAR(150) NOT NULL UNIQUE,
    `portal_domain` VARCHAR(150) NOT NULL COMMENT 'Ej: clientes.midominio.com',
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `currency_symbol` VARCHAR(6) NOT NULL DEFAULT '$',
    `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 16.00,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/Santo_Domingo',
    `whatsapp_config` JSON NULL COMMENT 'Driver, endpoint, token, phone_number_id',
    `mikrotik_defaults` JSON NULL COMMENT 'Pool morosos, address-list corte, puerto API',
    `payment_config` JSON NULL COMMENT 'PayPal client_id, modo sandbox/live, OCR auto_approve=false',
    `billing_config` JSON NULL COMMENT 'Día corte, días gracia, reactivación automática',
    `status` ENUM('active', 'trial', 'suspended', 'cancelled') NOT NULL DEFAULT 'trial',
    `trial_ends_at` DATETIME NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_isps_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. SUSCRIPCIONES ACTIVAS DE CADA ISP
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscriptions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `subscription_plan_id` INT UNSIGNED NOT NULL,
    `status` ENUM('trialing', 'active', 'past_due', 'cancelled') NOT NULL DEFAULT 'trialing',
    `starts_at` DATETIME NOT NULL,
    `ends_at` DATETIME NOT NULL,
    `trial_ends_at` DATETIME NULL,
    `unlimited_during_trial` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_sub_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sub_plan` FOREIGN KEY (`subscription_plan_id`) REFERENCES `subscription_plans`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. ROLES Y PERMISOS (RBAC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `code` ENUM('SUPERADMIN', 'ADMIN', 'FACTURACION', 'SOPORTE', 'TECNICO', 'COBRANZA') NOT NULL UNIQUE,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(100) NOT NULL UNIQUE,
    `module` VARCHAR(60) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
    `role_id` INT UNSIGNED NOT NULL,
    `permission_id` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`role_id`, `permission_id`),
    CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. USUARIOS ADMINISTRATIVOS Y TÉCNICOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `role_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Argon2id / Bcrypt password_hash()',
    `api_token_hash` CHAR(64) NULL UNIQUE COMMENT 'SHA-256 hash para API REST /api/v1',
    `failed_login_attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `locked_until` DATETIME NULL,
    `last_login_at` DATETIME NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_users_isp_email` (`isp_id`, `email`),
    CONSTRAINT `fk_users_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. ROUTERS MIKROTIK Y CONEXIONES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `routers` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `api_port` SMALLINT UNSIGNED NOT NULL DEFAULT 8728 COMMENT '8728 API, 8729 API-SSL, 443 REST v7',
    `username` VARCHAR(80) NOT NULL,
    `password_encrypted` TEXT NOT NULL COMMENT 'Cifrado AES-256-GCM con APP_KEY',
    `routeros_version` VARCHAR(32) NOT NULL DEFAULT '7.14.2',
    `location` VARCHAR(150) NULL,
    `gps_lat` DECIMAL(10,7) NULL,
    `gps_lng` DECIMAL(10,7) NULL,
    `status` ENUM('online', 'offline', 'warning', 'maintenance') NOT NULL DEFAULT 'online',
    `cpu_load` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `ram_used_mb` INT UNSIGNED NOT NULL DEFAULT 0,
    `ram_total_mb` INT UNSIGNED NOT NULL DEFAULT 1024,
    `uptime` VARCHAR(64) NULL,
    `board_name` VARCHAR(80) NULL,
    `last_connected_at` DATETIME NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_router_isp_ip` (`isp_id`, `ip_address`, `api_port`),
    CONSTRAINT `fk_routers_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `router_connections` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `router_id` INT UNSIGNED NOT NULL,
    `status` ENUM('success', 'failed', 'timeout') NOT NULL,
    `latency_ms` SMALLINT UNSIGNED NULL,
    `cpu_load` TINYINT UNSIGNED NULL,
    `free_memory_mb` INT UNSIGNED NULL,
    `active_pppoe_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `rx_bps` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `tx_bps` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `error_message` VARCHAR(255) NULL,
    `checked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_rc_router_checked` (`router_id`, `checked_at`),
    CONSTRAINT `fk_rc_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. PERFILES MIKROTIK / PCQ Y PLANES DE INTERNET
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mikrotik_profiles` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `router_id` INT UNSIGNED NULL,
    `name` VARCHAR(100) NOT NULL,
    `type` ENUM('PPPoE', 'PCQ', 'HOTSPOT', 'SIMPLE_QUEUE') NOT NULL DEFAULT 'PCQ',
    `rate_down_kbps` INT UNSIGNED NOT NULL,
    `rate_up_kbps` INT UNSIGNED NOT NULL,
    `burst_down_kbps` INT UNSIGNED NOT NULL DEFAULT 0,
    `burst_up_kbps` INT UNSIGNED NOT NULL DEFAULT 0,
    `burst_threshold_kbps` INT UNSIGNED NOT NULL DEFAULT 0,
    `burst_time_sec` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `priority` TINYINT UNSIGNED NOT NULL DEFAULT 8 COMMENT '1 (alta) a 8 (baja)',
    `local_address` VARCHAR(45) NULL,
    `remote_pool` VARCHAR(80) NULL,
    `address_list` VARCHAR(80) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_mkp_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mkp_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plans` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `download_mbps` INT UNSIGNED NOT NULL,
    `upload_mbps` INT UNSIGNED NOT NULL,
    `price_monthly` DECIMAL(12,2) NOT NULL,
    `installation_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `service_type` ENUM('FTTH', 'WISP', 'PPPoE', 'SIMPLE_QUEUE', 'HOTSPOT') NOT NULL DEFAULT 'FTTH',
    `mikrotik_profile` VARCHAR(100) NOT NULL,
    `pcq_profile_id` INT UNSIGNED NULL,
    `vlan_id` SMALLINT UNSIGNED NULL,
    `billing_cycle` ENUM('monthly', 'bimonthly', 'quarterly', 'annual') NOT NULL DEFAULT 'monthly',
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_plan_isp_code` (`isp_id`, `code`),
    CONSTRAINT `fk_plans_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_plans_pcq` FOREIGN KEY (`pcq_profile_id`) REFERENCES `mikrotik_profiles`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. INFRAESTRUCTURA OLT / FTTH (OLT -> SLOT -> PON -> ONU)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `olt` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `brand` ENUM('ZTE', 'Huawei', 'VSOL', 'FiberHome', 'TP-Link', 'C-Data', 'HSGQ', 'Wolck') NOT NULL,
    `model` VARCHAR(80) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `telnet_port` SMALLINT UNSIGNED NOT NULL DEFAULT 23,
    `ssh_port` SMALLINT UNSIGNED NOT NULL DEFAULT 22,
    `snmp_port` SMALLINT UNSIGNED NOT NULL DEFAULT 161,
    `username` VARCHAR(80) NOT NULL,
    `password_encrypted` TEXT NOT NULL,
    `snmp_ro_community` VARCHAR(80) NOT NULL DEFAULT 'public',
    `snmp_rw_community` VARCHAR(80) NULL,
    `driver_class` VARCHAR(120) NOT NULL COMMENT 'Implementación de OLTDriverInterface',
    `location` VARCHAR(150) NULL,
    `gps_lat` DECIMAL(10,7) NULL,
    `gps_lng` DECIMAL(10,7) NULL,
    `status` ENUM('online', 'offline', 'warning') NOT NULL DEFAULT 'online',
    `temperature_c` DECIMAL(4,1) NULL DEFAULT 41.5,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_olt_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `olt_ports` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `olt_id` INT UNSIGNED NOT NULL,
    `slot_number` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `pon_number` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `port_label` VARCHAR(32) NOT NULL COMMENT 'Ej: gpon-olt_1/2/1 o 0/1/0',
    `max_onus` SMALLINT UNSIGNED NOT NULL DEFAULT 128,
    `active_onus` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `tx_power_dbm` DECIMAL(5,2) NOT NULL DEFAULT 4.50,
    `status` ENUM('up', 'down') NOT NULL DEFAULT 'up',
    UNIQUE KEY `uq_olt_slot_pon` (`olt_id`, `slot_number`, `pon_number`),
    CONSTRAINT `fk_olt_ports_olt` FOREIGN KEY (`olt_id`) REFERENCES `olt`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. CLIENTES Y SERVICIOS CONTRATADOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `customer_code` VARCHAR(32) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `document_id` VARCHAR(40) NOT NULL COMMENT 'Cédula / RNC / DNI / NIT',
    `phone` VARCHAR(40) NOT NULL,
    `whatsapp` VARCHAR(40) NOT NULL,
    `email` VARCHAR(150) NULL,
    `portal_password_hash` VARCHAR(255) NULL,
    `address` VARCHAR(255) NOT NULL,
    `province` VARCHAR(80) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `sector` VARCHAR(100) NOT NULL,
    `gps_lat` DECIMAL(10,7) NULL,
    `gps_lng` DECIMAL(10,7) NULL,
    `registered_at` DATE NOT NULL,
    `status` ENUM('Prospecto', 'Instalación pendiente', 'Activo', 'Suspendido', 'Moroso', 'Cancelado') NOT NULL DEFAULT 'Activo',
    `router_id` INT UNSIGNED NULL,
    `plan_id` INT UNSIGNED NULL,
    `ip_address` VARCHAR(45) NULL,
    `mac_address` VARCHAR(17) NULL,
    `pppoe_user` VARCHAR(80) NULL,
    `pppoe_password_encrypted` TEXT NULL,
    `vlan_id` SMALLINT UNSIGNED NULL,
    `olt_id` INT UNSIGNED NULL,
    `pon_port` VARCHAR(32) NULL,
    `onu_serial` VARCHAR(64) NULL,
    `nap_box` VARCHAR(64) NULL,
    `wifi_ssid` VARCHAR(64) NULL,
    `wifi_password_encrypted` TEXT NULL,
    `billing_day` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_customer_isp_code` (`isp_id`, `customer_code`),
    INDEX `idx_customers_status` (`isp_id`, `status`),
    INDEX `idx_customers_doc` (`isp_id`, `document_id`),
    CONSTRAINT `fk_cust_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cust_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_cust_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_cust_olt` FOREIGN KEY (`olt_id`) REFERENCES `olt`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_services` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `customer_id` INT UNSIGNED NOT NULL,
    `plan_id` INT UNSIGNED NOT NULL,
    `router_id` INT UNSIGNED NOT NULL,
    `connection_type` ENUM('PPPoE', 'SIMPLE_QUEUE', 'HOTSPOT', 'DHCP_LEASE') NOT NULL DEFAULT 'PPPoE',
    `ipv4_address` VARCHAR(45) NOT NULL,
    `mac_address` VARCHAR(17) NULL,
    `status` ENUM('active', 'suspended', 'cancelled') NOT NULL DEFAULT 'active',
    `installed_at` DATE NULL,
    `suspended_at` DATETIME NULL,
    `reactivated_at` DATETIME NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_cs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cs_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`),
    CONSTRAINT `fk_cs_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. ONUs FTTH
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `onus` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `olt_id` INT UNSIGNED NOT NULL,
    `olt_port_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NULL,
    `onu_index` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    `serial_number` VARCHAR(64) NOT NULL,
    `mac_address` VARCHAR(17) NULL,
    `brand_model` VARCHAR(80) NOT NULL DEFAULT 'ZTE F670L',
    `rx_power_dbm` DECIMAL(5,2) NOT NULL COMMENT 'Ej: -19.40 dBm',
    `tx_power_dbm` DECIMAL(5,2) NOT NULL DEFAULT 2.10,
    `distance_m` INT UNSIGNED NULL DEFAULT 850,
    `vlan_id` SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    `status` ENUM('authorized', 'unconfigured', 'los', 'dying_gasp', 'offline') NOT NULL DEFAULT 'authorized',
    `last_polled_at` DATETIME NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_onu_olt_serial` (`olt_id`, `serial_number`),
    CONSTRAINT `fk_onus_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_onus_olt` FOREIGN KEY (`olt_id`) REFERENCES `olt`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_onus_port` FOREIGN KEY (`olt_port_id`) REFERENCES `olt_ports`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_onus_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. PPPoE USERS, SIMPLE QUEUES Y HOTSPOT USERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pppoe_users` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `router_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `username` VARCHAR(80) NOT NULL,
    `password_encrypted` TEXT NOT NULL,
    `profile_name` VARCHAR(80) NOT NULL,
    `remote_address` VARCHAR(45) NULL,
    `caller_id_mac` VARCHAR(17) NULL,
    `is_online` TINYINT(1) NOT NULL DEFAULT 1,
    `uptime` VARCHAR(64) NULL,
    `rx_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `tx_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `current_rx_Mbps` DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    `current_tx_Mbps` DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    `status` ENUM('enabled', 'disabled', 'suspended_pool') NOT NULL DEFAULT 'enabled',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_pppoe_router_user` (`router_id`, `username`),
    CONSTRAINT `fk_pppoe_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pppoe_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pppoe_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mikrotik_queues` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `router_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `plan_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `target_ip` VARCHAR(45) NOT NULL COMMENT 'Ej: 10.20.30.15/32',
    `max_limit_up` VARCHAR(20) NOT NULL COMMENT 'Ej: 50M',
    `max_limit_down` VARCHAR(20) NOT NULL COMMENT 'Ej: 100M',
    `burst_limit` VARCHAR(40) NULL,
    `priority` VARCHAR(10) NOT NULL DEFAULT '8/8',
    `rx_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `tx_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_mkq_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mkq_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mkq_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mkq_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hotspot_users` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `router_id` INT UNSIGNED NOT NULL,
    `username` VARCHAR(80) NOT NULL,
    `password_encrypted` TEXT NOT NULL,
    `profile` VARCHAR(80) NOT NULL,
    `limit_uptime` VARCHAR(32) NULL COMMENT 'Ej: 30d, 24h',
    `rate_limit` VARCHAR(32) NOT NULL COMMENT 'Ej: 10M/20M',
    `uptime_used` VARCHAR(32) NOT NULL DEFAULT '00:00:00',
    `bytes_in` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `bytes_out` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `expires_at` DATETIME NULL,
    `is_active_session` TINYINT(1) NOT NULL DEFAULT 0,
    `status` ENUM('active', 'expired', 'suspended') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_hs_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_hs_router` FOREIGN KEY (`router_id`) REFERENCES `routers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. FACTURACIÓN, PAGOS, COMPROBANTES OCR Y PROMESAS DE PAGO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `invoice_number` VARCHAR(40) NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `plan_id` INT UNSIGNED NULL,
    `issue_date` DATE NOT NULL,
    `due_date` DATE NOT NULL,
    `concept` VARCHAR(200) NOT NULL,
    `subtotal` DECIMAL(12,2) NOT NULL,
    `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `total` DECIMAL(12,2) NOT NULL,
    `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `status` ENUM('Pendiente', 'Pagada', 'Vencida', 'Anulada', 'Parcial') NOT NULL DEFAULT 'Pendiente',
    `preferred_payment_method` VARCHAR(40) NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_invoice_isp_number` (`isp_id`, `invoice_number`),
    INDEX `idx_invoices_status_due` (`isp_id`, `status`, `due_date`),
    CONSTRAINT `fk_inv_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inv_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inv_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoice_items` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `invoice_id` INT UNSIGNED NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `quantity` DECIMAL(8,2) NOT NULL DEFAULT 1.00,
    `unit_price` DECIMAL(12,2) NOT NULL,
    `line_total` DECIMAL(12,2) NOT NULL,
    CONSTRAINT `fk_ii_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bank_accounts` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `bank_name` VARCHAR(100) NOT NULL,
    `account_label` VARCHAR(100) NOT NULL,
    `account_number` VARCHAR(60) NOT NULL,
    `account_type` ENUM('Corriente', 'Ahorros', 'Recaudadora') NOT NULL DEFAULT 'Corriente',
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `holder_name` VARCHAR(150) NOT NULL,
    `holder_tax_id` VARCHAR(50) NULL,
    `status` ENUM('Activa', 'Inactiva') NOT NULL DEFAULT 'Activa',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ba_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `receipt_number` VARCHAR(40) NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `invoice_id` INT UNSIGNED NOT NULL,
    `paid_at` DATETIME NOT NULL,
    `amount` DECIMAL(12,2) NOT NULL,
    `method` ENUM('Efectivo', 'Transferencia', 'Depósito', 'Tarjeta', 'PayPal', 'Otros') NOT NULL,
    `reference` VARCHAR(100) NULL,
    `bank_account_id` INT UNSIGNED NULL,
    `proof_file_path` VARCHAR(255) NULL,
    `registered_by_user_id` INT UNSIGNED NULL,
    `validation_status` ENUM('Validado', 'Pendiente de revisión', 'Rechazado') NOT NULL DEFAULT 'Validado',
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_payment_isp_receipt` (`isp_id`, `receipt_number`),
    INDEX `idx_payments_paid_at` (`isp_id`, `paid_at`),
    CONSTRAINT `fk_pay_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pay_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pay_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pay_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_pay_user` FOREIGN KEY (`registered_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_proofs` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `invoice_id` INT UNSIGNED NULL,
    `payment_id` INT UNSIGNED NULL,
    `source_channel` ENUM('WhatsApp', 'Portal Cliente', 'Oficina') NOT NULL DEFAULT 'WhatsApp',
    `file_path` VARCHAR(255) NOT NULL,
    `ocr_extracted_bank` VARCHAR(100) NULL,
    `ocr_extracted_date` DATE NULL,
    `ocr_extracted_amount` DECIMAL(12,2) NULL,
    `ocr_extracted_reference` VARCHAR(100) NULL,
    `ocr_confidence` DECIMAL(5,2) NULL DEFAULT 94.50,
    `ocr_raw_json` JSON NULL,
    `status` ENUM('Pendiente de revisión', 'Aprobado', 'Rechazado') NOT NULL DEFAULT 'Pendiente de revisión',
    `reviewed_by_user_id` INT UNSIGNED NULL,
    `reviewed_at` DATETIME NULL,
    `rejection_reason` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_pp_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pp_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pp_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_pp_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_promises` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `invoice_id` INT UNSIGNED NOT NULL,
    `promised_date` DATE NOT NULL,
    `amount` DECIMAL(12,2) NOT NULL,
    `comment` VARCHAR(255) NULL,
    `created_by_user_id` INT UNSIGNED NULL,
    `status` ENUM('Pendiente', 'Cumplida', 'Incumplida', 'Cancelada') NOT NULL DEFAULT 'Pendiente',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_prom_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_prom_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_prom_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_prom_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. TICKETS DE SOPORTE E INSTALACIONES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tickets` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `ticket_number` VARCHAR(32) NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `subject` VARCHAR(180) NOT NULL,
    `description` TEXT NOT NULL,
    `category` ENUM('Sin conexión', 'Lentitud / Intermitencia', 'Cambio clave WiFi', 'Traslado de domicilio', 'Facturación', 'Corte fibra / LOS') NOT NULL,
    `priority` ENUM('Baja', 'Media', 'Alta', 'Crítica') NOT NULL DEFAULT 'Media',
    `status` ENUM('Abierto', 'En proceso', 'Esperando cliente', 'Resuelto', 'Cerrado') NOT NULL DEFAULT 'Abierto',
    `assigned_technician_id` INT UNSIGNED NULL,
    `opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `resolved_at` DATETIME NULL,
    UNIQUE KEY `uq_ticket_isp_num` (`isp_id`, `ticket_number`),
    CONSTRAINT `fk_tkt_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_tkt_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_tkt_tech` FOREIGN KEY (`assigned_technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_messages` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `ticket_id` INT UNSIGNED NOT NULL,
    `author_type` ENUM('user', 'customer', 'system') NOT NULL DEFAULT 'user',
    `author_name` VARCHAR(120) NOT NULL,
    `message` TEXT NOT NULL,
    `is_internal_note` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_tm_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `installations` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `plan_id` INT UNSIGNED NOT NULL,
    `technician_id` INT UNSIGNED NULL,
    `scheduled_date` DATETIME NOT NULL,
    `completed_date` DATETIME NULL,
    `nap_box` VARCHAR(64) NULL,
    `fiber_meters_used` SMALLINT UNSIGNED DEFAULT 0,
    `onu_serial` VARCHAR(64) NULL,
    `status` ENUM('Programada', 'En ruta', 'Completada', 'Cancelada') NOT NULL DEFAULT 'Programada',
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_inst_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inst_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inst_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. ANTENAS, RED INALÁMBRICA, ENLACES, CAJAS NAP Y MAPAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `antennas` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `device_role` ENUM('AP', 'CPE', 'Radio', 'PTP', 'PTMP') NOT NULL,
    `brand` VARCHAR(60) NOT NULL COMMENT 'Ubiquiti, Cambium, Mimosa, MikroTik',
    `model` VARCHAR(80) NOT NULL,
    `mac_address` VARCHAR(17) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `frequency_mhz` SMALLINT UNSIGNED NOT NULL DEFAULT 5800,
    `ssid` VARCHAR(80) NOT NULL,
    `signal_dbm` DECIMAL(5,2) NULL DEFAULT -54.00,
    `ccq_percent` TINYINT UNSIGNED NULL DEFAULT 98,
    `location` VARCHAR(150) NOT NULL,
    `gps_lat` DECIMAL(10,7) NOT NULL,
    `gps_lng` DECIMAL(10,7) NOT NULL,
    `customer_id` INT UNSIGNED NULL,
    `status` ENUM('online', 'offline', 'degraded') NOT NULL DEFAULT 'online',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ant_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ant_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `network_devices` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `device_type` ENUM('NAP', 'SWITCH', 'SPLITTER', 'MANGA_EMPALME', 'TORRE') NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `ports_total` SMALLINT UNSIGNED NOT NULL DEFAULT 16,
    `ports_used` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `olt_id` INT UNSIGNED NULL,
    `pon_port` VARCHAR(32) NULL,
    `location` VARCHAR(150) NOT NULL,
    `gps_lat` DECIMAL(10,7) NOT NULL,
    `gps_lng` DECIMAL(10,7) NOT NULL,
    `status` ENUM('Operativo', 'Saturado', 'Averiado') NOT NULL DEFAULT 'Operativo',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_nd_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `links` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `link_type` ENUM('FIBER_TRUNK', 'FIBER_DROP', 'PTP_WIRELESS') NOT NULL,
    `from_lat` DECIMAL(10,7) NOT NULL,
    `from_lng` DECIMAL(10,7) NOT NULL,
    `to_lat` DECIMAL(10,7) NOT NULL,
    `to_lng` DECIMAL(10,7) NOT NULL,
    `capacity_mbps` INT UNSIGNED NOT NULL DEFAULT 1000,
    `status` ENUM('up', 'down') NOT NULL DEFAULT 'up',
    CONSTRAINT `fk_links_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maps` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `center_lat` DECIMAL(10,7) NOT NULL,
    `center_lng` DECIMAL(10,7) NOT NULL,
    `default_zoom` TINYINT UNSIGNED NOT NULL DEFAULT 14,
    `tile_provider` VARCHAR(255) NOT NULL DEFAULT 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    CONSTRAINT `fk_maps_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. WHATSAPP, NOTIFICACIONES, CAMBIO WIFI Y AUDITORÍA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `whatsapp_templates` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `event_trigger` ENUM('invoice_created', 'invoice_due_soon', 'invoice_overdue', 'service_suspended', 'payment_received', 'payment_approved', 'ticket_update') NOT NULL,
    `body_template` TEXT NOT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY `uq_wt_isp_code` (`isp_id`, `code`),
    CONSTRAINT `fk_wt_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_messages` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NULL,
    `direction` ENUM('outbound', 'inbound') NOT NULL DEFAULT 'outbound',
    `phone_number` VARCHAR(40) NOT NULL,
    `template_code` VARCHAR(50) NULL,
    `message_body` TEXT NOT NULL,
    `media_url` VARCHAR(255) NULL,
    `provider_name` VARCHAR(50) NOT NULL DEFAULT 'MetaCloudAPI',
    `provider_message_id` VARCHAR(120) NULL,
    `status` ENUM('queued', 'sent', 'delivered', 'read', 'failed') NOT NULL DEFAULT 'delivered',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_wm_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_wm_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `channel` ENUM('whatsapp', 'email', 'internal', 'sms') NOT NULL,
    `event_type` VARCHAR(60) NOT NULL,
    `recipient` VARCHAR(150) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `body` TEXT NOT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_notif_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wifi_change_requests` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `new_ssid` VARCHAR(64) NOT NULL,
    `new_password_encrypted` TEXT NOT NULL,
    `status` ENUM('Pendiente', 'Aplicado en ONU/TR-069', 'Rechazado') NOT NULL DEFAULT 'Pendiente',
    `requested_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `processed_at` DATETIME NULL,
    CONSTRAINT `fk_wifi_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `user_id` INT UNSIGNED NULL,
    `user_name` VARCHAR(120) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `action` VARCHAR(80) NOT NULL COMMENT 'LOGIN, LOGOUT, CREATE, UPDATE, DELETE, SUSPEND, REACTIVATE, MIKROTIK_CMD, OLT_CMD',
    `module` VARCHAR(60) NOT NULL,
    `record_id` VARCHAR(64) NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_audit_isp_date` (`isp_id`, `created_at`),
    CONSTRAINT `fk_audit_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. ASISTENTE IA Y CONFIGURACIONES GENERALES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_conversations` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `user_id` INT UNSIGNED NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_aic_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_messages` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `conversation_id` INT UNSIGNED NOT NULL,
    `role` ENUM('user', 'assistant', 'tool') NOT NULL,
    `content` TEXT NOT NULL,
    `tool_calls_json` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_aim_conv` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL,
    `setting_key` VARCHAR(100) NOT NULL,
    `setting_value` TEXT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_settings_isp_key` (`isp_id`, `setting_key`),
    CONSTRAINT `fk_set_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
