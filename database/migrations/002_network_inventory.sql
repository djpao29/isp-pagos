-- ============================================================================
-- MIGRACIÓN 002: MÓDULO DE INVENTARIO DE RED UNIFICADO (AP, CPE, OLT, ROUTER)
-- Motor: MySQL 8.0+ (InnoDB, utf8mb4_unicode_ci)
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `network_inventory` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `isp_id` INT UNSIGNED NOT NULL DEFAULT 1,
    `device_code` VARCHAR(32) NOT NULL COMMENT 'Código interno: AP-001, CPE-104, OLT-01, RTR-01',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre o Hostname del equipo',
    `device_type` ENUM('AP', 'CPE', 'OLT', 'Router', 'PTP', 'Switch') NOT NULL,
    `brand` VARCHAR(80) NOT NULL COMMENT 'Ubiquiti, MikroTik, Cambium, Mimosa, ZTE, Huawei, VSOL, TP-Link',
    `model` VARCHAR(100) NOT NULL COMMENT 'Rocket Prism 5AC, LiteBeam 5AC, CCR2004, ZTE C320, etc.',
    `mac_address` VARCHAR(17) NOT NULL COMMENT 'Formato AA:BB:CC:DD:EE:FF',
    `ip_address` VARCHAR(45) NOT NULL COMMENT 'IPv4 o IPv6 de gestión',
    `frequency_mhz` INT UNSIGNED NULL COMMENT 'Ej: 2412, 5180, 5800 (NULL si es OLT/Router por fibra)',
    `frequency_band` VARCHAR(32) NULL COMMENT '2.4 GHz, 5 GHz, 6 GHz, 60 GHz, Fibra Óptica, Ethernet',
    `ssid` VARCHAR(80) NULL COMMENT 'SSID inalámbrico si es AP, CPE o PTP',
    `channel_width_mhz` SMALLINT UNSIGNED NULL COMMENT '20, 40, 80, 160 MHz',
    `signal_dbm` DECIMAL(5,2) NULL COMMENT 'Nivel de señal RSSI o potencia óptica dBm',
    `firmware_version` VARCHAR(50) NULL,
    `physical_location` VARCHAR(200) NOT NULL COMMENT 'Torre Norte, Nodo Central, Casa Cliente, etc.',
    `gps_lat` DECIMAL(10,7) NOT NULL COMMENT 'Latitud GPS WGS84',
    `gps_lng` DECIMAL(10,7) NOT NULL COMMENT 'Longitud GPS WGS84',
    `customer_id` INT UNSIGNED NULL COMMENT 'Cliente asociado si es un CPE u ONU/Router domiciliario',
    `parent_device_id` INT UNSIGNED NULL COMMENT 'AP u OLT al que se conecta este dispositivo',
    `status` ENUM('online', 'offline', 'warning', 'maintenance') NOT NULL DEFAULT 'online',
    `last_seen_at` DATETIME NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_netinv_isp_mac` (`isp_id`, `mac_address`),
    UNIQUE KEY `uq_netinv_isp_ip` (`isp_id`, `ip_address`),
    INDEX `idx_netinv_type` (`isp_id`, `device_type`),
    INDEX `idx_netinv_brand` (`isp_id`, `brand`),
    INDEX `idx_netinv_customer` (`customer_id`),
    INDEX `idx_netinv_gps` (`gps_lat`, `gps_lng`),
    CONSTRAINT `fk_netinv_isp` FOREIGN KEY (`isp_id`) REFERENCES `isps`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_netinv_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_netinv_parent` FOREIGN KEY (`parent_device_id`) REFERENCES `network_inventory`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos iniciales de demostración para el Inventario de Red
INSERT INTO `network_inventory`
(`isp_id`, `device_code`, `name`, `device_type`, `brand`, `model`, `mac_address`, `ip_address`, `frequency_mhz`, `frequency_band`, `ssid`, `channel_width_mhz`, `signal_dbm`, `firmware_version`, `physical_location`, `gps_lat`, `gps_lng`, `customer_id`, `parent_device_id`, `status`, `notes`)
VALUES
(1, 'RTR-CORE-01', 'MikroTik Core Borde CCR2004', 'Router', 'MikroTik', 'CCR2004-16G-2S+', 'DC:2C:6E:4A:11:01', '10.0.0.1', NULL, 'Fibra / 10GbE', NULL, NULL, NULL, 'RouterOS v7.15.3', 'NOC Central - Rack A1, Gazcue', 18.4718600, -69.9021400, NULL, NULL, 'online', 'Router principal BGP + Concentrador PPPoE'),
(1, 'OLT-ZTE-01', 'OLT ZTE C320 Nodo Centro', 'OLT', 'ZTE', 'ZXA10 C320 GPON', '00:19:C6:88:32:10', '10.0.10.2', NULL, 'Fibra Óptica GPON', NULL, NULL, 4.80, 'V2.1.0', 'NOC Central - Rack A2, Gazcue', 18.4722100, -69.9018500, NULL, 1, 'online', '2 tarjetas GTGH 16 puertos PON c/u'),
(1, 'AP-SECT-01', 'AP Sectorial Norte 120°', 'AP', 'Ubiquiti', 'Rocket Prism 5AC Gen2', '78:8A:20:41:B2:10', '10.10.1.10', 5805, '5 GHz', 'NETCORE-WISP-NORTE-5G', 40, -48.00, 'WA.v8.7.11', 'Torre Telecomunicaciones Piantini (45m)', 18.4789200, -69.9312500, NULL, 1, 'online', 'Sectorial airMAX AC cubriendo Piantini y Naco'),
(1, 'AP-SECT-02', 'AP Sectorial Este Mimosa', 'AP', 'Mimosa', 'A5c 4x4 MIMO', '20:B5:C6:19:44:02', '10.10.1.11', 5240, '5 GHz', 'NETCORE-ULTRA-ESTE', 80, -45.00, '2.8.6.1', 'Torre Ozama - Alma Rosa (36m)', 18.4864000, -69.8562000, NULL, 1, 'online', 'AP alta densidad para planes corporativos WISP'),
(1, 'CPE-CLI-101', 'CPE Carlos Méndez', 'CPE', 'Ubiquiti', 'LiteBeam 5AC Gen2', '78:8A:20:99:C1:44', '10.20.40.101', 5805, '5 GHz', 'NETCORE-WISP-NORTE-5G', 40, -56.00, 'WA.v8.7.11', 'Av. Abraham Lincoln #402, Piantini', 18.4751000, -69.9348000, 1, 3, 'online', 'Alineación óptima a Torre Piantini, CCQ 99%'),
(1, 'CPE-CLI-102', 'CPE Ferretería El Constructor', 'CPE', 'Cambium', 'ePMP Force 300-25', '00:04:56:7E:12:89', '10.20.40.102', 5240, '5 GHz', 'NETCORE-ULTRA-ESTE', 80, -61.00, '4.7.0', 'Carr. Mella Km 7.5, Santo Domingo Este', 18.4912000, -69.8519000, 2, 4, 'warning', 'Señal degradada por vegetación cercana (-61 dBm)');
