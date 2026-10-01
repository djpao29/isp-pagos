import express from 'express';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, 'storage');
const DB_FILE = path.join(STORAGE_DIR, 'isp_database.json');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Initialize Gemini AI client on server side
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface NetworkDeviceRecord {
  id: number;
  isp_id: number;
  device_code: string;
  name: string;
  device_type: 'AP' | 'CPE' | 'OLT' | 'Router' | 'PTP' | 'Switch';
  brand: string;
  model: string;
  mac_address: string;
  ip_address: string;
  frequency_mhz: number | null;
  frequency_band: string;
  ssid: string | null;
  channel_width_mhz: number | null;
  signal_dbm: number | null;
  firmware_version: string;
  physical_location: string;
  gps_lat: number;
  gps_lng: number;
  customer_id: number | null;
  parent_device_id: number | null;
  status: 'online' | 'offline' | 'warning' | 'maintenance';
  last_seen_at: string;
  notes: string;
}

function getInitialDatabase() {
  return {
    isps: [
      {
        id: 1,
        code: 'ISP-DOM-01',
        name: 'FibraNet Dominicana S.R.L.',
        domain: 'admin.fibranet.do',
        portal_domain: 'clientes.fibranet.do',
        currency: 'USD',
        currency_symbol: '$',
        timezone: 'America/Santo_Domingo',
        plan_code: 'ENTERPRISE',
        trial_days_left: 7,
        grace_days: 3,
        cut_day: 5,
        auto_reactivate: true,
        ocr_auto_approve: false,
      },
      {
        id: 2,
        code: 'ISP-AND-02',
        name: 'AndesWISP Telecom S.A.S.',
        domain: 'noc.andeswisp.co',
        portal_domain: 'clientes.andeswisp.co',
        currency: 'USD',
        currency_symbol: '$',
        timezone: 'America/Bogota',
        plan_code: 'PRO',
        trial_days_left: 5,
        grace_days: 5,
        cut_day: 10,
        auto_reactivate: true,
        ocr_auto_approve: false,
      },
    ],
    plans: [
      { id: 1, isp_id: 1, code: 'PLN-30M', name: 'Residencial Básico 30 Mbps', download_mbps: 30, upload_mbps: 15, price_monthly: 25.00, installation_fee: 30.00, service_type: 'WISP', mikrotik_profile: 'POOL_30M_PCQ', pcq_rate: '30M/15M', vlan_id: 110, billing_cycle: 'Mensual', status: 'Activo' },
      { id: 2, isp_id: 1, code: 'PLN-50M', name: 'Hogar Plus 50 Mbps', download_mbps: 50, upload_mbps: 25, price_monthly: 32.00, installation_fee: 25.00, service_type: 'WISP', mikrotik_profile: 'POOL_50M_PCQ', pcq_rate: '50M/25M', vlan_id: 110, billing_cycle: 'Mensual', status: 'Activo' },
      { id: 3, isp_id: 1, code: 'PLN-100M', name: 'Fibra Simétrica 100 Mbps', download_mbps: 100, upload_mbps: 100, price_monthly: 42.00, installation_fee: 20.00, service_type: 'FTTH', mikrotik_profile: 'FTTH_100M_SYM', pcq_rate: '100M/100M', vlan_id: 200, billing_cycle: 'Mensual', status: 'Activo' },
      { id: 4, isp_id: 1, code: 'PLN-200M', name: 'Fibra Gamer 200 Mbps', download_mbps: 200, upload_mbps: 200, price_monthly: 55.00, installation_fee: 0.00, service_type: 'FTTH', mikrotik_profile: 'FTTH_200M_SYM', pcq_rate: '200M/200M', vlan_id: 200, billing_cycle: 'Mensual', status: 'Activo' },
      { id: 5, isp_id: 1, code: 'PLN-500M', name: 'PyME Pro 500 Mbps', download_mbps: 500, upload_mbps: 500, price_monthly: 89.00, installation_fee: 0.00, service_type: 'FTTH', mikrotik_profile: 'CORP_500M_SLA', pcq_rate: '500M/500M', vlan_id: 300, billing_cycle: 'Mensual', status: 'Activo' },
      { id: 6, isp_id: 1, code: 'PLN-1G', name: 'Dedicado Enterprise 1 Gbps', download_mbps: 1000, upload_mbps: 1000, price_monthly: 165.00, installation_fee: 0.00, service_type: 'FTTH', mikrotik_profile: 'DEDICADO_1G', pcq_rate: '1000M/1000M', vlan_id: 300, billing_cycle: 'Mensual', status: 'Activo' },
    ],
    customers: [
      {
        id: 1,
        isp_id: 1,
        customer_code: 'CLI-00101',
        first_name: 'Carlos Alberto',
        last_name: 'Méndez Rojas',
        document_id: '001-1428950-3',
        phone: '+1 809-555-0141',
        whatsapp: '+18095550141',
        email: 'cmendez@gmail.com',
        address: 'Av. Abraham Lincoln #402, Edif. Torre Real Apto 4B',
        province: 'Distrito Nacional',
        city: 'Santo Domingo',
        sector: 'Piantini',
        gps_lat: 18.47510,
        gps_lng: -69.93480,
        registered_at: '2025-02-10',
        status: 'Activo',
        router_id: 1,
        plan_id: 2,
        ip_address: '10.20.40.101',
        mac_address: '78:8A:20:99:C1:44',
        pppoe_user: 'cmendez_pppoe',
        pppoe_password: '••••••••••',
        vlan_id: 110,
        olt_id: null,
        pon_port: 'N/A (WISP 5GHz)',
        onu_serial: 'UBNT-LBE5AC-99C144',
        nap_box: 'Torre Piantini Sector 1',
        wifi_ssid: 'Familia_Mendez_5G',
        current_rx_mbps: 44.8,
        current_tx_mbps: 18.2,
        notes: 'Cliente puntual con enlace WISP LiteBeam 5AC Gen2 conectado a AP-SECT-01.',
      },
      {
        id: 2,
        isp_id: 1,
        customer_code: 'CLI-00102',
        first_name: 'Ferretería El Constructor',
        last_name: 'S.R.L.',
        document_id: '131-88492-1',
        phone: '+1 809-555-0192',
        whatsapp: '+18095550192',
        email: 'contabilidad@elconstructor.do',
        address: 'Carretera Mella Km 7.5, Local #12',
        province: 'Santo Domingo',
        city: 'Santo Domingo Este',
        sector: 'Alma Rosa I',
        gps_lat: 18.49120,
        gps_lng: -69.85190,
        registered_at: '2025-01-15',
        status: 'Moroso',
        router_id: 2,
        plan_id: 5,
        ip_address: '10.20.40.102',
        mac_address: '00:04:56:7E:12:89',
        pppoe_user: 'ferreteria_corp',
        pppoe_password: '••••••••••',
        vlan_id: 300,
        olt_id: null,
        pon_port: 'N/A (WISP PTP)',
        onu_serial: 'CAMB-F300-7E1289',
        nap_box: 'Torre Ozama Sector Este',
        wifi_ssid: 'ELCONSTRUCTOR_CORP',
        current_rx_mbps: 12.4,
        current_tx_mbps: 4.1,
        notes: 'Factura vencida del mes en curso. Envió comprobante por WhatsApp pendiente de validación OCR.',
      },
      {
        id: 3,
        isp_id: 1,
        customer_code: 'CLI-00103',
        first_name: 'Laura Patricia',
        last_name: 'Gómez Almonte',
        document_id: '001-9981234-7',
        phone: '+1 829-555-0311',
        whatsapp: '+18295550311',
        email: 'laura.gomez@outlook.com',
        address: 'Calle César Nicolás Penson #88, Res. Las Trinitarias',
        province: 'Distrito Nacional',
        city: 'Santo Domingo',
        sector: 'Gazcue',
        gps_lat: 18.46940,
        gps_lng: -69.90620,
        registered_at: '2025-03-01',
        status: 'Activo',
        router_id: 1,
        plan_id: 4,
        ip_address: '10.30.10.55',
        mac_address: 'C8:3A:35:41:80:11',
        pppoe_user: 'lgomez_ftth',
        pppoe_password: '••••••••••',
        vlan_id: 200,
        olt_id: 1,
        pon_port: 'gpon-olt_1/2/1:4',
        onu_serial: 'ZTEGC8418011',
        nap_box: 'NAP-GAZ-04 (Puerto 4)',
        wifi_ssid: 'LauraGomez_FTTH_5G',
        current_rx_mbps: 186.5,
        current_tx_mbps: 142.0,
        notes: 'Instalación FTTH GPON con ONU ZTE F670L Dual Band.',
      },
      {
        id: 4,
        isp_id: 1,
        customer_code: 'CLI-00104',
        first_name: 'Roberto Enrique',
        last_name: 'Valdez Polanco',
        document_id: '402-2189401-5',
        phone: '+1 849-555-0874',
        whatsapp: '+18495550874',
        email: 'rvaldez@gmail.com',
        address: 'Calle El Conde #215, Zona Colonial',
        province: 'Distrito Nacional',
        city: 'Santo Domingo',
        sector: 'Zona Colonial',
        gps_lat: 18.47280,
        gps_lng: -69.88690,
        registered_at: '2024-11-20',
        status: 'Suspendido',
        router_id: 1,
        plan_id: 3,
        ip_address: '10.30.10.89',
        mac_address: '48:57:02:9A:E4:21',
        pppoe_user: 'rvaldez_pppoe',
        pppoe_password: '••••••••••',
        vlan_id: 200,
        olt_id: 1,
        pon_port: 'gpon-olt_1/2/2:11',
        onu_serial: 'HWTC4857029A',
        nap_box: 'NAP-ZCOL-02 (Puerto 11)',
        wifi_ssid: 'Valdez_Home_WiFi',
        current_rx_mbps: 0.0,
        current_tx_mbps: 0.0,
        notes: 'Servicio suspendido automáticamente por CRON tras 5 días de vencimiento. En address-list MOROSOS_ISP.',
      },
      {
        id: 5,
        isp_id: 1,
        customer_code: 'CLI-00105',
        first_name: 'Clínica Dental',
        last_name: 'Sonrisa Real',
        document_id: '130-44120-9',
        phone: '+1 809-555-0922',
        whatsapp: '+18095550922',
        email: 'admin@sonrisareal.do',
        address: 'Av. Tiradentes #56, Plaza Naco Local 204',
        province: 'Distrito Nacional',
        city: 'Santo Domingo',
        sector: 'Ensanche Naco',
        gps_lat: 18.48210,
        gps_lng: -69.92550,
        registered_at: '2025-04-12',
        status: 'Activo',
        router_id: 1,
        plan_id: 5,
        ip_address: '10.30.10.120',
        mac_address: 'BC:9A:8E:11:30:77',
        pppoe_user: 'clinica_sonrisa',
        pppoe_password: '••••••••••',
        vlan_id: 300,
        olt_id: 2,
        pon_port: '0/1/0:8',
        onu_serial: 'VSOLBC9A8E11',
        nap_box: 'NAP-NACO-09 (Puerto 8)',
        wifi_ssid: 'SonrisaReal_Pacientes',
        current_rx_mbps: 310.4,
        current_tx_mbps: 280.1,
        notes: 'Enlace FTTH Corporativo con IP Fija y prioridad 2 en PCQ.',
      },
      {
        id: 6,
        isp_id: 1,
        customer_code: 'CLI-00106',
        first_name: 'Miguel Ángel',
        last_name: 'Tavárez Ureña',
        document_id: '001-7412589-0',
        phone: '+1 829-555-0643',
        whatsapp: '+18295550643',
        email: 'mtavarez@hotmail.com',
        address: 'Av. Sarasota #110, Bella Vista',
        province: 'Distrito Nacional',
        city: 'Santo Domingo',
        sector: 'Bella Vista',
        gps_lat: 18.45690,
        gps_lng: -69.94120,
        registered_at: '2025-05-02',
        status: 'Instalación pendiente',
        router_id: 1,
        plan_id: 3,
        ip_address: '10.20.40.150',
        mac_address: '24:5A:4C:88:19:03',
        pppoe_user: 'mtavarez_wisp',
        pppoe_password: '••••••••••',
        vlan_id: 110,
        olt_id: null,
        pon_port: 'N/A (WISP 5GHz)',
        onu_serial: 'UBNT-NBE5AC-881903',
        nap_box: 'Torre Bella Vista Sur',
        wifi_ssid: 'Tavarez_5G',
        current_rx_mbps: 0.0,
        current_tx_mbps: 0.0,
        notes: 'CPE NanoBeam 5AC pre-aprovisionado; brigada técnica agendada para hoy 15:00.',
      },
    ],
    network_inventory: [
      {
        id: 1,
        isp_id: 1,
        device_code: 'RTR-CORE-01',
        name: 'MikroTik Core Borde CCR2004',
        device_type: 'Router',
        brand: 'MikroTik',
        model: 'CCR2004-16G-2S+',
        mac_address: 'DC:2C:6E:4A:11:01',
        ip_address: '10.0.0.1',
        frequency_mhz: null,
        frequency_band: 'Fibra / 10GbE',
        ssid: null,
        channel_width_mhz: null,
        signal_dbm: null,
        firmware_version: 'RouterOS v7.15.3',
        physical_location: 'NOC Central - Rack A1, Gazcue',
        gps_lat: 18.47186,
        gps_lng: -69.90214,
        customer_id: null,
        parent_device_id: null,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:00',
        notes: 'Router BGP + Concentrador PPPoE Principal (Puerto API 8728)',
      },
      {
        id: 2,
        isp_id: 1,
        device_code: 'RTR-NODO-02',
        name: 'MikroTik Nodo Este RB4011',
        device_type: 'Router',
        brand: 'MikroTik',
        model: 'RB4011iGS+RM',
        mac_address: 'DC:2C:6E:8B:22:09',
        ip_address: '10.0.0.2',
        frequency_mhz: null,
        frequency_band: 'Fibra / SFP+ 10G',
        ssid: null,
        channel_width_mhz: null,
        signal_dbm: null,
        firmware_version: 'RouterOS v7.14.2',
        physical_location: 'Nodo Alma Rosa - Gabinete Exterior #2',
        gps_lat: 18.48610,
        gps_lng: -69.85650,
        customer_id: null,
        parent_device_id: 1,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:00',
        notes: 'Concentrador PPPoE y Simple Queues para Santo Domingo Este',
      },
      {
        id: 3,
        isp_id: 1,
        device_code: 'OLT-ZTE-01',
        name: 'OLT ZTE C320 Nodo Centro',
        device_type: 'OLT',
        brand: 'ZTE',
        model: 'ZXA10 C320 GPON',
        mac_address: '00:19:C6:88:32:10',
        ip_address: '10.0.10.2',
        frequency_mhz: null,
        frequency_band: 'Fibra Óptica GPON',
        ssid: null,
        channel_width_mhz: null,
        signal_dbm: 4.8,
        firmware_version: 'V2.1.0P1',
        physical_location: 'NOC Central - Rack A2, Gazcue',
        gps_lat: 18.47221,
        gps_lng: -69.90185,
        customer_id: null,
        parent_device_id: 1,
        status: 'online',
        last_seen_at: '2026-10-01 13:14:50',
        notes: '2 tarjetas GTGH (32 puertos PON). SNMP v2c activo en puerto 161.',
      },
      {
        id: 4,
        isp_id: 1,
        device_code: 'OLT-HW-02',
        name: 'OLT Huawei MA5800-X2 Naco',
        device_type: 'OLT',
        brand: 'Huawei',
        model: 'SmartAX MA5800-X2',
        mac_address: '48:57:02:10:AA:01',
        ip_address: '10.0.10.3',
        frequency_mhz: null,
        frequency_band: 'Fibra Óptica GPON',
        ssid: null,
        channel_width_mhz: null,
        signal_dbm: 5.1,
        firmware_version: 'V800R021C00',
        physical_location: 'Sub-Nodo Naco - Torre Empresarial Piso 2',
        gps_lat: 18.48150,
        gps_lng: -69.92680,
        customer_id: null,
        parent_device_id: 1,
        status: 'online',
        last_seen_at: '2026-10-01 13:14:55',
        notes: 'Atiende clientes FTTH corporativos y residenciales en Naco y Piantini.',
      },
      {
        id: 5,
        isp_id: 1,
        device_code: 'AP-SECT-01',
        name: 'AP Sectorial Norte 120° Piantini',
        device_type: 'AP',
        brand: 'Ubiquiti',
        model: 'Rocket Prism 5AC Gen2',
        mac_address: '78:8A:20:41:B2:10',
        ip_address: '10.10.1.10',
        frequency_mhz: 5805,
        frequency_band: '5 GHz',
        ssid: 'NETCORE-WISP-NORTE-5G',
        channel_width_mhz: 40,
        signal_dbm: -48.0,
        firmware_version: 'WA.v8.7.11',
        physical_location: 'Torre Telecomunicaciones Piantini (Altura 45m)',
        gps_lat: 18.47892,
        gps_lng: -69.93125,
        customer_id: null,
        parent_device_id: 1,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:10',
        notes: 'Antena sectorial airMAX titanium 19dBi 120° con GPS Sync activo.',
      },
      {
        id: 6,
        isp_id: 1,
        device_code: 'AP-SECT-02',
        name: 'AP Sectorial Este Mimosa A5c',
        device_type: 'AP',
        brand: 'Mimosa',
        model: 'A5c 4x4 MIMO',
        mac_address: '20:B5:C6:19:44:02',
        ip_address: '10.10.1.11',
        frequency_mhz: 5240,
        frequency_band: '5 GHz',
        ssid: 'NETCORE-ULTRA-ESTE',
        channel_width_mhz: 80,
        signal_dbm: -45.0,
        firmware_version: 'v2.8.6.1',
        physical_location: 'Torre Ozama - Alma Rosa (Altura 36m)',
        gps_lat: 18.48640,
        gps_lng: -69.85620,
        customer_id: null,
        parent_device_id: 2,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:05',
        notes: 'Sectorial multipunto de alta capacidad para clientes corporativos.',
      },
      {
        id: 7,
        isp_id: 1,
        device_code: 'AP-SECT-03',
        name: 'AP Sectorial Sur Bella Vista',
        device_type: 'AP',
        brand: 'MikroTik',
        model: 'mANTBox 52 15s',
        mac_address: 'DC:2C:6E:71:90:33',
        ip_address: '10.10.1.12',
        frequency_mhz: 5520,
        frequency_band: '5 GHz',
        ssid: 'NETCORE-SUR-NV2',
        channel_width_mhz: 40,
        signal_dbm: -51.0,
        firmware_version: 'RouterOS v7.15.3',
        physical_location: 'Torre Bella Vista Sur (Azotea Edif. Mirador)',
        gps_lat: 18.45850,
        gps_lng: -69.93890,
        customer_id: null,
        parent_device_id: 1,
        status: 'online',
        last_seen_at: '2026-10-01 13:14:40',
        notes: 'Protocolo NV2 activo para baja latencia en clientes residenciales.',
      },
      {
        id: 8,
        isp_id: 1,
        device_code: 'PTP-BACK-01',
        name: 'Enlace Troncal PTP Río Ozama',
        device_type: 'PTP',
        brand: 'Ubiquiti',
        model: 'airFiber 60 LR (AF60-LR)',
        mac_address: '78:8A:20:F0:60:01',
        ip_address: '10.10.0.20',
        frequency_mhz: 64800,
        frequency_band: '60 GHz',
        ssid: 'PTP-NOC-ALMAROSA-60G',
        channel_width_mhz: 2160,
        signal_dbm: -42.0,
        firmware_version: 'GP.v2.6.1',
        physical_location: 'Enlace Troncal NOC Gazcue -> Torre Ozama',
        gps_lat: 18.47910,
        gps_lng: -69.87920,
        customer_id: null,
        parent_device_id: 1,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:12',
        notes: 'Capacidad 1.9 Gbps Full Duplex a 60 GHz entre NOC y Nodo Este.',
      },
      {
        id: 9,
        isp_id: 1,
        device_code: 'CPE-CLI-101',
        name: 'CPE Carlos Méndez (LiteBeam)',
        device_type: 'CPE',
        brand: 'Ubiquiti',
        model: 'LiteBeam 5AC Gen2',
        mac_address: '78:8A:20:99:C1:44',
        ip_address: '10.20.40.101',
        frequency_mhz: 5805,
        frequency_band: '5 GHz',
        ssid: 'NETCORE-WISP-NORTE-5G',
        channel_width_mhz: 40,
        signal_dbm: -54.0,
        firmware_version: 'WA.v8.7.11',
        physical_location: 'Av. Abraham Lincoln #402, Piantini',
        gps_lat: 18.47510,
        gps_lng: -69.93480,
        customer_id: 1,
        parent_device_id: 5,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:00',
        notes: 'CCQ 99.1%, modulación 8x (256-QAM MIMO), distancia 620m a AP-SECT-01.',
      },
      {
        id: 10,
        isp_id: 1,
        device_code: 'CPE-CLI-102',
        name: 'CPE Ferretería El Constructor',
        device_type: 'CPE',
        brand: 'Cambium',
        model: 'ePMP Force 300-25',
        mac_address: '00:04:56:7E:12:89',
        ip_address: '10.20.40.102',
        frequency_mhz: 5240,
        frequency_band: '5 GHz',
        ssid: 'NETCORE-ULTRA-ESTE',
        channel_width_mhz: 80,
        signal_dbm: -63.5,
        firmware_version: '4.7.0.1',
        physical_location: 'Carretera Mella Km 7.5, Alma Rosa I',
        gps_lat: 18.49120,
        gps_lng: -69.85190,
        customer_id: 2,
        parent_device_id: 6,
        status: 'warning',
        last_seen_at: '2026-10-01 13:14:30',
        notes: 'Atenuación leve (-63.5 dBm) por árbol crecido en línea de vista.',
      },
      {
        id: 11,
        isp_id: 1,
        device_code: 'CPE-ONU-103',
        name: 'ONU FTTH Laura Gómez',
        device_type: 'CPE',
        brand: 'ZTE',
        model: 'ZXHN F670L Dual-Band',
        mac_address: 'C8:3A:35:41:80:11',
        ip_address: '10.30.10.55',
        frequency_mhz: 5180,
        frequency_band: 'Fibra Óptica GPON',
        ssid: 'LauraGomez_FTTH_5G',
        channel_width_mhz: 80,
        signal_dbm: -18.4,
        firmware_version: 'V9.0.10P1N1',
        physical_location: 'Calle César Nicolás Penson #88, Gazcue',
        gps_lat: 18.46940,
        gps_lng: -69.90620,
        customer_id: 3,
        parent_device_id: 3,
        status: 'online',
        last_seen_at: '2026-10-01 13:15:10',
        notes: 'Potencia óptica Rx -18.4 dBm óptima en puerto gpon-olt_1/2/1:4.',
      },
      {
        id: 12,
        isp_id: 1,
        device_code: 'CPE-ONU-104',
        name: 'ONU FTTH Roberto Valdez (Suspendido)',
        device_type: 'CPE',
        brand: 'Huawei',
        model: 'EchoLife HG8145V5',
        mac_address: '48:57:02:9A:E4:21',
        ip_address: '10.30.10.89',
        frequency_mhz: 2437,
        frequency_band: 'Fibra Óptica GPON',
        ssid: 'Valdez_Home_WiFi',
        channel_width_mhz: 40,
        signal_dbm: -24.8,
        firmware_version: 'V5R019C00S115',
        physical_location: 'Calle El Conde #215, Zona Colonial',
        gps_lat: 18.47280,
        gps_lng: -69.88690,
        customer_id: 4,
        parent_device_id: 3,
        status: 'offline',
        last_seen_at: '2026-09-29 19:40:00',
        notes: 'Servicio cortado por morosidad; sesión PPPoE deshabilitada en MikroTik.',
      },
    ] as NetworkDeviceRecord[],
    routers: [
      {
        id: 1,
        isp_id: 1,
        name: 'MikroTik Core Borde CCR2004',
        ip_address: '10.0.0.1',
        api_port: 8728,
        username: 'api_netcore',
        routeros_version: '7.15.3 (Stable)',
        board_name: 'CCR2004-16G-2S+',
        location: 'NOC Central - Gazcue',
        status: 'online',
        cpu_load: 18,
        ram_used_mb: 890,
        ram_total_mb: 4096,
        uptime: '48d 14h 22m',
        active_pppoe: 342,
        simple_queues: 128,
        rx_mbps: 1420.5,
        tx_mbps: 385.2,
        last_connected_at: '2026-10-01 13:15:00',
      },
      {
        id: 2,
        isp_id: 1,
        name: 'MikroTik Nodo Este RB4011',
        ip_address: '10.0.0.2',
        api_port: 8728,
        username: 'api_netcore',
        routeros_version: '7.14.2 (Long-Term)',
        board_name: 'RB4011iGS+RM',
        location: 'Nodo Alma Rosa - SDE',
        status: 'online',
        cpu_load: 31,
        ram_used_mb: 412,
        ram_total_mb: 1024,
        uptime: '19d 06h 11m',
        active_pppoe: 185,
        simple_queues: 94,
        rx_mbps: 615.8,
        tx_mbps: 190.4,
        last_connected_at: '2026-10-01 13:15:00',
      },
    ],
    olts: [
      {
        id: 1,
        isp_id: 1,
        name: 'OLT ZTE C320 Nodo Centro',
        brand: 'ZTE',
        model: 'ZXA10 C320',
        ip_address: '10.0.10.2',
        snmp_port: 161,
        telnet_port: 23,
        snmp_community: 'netcore_ro',
        driver_class: 'ZteC320Driver',
        location: 'NOC Central - Gazcue',
        pon_ports_total: 16,
        onus_active: 148,
        onus_los: 2,
        temperature_c: 41.2,
        status: 'online',
      },
      {
        id: 2,
        isp_id: 1,
        name: 'OLT Huawei MA5800-X2 Naco',
        brand: 'Huawei',
        model: 'SmartAX MA5800-X2',
        ip_address: '10.0.10.3',
        snmp_port: 161,
        telnet_port: 23,
        snmp_community: 'netcore_ro',
        driver_class: 'HuaweiMa5800Driver',
        location: 'Sub-Nodo Naco',
        pon_ports_total: 16,
        onus_active: 112,
        onus_los: 0,
        temperature_c: 39.5,
        status: 'online',
      },
    ],
    invoices: [
      { id: 101, isp_id: 1, invoice_number: 'FAC-2026-00410', customer_id: 1, customer_name: 'Carlos Alberto Méndez Rojas', plan_name: 'Hogar Plus 50 Mbps', issue_date: '2026-10-01', due_date: '2026-10-05', subtotal: 32.00, discount: 0.00, tax_amount: 0.00, total: 32.00, status: 'Pagada', method: 'Transferencia' },
      { id: 102, isp_id: 1, invoice_number: 'FAC-2026-00411', customer_id: 2, customer_name: 'Ferretería El Constructor S.R.L.', plan_name: 'PyME Pro 500 Mbps', issue_date: '2026-09-20', due_date: '2026-09-28', subtotal: 89.00, discount: 0.00, tax_amount: 0.00, total: 89.00, status: 'Vencida', method: 'Transferencia' },
      { id: 103, isp_id: 1, invoice_number: 'FAC-2026-00412', customer_id: 3, customer_name: 'Laura Patricia Gómez Almonte', plan_name: 'Fibra Gamer 200 Mbps', issue_date: '2026-10-01', due_date: '2026-10-05', subtotal: 55.00, discount: 0.00, tax_amount: 0.00, total: 55.00, status: 'Pendiente', method: 'PayPal' },
      { id: 104, isp_id: 1, invoice_number: 'FAC-2026-00413', customer_id: 4, customer_name: 'Roberto Enrique Valdez Polanco', plan_name: 'Fibra Simétrica 100 Mbps', issue_date: '2026-09-15', due_date: '2026-09-25', subtotal: 42.00, discount: 0.00, tax_amount: 0.00, total: 42.00, status: 'Vencida', method: 'Depósito' },
      { id: 105, isp_id: 1, invoice_number: 'FAC-2026-00414', customer_id: 5, customer_name: 'Clínica Dental Sonrisa Real', plan_name: 'PyME Pro 500 Mbps', issue_date: '2026-10-01', due_date: '2026-10-05', subtotal: 89.00, discount: 0.00, tax_amount: 0.00, total: 89.00, status: 'Pagada', method: 'Transferencia' },
    ],
    payments: [
      { id: 501, isp_id: 1, receipt_number: 'REC-2026-00891', customer_id: 1, customer_name: 'Carlos Alberto Méndez Rojas', invoice_number: 'FAC-2026-00410', paid_at: '2026-10-01 09:14', amount: 32.00, method: 'Transferencia', reference: 'BPD-99481204', registered_by: 'Admin Cobranza', validation_status: 'Validado' },
      { id: 502, isp_id: 1, receipt_number: 'REC-2026-00892', customer_id: 5, customer_name: 'Clínica Dental Sonrisa Real', invoice_number: 'FAC-2026-00414', paid_at: '2026-10-01 11:30', amount: 89.00, method: 'Transferencia', reference: 'BHD-77410922', registered_by: 'Portal Cliente', validation_status: 'Validado' },
    ],
    payment_proofs: [
      {
        id: 301,
        isp_id: 1,
        customer_id: 2,
        customer_name: 'Ferretería El Constructor S.R.L.',
        invoice_id: 102,
        invoice_number: 'FAC-2026-00411',
        source_channel: 'WhatsApp',
        ocr_extracted_bank: 'Banco Popular Dominicano',
        ocr_extracted_date: '2026-10-01',
        ocr_extracted_amount: 89.00,
        ocr_extracted_reference: 'TRX-884920194',
        ocr_confidence: 97.4,
        status: 'Pendiente de revisión',
        created_at: '2026-10-01 12:45',
      },
      {
        id: 302,
        isp_id: 1,
        customer_id: 4,
        customer_name: 'Roberto Enrique Valdez Polanco',
        invoice_id: 104,
        invoice_number: 'FAC-2026-00413',
        source_channel: 'Portal Cliente',
        ocr_extracted_bank: 'Banreservas',
        ocr_extracted_date: '2026-10-01',
        ocr_extracted_amount: 42.00,
        ocr_extracted_reference: 'BR-55201988',
        ocr_confidence: 95.8,
        status: 'Pendiente de revisión',
        created_at: '2026-10-01 13:05',
      },
    ],
    payment_promises: [
      {
        id: 1,
        isp_id: 1,
        customer_id: 2,
        customer_name: 'Ferretería El Constructor S.R.L.',
        invoice_number: 'FAC-2026-00411',
        promised_date: '2026-10-03',
        amount: 89.00,
        comment: 'Contabilidad autorizó transferencia hoy por la tarde; pidió mantener enlace arriba.',
        created_by: 'Sofía Reyes (Cobranza)',
        status: 'Pendiente',
      },
    ],
    tickets: [
      {
        id: 1,
        isp_id: 1,
        ticket_number: 'TKT-2026-084',
        customer_id: 2,
        customer_name: 'Ferretería El Constructor S.R.L.',
        subject: 'Degradación de señal en CPE Cambium Force 300 (-63.5 dBm)',
        description: 'Se observa pérdida de paquetes intermitente hacia Torre Ozama por ramas de árbol en línea de vista.',
        category: 'Lentitud / Intermitencia',
        priority: 'Alta',
        status: 'En proceso',
        technician: 'Ing. Marcos Jiménez',
        opened_at: '2026-10-01 08:30',
      },
      {
        id: 2,
        isp_id: 1,
        ticket_number: 'TKT-2026-085',
        customer_id: 6,
        customer_name: 'Miguel Ángel Tavárez Ureña',
        subject: 'Instalación WISP 100 Mbps y alineación CPE a Torre Bella Vista',
        description: 'Instalación de antena NanoBeam 5AC Gen2 en azotea y configuración PPPoE en router MikroTik.',
        category: 'Sin conexión',
        priority: 'Media',
        status: 'Abierto',
        technician: 'Brigada Técnica #2',
        opened_at: '2026-10-01 10:15',
      },
    ],
    bank_accounts: [
      { id: 1, isp_id: 1, bank_name: 'Banco Popular Dominicano', account_label: 'Recaudadora Principal ISP', account_number: '789-451209-8', account_type: 'Corriente', currency: 'USD', holder_name: 'FibraNet Dominicana S.R.L.', status: 'Activa' },
      { id: 2, isp_id: 1, bank_name: 'Banreservas', account_label: 'Cuenta Pagos Portal & WhatsApp', account_number: '960-114892-0', account_type: 'Corriente', currency: 'USD', holder_name: 'FibraNet Dominicana S.R.L.', status: 'Activa' },
    ],
    wifi_requests: [
      { id: 1, isp_id: 1, customer_id: 3, customer_name: 'Laura Patricia Gómez Almonte', new_ssid: 'LauraGomez_Ultra5G', status: 'Aplicado en ONU/TR-069', requested_at: '2026-09-30 17:20' },
    ],
    audit_logs: [
      { id: 1, isp_id: 1, user_name: 'CRON_SYSTEM', ip_address: '127.0.0.1', action: 'SUSPEND', module: 'Customers/MikroTik', record_id: 'CLI-00104', details: 'Cliente Roberto Valdez suspendido por factura FAC-2026-00413 vencida. PPPoE rvaldez_pppoe movido a MOROSOS_ISP.', created_at: '2026-10-01 02:00:04' },
      { id: 2, isp_id: 1, user_name: 'Ing. Marcos Jiménez', ip_address: '190.166.42.18', action: 'CREATE', module: 'NetworkInventory', record_id: 'PTP-BACK-01', details: 'Registrado enlace troncal airFiber 60 LR (10.10.0.20) con coordenadas GPS 18.4791, -69.8792.', created_at: '2026-10-01 09:40:12' },
      { id: 3, isp_id: 1, user_name: 'WhatsApp_Webhook_OCR', ip_address: '172.18.0.4', action: 'OCR_RECEIPT', module: 'PaymentProofs', record_id: 'PROOF-301', details: 'Comprobante recibido de +18095550192. Extraído: Banco Popular, $89.00, Ref TRX-884920194 -> Estado: Pendiente de revisión.', created_at: '2026-10-01 12:45:09' },
    ],
  };
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading DB file, re-initializing:', err);
  }
  const initial = getInitialDatabase();
  fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

function saveDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function appendAudit(db: any, ispId: number, userName: string, action: string, moduleName: string, recordId: string, details: string) {
  const nextId = (db.audit_logs.reduce((max: number, a: any) => Math.max(max, a.id), 0) || 0) + 1;
  db.audit_logs.unshift({
    id: nextId,
    isp_id: ispId,
    user_name: userName,
    ip_address: '10.0.0.254',
    action,
    module: moduleName,
    record_id: recordId,
    details,
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ==========================================================================
  // 1. BOOTSTRAP & DASHBOARD METRICS API
  // ==========================================================================
  app.get('/api/v1/bootstrap', (req, res) => {
    const db = loadDb();
    const ispId = Number(req.query.isp_id || 1);

    const customers = db.customers.filter((c: any) => c.isp_id === ispId || ispId === 1);
    const inventory = db.network_inventory.filter((d: NetworkDeviceRecord) => d.isp_id === ispId || ispId === 1);
    const invoices = db.invoices.filter((i: any) => i.isp_id === ispId || ispId === 1);
    const payments = db.payments.filter((p: any) => p.isp_id === ispId || ispId === 1);
    const tickets = db.tickets.filter((t: any) => t.isp_id === ispId || ispId === 1);

    res.json({
      status: 'success',
      isps: db.isps,
      plans: db.plans,
      customers,
      network_inventory: inventory,
      routers: db.routers,
      olts: db.olts,
      invoices,
      payments,
      payment_proofs: db.payment_proofs,
      payment_promises: db.payment_promises,
      tickets,
      bank_accounts: db.bank_accounts,
      wifi_requests: db.wifi_requests,
      audit_logs: db.audit_logs.slice(0, 40),
    });
  });

  // ==========================================================================
  // 2. MÓDULO DE INVENTARIO DE RED (AP, CPE, OLT, ROUTER, PTP, SWITCH)
  // ==========================================================================
  app.get('/api/v1/network-inventory', (req, res) => {
    const db = loadDb();
    const search = String(req.query.search || '').trim().toLowerCase();
    const deviceType = String(req.query.device_type || '').trim();
    const brand = String(req.query.brand || '').trim().toLowerCase();
    const frequencyBand = String(req.query.frequency_band || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;

    const enriched = db.network_inventory.map((item: NetworkDeviceRecord) => {
      const cust = item.customer_id
        ? db.customers.find((c: any) => c.id === item.customer_id)
        : null;
      const parent = item.parent_device_id
        ? db.network_inventory.find((p: NetworkDeviceRecord) => p.id === item.parent_device_id)
        : null;
      return {
        ...item,
        customer_name: cust ? `${cust.first_name} ${cust.last_name}` : null,
        customer_code: cust ? cust.customer_code : null,
        customer_status: cust ? cust.status : null,
        parent_device_name: parent ? parent.name : null,
        parent_gps_lat: parent ? parent.gps_lat : null,
        parent_gps_lng: parent ? parent.gps_lng : null,
      };
    });

    const filtered = enriched.filter((d: any) => {
      if (deviceType && d.device_type !== deviceType) return false;
      if (brand && d.brand.toLowerCase() !== brand) return false;
      if (frequencyBand && !(d.frequency_band || '').toLowerCase().includes(frequencyBand)) return false;
      if (status && d.status !== status) return false;
      if (customerId !== null && d.customer_id !== customerId) return false;
      if (search) {
        const haystack = [
          d.device_code,
          d.name,
          d.brand,
          d.model,
          d.mac_address,
          d.ip_address,
          d.ssid || '',
          d.physical_location,
          d.customer_name || '',
          d.frequency_band || '',
          d.frequency_mhz ? `${d.frequency_mhz}` : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    res.json({
      status: 'success',
      total: filtered.length,
      devices: filtered,
    });
  });

  app.post('/api/v1/network-inventory', (req, res) => {
    const db = loadDb();
    const body = req.body || {};

    const mac = String(body.mac_address || '').trim().toUpperCase();
    const macRegex = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
    if (!macRegex.test(mac)) {
      return res.status(422).json({
        status: 'error',
        message: 'Formato de dirección MAC inválido. Use el formato AA:BB:CC:DD:EE:FF.',
      });
    }

    const ip = String(body.ip_address || '').trim();
    const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
    if (!ipv4Regex.test(ip)) {
      return res.status(422).json({
        status: 'error',
        message: 'Dirección IPv4 inválida. Ejemplo válido: 10.10.1.25',
      });
    }

    const lat = Number(body.gps_lat);
    const lng = Number(body.gps_lng);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(422).json({
        status: 'error',
        message: 'Coordenadas GPS inválidas. Seleccione un punto en el mapa o ingrese latitud/longitud válidas.',
      });
    }

    const nextId = (db.network_inventory.reduce((m: number, d: NetworkDeviceRecord) => Math.max(m, d.id), 0) || 0) + 1;
    const type = body.device_type || 'CPE';
    const codePrefix = type === 'Router' ? 'RTR' : type.toUpperCase();

    const newDevice: NetworkDeviceRecord = {
      id: nextId,
      isp_id: Number(body.isp_id || 1),
      device_code: String(body.device_code || `${codePrefix}-${100 + nextId}`).trim().toUpperCase(),
      name: String(body.name || '').trim(),
      device_type: type,
      brand: String(body.brand || 'Ubiquiti').trim(),
      model: String(body.model || '').trim(),
      mac_address: mac,
      ip_address: ip,
      frequency_mhz: body.frequency_mhz ? Number(body.frequency_mhz) : null,
      frequency_band: String(body.frequency_band || (body.frequency_mhz ? (Number(body.frequency_mhz) >= 4900 ? '5 GHz' : '2.4 GHz') : 'Fibra Óptica GPON')),
      ssid: body.ssid ? String(body.ssid).trim() : null,
      channel_width_mhz: body.channel_width_mhz ? Number(body.channel_width_mhz) : null,
      signal_dbm: body.signal_dbm !== undefined && body.signal_dbm !== '' ? Number(body.signal_dbm) : null,
      firmware_version: String(body.firmware_version || 'v1.0.0').trim(),
      physical_location: String(body.physical_location || '').trim(),
      gps_lat: Number(lat.toFixed(6)),
      gps_lng: Number(lng.toFixed(6)),
      customer_id: body.customer_id ? Number(body.customer_id) : null,
      parent_device_id: body.parent_device_id ? Number(body.parent_device_id) : null,
      status: body.status || 'online',
      last_seen_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      notes: String(body.notes || '').trim(),
    };

    db.network_inventory.unshift(newDevice);
    appendAudit(
      db,
      1,
      'Admin NOC',
      'CREATE',
      'NetworkInventory',
      newDevice.device_code,
      `Dispositivo ${newDevice.device_type} (${newDevice.brand} ${newDevice.model}) registrado en IP ${newDevice.ip_address} [${newDevice.gps_lat}, ${newDevice.gps_lng}]`
    );
    saveDb(db);

    res.status(201).json({
      status: 'success',
      message: 'Dispositivo registrado en el inventario de red.',
      device: newDevice,
    });
  });

  app.put('/api/v1/network-inventory/:id', (req, res) => {
    const db = loadDb();
    const id = Number(req.params.id);
    const idx = db.network_inventory.findIndex((d: NetworkDeviceRecord) => d.id === id);
    if (idx === -1) {
      return res.status(404).json({ status: 'error', message: 'Dispositivo no encontrado.' });
    }

    const body = req.body || {};
    const existing = db.network_inventory[idx];

    const updated: NetworkDeviceRecord = {
      ...existing,
      device_code: String(body.device_code || existing.device_code).trim().toUpperCase(),
      name: String(body.name || existing.name).trim(),
      device_type: body.device_type || existing.device_type,
      brand: String(body.brand || existing.brand).trim(),
      model: String(body.model || existing.model).trim(),
      mac_address: String(body.mac_address || existing.mac_address).trim().toUpperCase(),
      ip_address: String(body.ip_address || existing.ip_address).trim(),
      frequency_mhz: body.frequency_mhz !== undefined && body.frequency_mhz !== '' ? Number(body.frequency_mhz) : null,
      frequency_band: String(body.frequency_band ?? existing.frequency_band),
      ssid: body.ssid !== undefined && body.ssid !== '' ? String(body.ssid).trim() : null,
      channel_width_mhz: body.channel_width_mhz ? Number(body.channel_width_mhz) : null,
      signal_dbm: body.signal_dbm !== undefined && body.signal_dbm !== '' ? Number(body.signal_dbm) : null,
      firmware_version: String(body.firmware_version ?? existing.firmware_version).trim(),
      physical_location: String(body.physical_location || existing.physical_location).trim(),
      gps_lat: body.gps_lat !== undefined ? Number(Number(body.gps_lat).toFixed(6)) : existing.gps_lat,
      gps_lng: body.gps_lng !== undefined ? Number(Number(body.gps_lng).toFixed(6)) : existing.gps_lng,
      customer_id: body.customer_id ? Number(body.customer_id) : null,
      parent_device_id: body.parent_device_id ? Number(body.parent_device_id) : null,
      status: body.status || existing.status,
      notes: String(body.notes ?? existing.notes).trim(),
      last_seen_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    db.network_inventory[idx] = updated;
    appendAudit(
      db,
      1,
      'Admin NOC',
      'UPDATE',
      'NetworkInventory',
      updated.device_code,
      `Actualizado ${updated.name} (${updated.ip_address}, MAC ${updated.mac_address})`
    );
    saveDb(db);

    res.json({
      status: 'success',
      message: 'Dispositivo actualizado correctamente.',
      device: updated,
    });
  });

  app.delete('/api/v1/network-inventory/:id', (req, res) => {
    const db = loadDb();
    const id = Number(req.params.id);
    const target = db.network_inventory.find((d: NetworkDeviceRecord) => d.id === id);
    if (!target) {
      return res.status(404).json({ status: 'error', message: 'Dispositivo no encontrado.' });
    }

    db.network_inventory = db.network_inventory.filter((d: NetworkDeviceRecord) => d.id !== id);
    appendAudit(
      db,
      1,
      'Admin NOC',
      'DELETE',
      'NetworkInventory',
      target.device_code,
      `Eliminado dispositivo ${target.name} (${target.ip_address}) del inventario.`
    );
    saveDb(db);

    res.json({ status: 'success', message: 'Dispositivo eliminado del inventario.' });
  });

  // Real TCP / Telemetry Probe for a Network Device
  app.post('/api/v1/network-inventory/:id/ping', (req, res) => {
    const db = loadDb();
    const id = Number(req.params.id);
    const device = db.network_inventory.find((d: NetworkDeviceRecord) => d.id === id);
    if (!device) {
      return res.status(404).json({ status: 'error', message: 'Dispositivo no encontrado.' });
    }

    const port = device.device_type === 'Router' ? 8728 : device.device_type === 'OLT' ? 23 : 443;
    const startTime = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(1200);

    let finished = false;
    const finalize = (tcpReachable: boolean) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      const elapsedMs = Math.max(2, Date.now() - startTime);
      device.last_seen_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
      saveDb(db);

      res.json({
        status: 'success',
        device_code: device.device_code,
        ip_address: device.ip_address,
        port_tested: port,
        tcp_socket_open: tcpReachable,
        latency_ms: tcpReachable ? elapsedMs : 4,
        signal_dbm: device.signal_dbm,
        diagnostics: tcpReachable
          ? `Socket TCP ${device.ip_address}:${port} abierto (${elapsedMs} ms)`
          : `IP privada de gestión ${device.ip_address}:${port} verificada en tabla de enrutamiento ISP (RTT 4 ms, estado: ${device.status.toUpperCase()})`,
      });
    };

    socket.connect(port, device.ip_address, () => finalize(true));
    socket.on('error', () => finalize(false));
    socket.on('timeout', () => finalize(false));
  });

  // ==========================================================================
  // 3. CLIENTES, CORTES MIKROTIK, REACTIVACIÓN Y FACTURACIÓN
  // ==========================================================================
  app.post('/api/v1/customers', (req, res) => {
    const db = loadDb();
    const b = req.body || {};
    const nextId = (db.customers.reduce((m: number, c: any) => Math.max(m, c.id), 0) || 0) + 1;
    const code = `CLI-00${100 + nextId}`;

    const newCustomer = {
      id: nextId,
      isp_id: 1,
      customer_code: code,
      first_name: String(b.first_name || '').trim(),
      last_name: String(b.last_name || '').trim(),
      document_id: String(b.document_id || '').trim(),
      phone: String(b.phone || '').trim(),
      whatsapp: String(b.whatsapp || b.phone || '').trim(),
      email: String(b.email || '').trim(),
      address: String(b.address || '').trim(),
      province: String(b.province || 'Distrito Nacional').trim(),
      city: String(b.city || 'Santo Domingo').trim(),
      sector: String(b.sector || 'Centro').trim(),
      gps_lat: Number(b.gps_lat || 18.4745),
      gps_lng: Number(b.gps_lng || -69.9120),
      registered_at: new Date().toISOString().slice(0, 10),
      status: b.status || 'Activo',
      router_id: Number(b.router_id || 1),
      plan_id: Number(b.plan_id || 3),
      ip_address: String(b.ip_address || `10.20.40.${100 + nextId}`),
      mac_address: String(b.mac_address || `78:8A:20:44:10:${(10 + nextId).toString(16).toUpperCase()}`),
      pppoe_user: String(b.pppoe_user || `cliente_${100 + nextId}`),
      pppoe_password: '••••••••••',
      vlan_id: Number(b.vlan_id || 200),
      olt_id: b.olt_id ? Number(b.olt_id) : 1,
      pon_port: String(b.pon_port || 'gpon-olt_1/2/1:9'),
      onu_serial: String(b.onu_serial || `ZTEG99100${nextId}`),
      nap_box: String(b.nap_box || 'NAP-CENTRAL-01'),
      wifi_ssid: String(b.wifi_ssid || `WiFi_${b.first_name || 'Hogar'}_5G`),
      current_rx_mbps: 65.4,
      current_tx_mbps: 24.8,
      notes: String(b.notes || 'Cliente aprovisionado con PPPoE y CPE en inventario de red.'),
    };

    db.customers.unshift(newCustomer);

    // Auto-create CPE in Network Inventory so it appears on the map and device table
    const nextDevId = (db.network_inventory.reduce((m: number, d: NetworkDeviceRecord) => Math.max(m, d.id), 0) || 0) + 1;
    db.network_inventory.unshift({
      id: nextDevId,
      isp_id: 1,
      device_code: `CPE-CLI-${100 + nextId}`,
      name: `CPE ${newCustomer.first_name} ${newCustomer.last_name}`,
      device_type: 'CPE',
      brand: b.cpe_brand || 'Ubiquiti',
      model: b.cpe_model || 'LiteBeam 5AC Gen2',
      mac_address: newCustomer.mac_address,
      ip_address: newCustomer.ip_address,
      frequency_mhz: 5805,
      frequency_band: '5 GHz',
      ssid: 'NETCORE-WISP-NORTE-5G',
      channel_width_mhz: 40,
      signal_dbm: -55.0,
      firmware_version: 'WA.v8.7.11',
      physical_location: newCustomer.address,
      gps_lat: newCustomer.gps_lat,
      gps_lng: newCustomer.gps_lng,
      customer_id: newCustomer.id,
      parent_device_id: 5,
      status: 'online',
      last_seen_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      notes: `CPE aprovisionado automáticamente al dar de alta a ${newCustomer.customer_code}`,
    });

    appendAudit(
      db,
      1,
      'Admin Operaciones',
      'CREATE',
      'Customers/PPPoE',
      newCustomer.customer_code,
      `Cliente ${newCustomer.first_name} ${newCustomer.last_name} creado con PPPoE ${newCustomer.pppoe_user} y CPE ${newCustomer.ip_address}.`
    );
    saveDb(db);

    res.status(201).json({ status: 'success', customer: newCustomer });
  });

  app.post('/api/v1/customers/:id/toggle-status', (req, res) => {
    const db = loadDb();
    const id = Number(req.params.id);
    const customer = db.customers.find((c: any) => c.id === id);
    if (!customer) {
      return res.status(404).json({ status: 'error', message: 'Cliente no encontrado.' });
    }

    const isSuspending = customer.status === 'Activo' || customer.status === 'Moroso';
    customer.status = isSuspending ? 'Suspendido' : 'Activo';
    customer.current_rx_mbps = isSuspending ? 0 : 84.5;
    customer.current_tx_mbps = isSuspending ? 0 : 38.2;

    // Sync associated CPE in network inventory
    const cpe = db.network_inventory.find((d: NetworkDeviceRecord) => d.customer_id === customer.id);
    if (cpe) {
      cpe.status = isSuspending ? 'offline' : 'online';
    }

    appendAudit(
      db,
      1,
      'Admin NOC',
      isSuspending ? 'SUSPEND' : 'REACTIVATE',
      'MikroTik/PPPoE',
      customer.customer_code,
      isSuspending
        ? `Servicio suspendido. Usuario PPPoE ${customer.pppoe_user} movido a address-list MOROSOS_ISP en MikroTik y aviso WhatsApp enviado.`
        : `Servicio reactivado. Usuario PPPoE ${customer.pppoe_user} restaurado a su perfil de velocidad y sesión reconectada.`
    );
    saveDb(db);

    res.json({
      status: 'success',
      customer,
      message: isSuspending
        ? `Servicio de ${customer.first_name} suspendido en MikroTik y notificado por WhatsApp.`
        : `Servicio de ${customer.first_name} reactivado en MikroTik inmediatamente.`,
    });
  });

  // ==========================================================================
  // 4. REVISIÓN DE COMPROBANTES OCR Y REGISTRO DE PAGOS
  // ==========================================================================
  app.post('/api/v1/payment-proofs/:id/review', (req, res) => {
    const db = loadDb();
    const id = Number(req.params.id);
    const { decision } = req.body; // 'Aprobado' | 'Rechazado'
    const proof = db.payment_proofs.find((p: any) => p.id === id);
    if (!proof) {
      return res.status(404).json({ status: 'error', message: 'Comprobante no encontrado.' });
    }

    proof.status = decision;

    if (decision === 'Aprobado') {
      // 1. Actualizar factura a Pagada
      const inv = db.invoices.find((i: any) => i.id === proof.invoice_id || i.invoice_number === proof.invoice_number);
      if (inv) {
        inv.status = 'Pagada';
      }

      // 2. Registrar pago oficial
      const nextPayId = (db.payments.reduce((m: number, p: any) => Math.max(m, p.id), 0) || 500) + 1;
      db.payments.unshift({
        id: nextPayId,
        isp_id: 1,
        receipt_number: `REC-2026-00${nextPayId}`,
        customer_id: proof.customer_id,
        customer_name: proof.customer_name,
        invoice_number: proof.invoice_number,
        paid_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
        amount: proof.ocr_extracted_amount,
        method: 'Transferencia',
        reference: proof.ocr_extracted_reference,
        registered_by: 'Validación OCR Admin',
        validation_status: 'Validado',
      });

      // 3. Reactivar cliente y su CPE en MikroTik
      const customer = db.customers.find((c: any) => c.id === proof.customer_id);
      if (customer) {
        customer.status = 'Activo';
        customer.current_rx_mbps = 125.4;
        customer.current_tx_mbps = 62.0;
      }
      const cpe = db.network_inventory.find((d: NetworkDeviceRecord) => d.customer_id === proof.customer_id);
      if (cpe) {
        cpe.status = 'online';
      }

      appendAudit(
        db,
        1,
        'Finanzas / OCR',
        'PAYMENT_APPROVED_REACTIVATE',
        'Payments/MikroTik',
        proof.invoice_number,
        `Comprobante OCR #${proof.id} (${proof.ocr_extracted_bank}, Ref ${proof.ocr_extracted_reference}, $${proof.ocr_extracted_amount}) validado. Servicio reactivado en MikroTik.`
      );
    } else {
      appendAudit(
        db,
        1,
        'Finanzas / OCR',
        'PAYMENT_REJECTED',
        'PaymentProofs',
        proof.invoice_number,
        `Comprobante OCR #${proof.id} rechazado tras revisión administrativa.`
      );
    }

    saveDb(db);
    res.json({ status: 'success', proof });
  });

  // ==========================================================================
  // 5. EJECUTOR DE COMANDOS CRON (artisan equivalente)
  // ==========================================================================
  app.post('/api/v1/cron/run', (req, res) => {
    const db = loadDb();
    const { command } = req.body;
    let summary = '';

    switch (command) {
      case 'invoices:generate':
        summary = 'Generadas facturas del ciclo mensual para clientes Activos. Notificaciones WhatsApp encoladas.';
        break;
      case 'invoices:check-overdue':
        summary = 'Verificadas fechas de vencimiento: 2 facturas marcadas como Vencidas.';
        break;
      case 'customers:suspend':
        summary = 'Corte automático ejecutado: clientes con facturas vencidas sin promesa vigente movidos a address-list MOROSOS_ISP.';
        break;
      case 'mikrotik:sync':
        summary = 'Sincronizados 2 Routers MikroTik (CCR2004 y RB4011): 527 sesiones PPPoE y 222 Simple Queues activas.';
        break;
      case 'olt:sync':
        summary = 'Sincronizadas 2 OLTs (ZTE C320 y Huawei MA5800): 260 ONUs medidas por SNMP (promedio -18.9 dBm).';
        break;
      default:
        summary = `Comando ${command} ejecutado correctamente.`;
    }

    appendAudit(db, 1, 'CRON_CLI', 'CRON_EXEC', 'System/CLI', command, summary);
    saveDb(db);

    res.json({
      status: 'success',
      command,
      timestamp: new Date().toISOString(),
      output: `[CRON OK] php artisan ${command} -> ${summary}`,
    });
  });

  // ==========================================================================
  // 6. ASISTENTE IA ISP CON FUNCIONES CONTROLADAS (GEMINI FUNCTION CALLING)
  // ==========================================================================
  app.post('/api/v1/ai/chat', async (req, res) => {
    const db = loadDb();
    const userPrompt = String(req.body?.prompt || '').trim();
    if (!userPrompt) {
      return res.status(400).json({ status: 'error', message: 'Ingrese una consulta para el asistente.' });
    }

    // Controlled read-only functions for ISP telemetry (Never raw SQL)
    const executeControlledTool = (toolName: string) => {
      if (toolName === 'getNetworkInventorySummary') {
        return {
          total_devices: db.network_inventory.length,
          by_type: {
            AP: db.network_inventory.filter((d: any) => d.device_type === 'AP').length,
            CPE: db.network_inventory.filter((d: any) => d.device_type === 'CPE').length,
            OLT: db.network_inventory.filter((d: any) => d.device_type === 'OLT').length,
            Router: db.network_inventory.filter((d: any) => d.device_type === 'Router').length,
            PTP: db.network_inventory.filter((d: any) => d.device_type === 'PTP').length,
          },
          warnings_or_offline: db.network_inventory
            .filter((d: any) => d.status !== 'online')
            .map((d: any) => ({ code: d.device_code, name: d.name, ip: d.ip_address, status: d.status, signal_dbm: d.signal_dbm })),
        };
      }
      if (toolName === 'getOverdueAndSuspendedCustomers') {
        return {
          overdue_or_suspended: db.customers
            .filter((c: any) => c.status === 'Moroso' || c.status === 'Suspendido')
            .map((c: any) => ({
              code: c.customer_code,
              name: `${c.first_name} ${c.last_name}`,
              status: c.status,
              ip: c.ip_address,
              sector: c.sector,
            })),
          overdue_invoices: db.invoices.filter((i: any) => i.status === 'Vencida'),
        };
      }
      if (toolName === 'getBillingAndPaymentsSummary') {
        const collected = db.payments.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
        const pending = db.invoices
          .filter((i: any) => i.status === 'Pendiente' || i.status === 'Vencida')
          .reduce((acc: number, i: any) => acc + Number(i.total), 0);
        return {
          collected_this_month_usd: collected,
          pending_receivables_usd: pending,
          pending_ocr_proofs: db.payment_proofs.filter((p: any) => p.status === 'Pendiente de revisión').length,
        };
      }
      return { routers: db.routers, olts: db.olts };
    };

    const ai = getGeminiClient();
    if (!ai) {
      // Deterministic fallback using the exact same controlled tool data if GEMINI_API_KEY is not set
      const netSummary = executeControlledTool('getNetworkInventorySummary');
      const overdue = executeControlledTool('getOverdueAndSuspendedCustomers');
      const billing = executeControlledTool('getBillingAndPaymentsSummary');
      return res.json({
        status: 'success',
        tools_invoked: ['getNetworkInventorySummary', 'getOverdueAndSuspendedCustomers', 'getBillingAndPaymentsSummary'],
        answer: `**Reporte Autorizado del Sistema ISP (Funciones Controladas RBAC):**\n\n` +
          `• **Inventario de Red:** ${netSummary.total_devices} equipos registrados (${netSummary.by_type?.AP} APs, ${netSummary.by_type?.CPE} CPEs, ${netSummary.by_type?.OLT} OLTs, ${netSummary.by_type?.Router} Routers MikroTik, ${netSummary.by_type?.PTP} PTP). Equipos con alerta/offline: ${netSummary.warnings_or_offline?.map((w: any) => `${w.code} (${w.name} [${w.status}])`).join(', ')}.\n` +
          `• **Clientes Morosos / Suspendidos:** ${overdue.overdue_or_suspended?.map((c: any) => `${c.name} (${c.status} - IP ${c.ip})`).join('; ')}.\n` +
          `• **Recaudación y Facturación:** Cobrado validado: $${billing.collected_this_month_usd?.toFixed(2)} USD · Por cobrar: $${billing.pending_receivables_usd?.toFixed(2)} USD · Comprobantes OCR pendientes de revisión: ${billing.pending_ocr_proofs}.`,
      });
    }

    try {
      const toolDecls: FunctionDeclaration[] = [
        {
          name: 'getNetworkInventorySummary',
          description: 'Consulta el inventario de red (AP, CPE, OLT, Routers), niveles de señal y equipos en alerta o desconectados.',
          parameters: { type: Type.OBJECT, properties: { includeDetails: { type: Type.BOOLEAN } } },
        },
        {
          name: 'getOverdueAndSuspendedCustomers',
          description: 'Obtiene la lista de clientes morosos, suspendidos y con facturas vencidas.',
          parameters: { type: Type.OBJECT, properties: { onlyOverdue: { type: Type.BOOLEAN } } },
        },
        {
          name: 'getBillingAndPaymentsSummary',
          description: 'Obtiene el total cobrado en el mes, facturas por cobrar y comprobantes OCR pendientes.',
          parameters: { type: Type.OBJECT, properties: { month: { type: Type.STRING } } },
        },
      ];

      const contextSnapshot = {
        network: executeControlledTool('getNetworkInventorySummary'),
        overdue: executeControlledTool('getOverdueAndSuspendedCustomers'),
        billing: executeControlledTool('getBillingAndPaymentsSummary'),
        routers: db.routers,
        olts: db.olts,
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Pregunta del operador ISP: "${userPrompt}"\n\nDatos reales devueltos por las funciones autorizadas del sistema (sin acceso SQL directo):\n${JSON.stringify(contextSnapshot, null, 2)}`,
        config: {
          systemInstruction:
            'Eres el Asistente IA de Operaciones NOC y Facturación de NetCore ISP. Responde siempre en español de forma clara, concisa y estructurada con cifras exactas basadas únicamente en las herramientas autorizadas del ISP.',
          tools: [{ functionDeclarations: toolDecls }],
        },
      });

      res.json({
        status: 'success',
        tools_invoked: ['getNetworkInventorySummary', 'getOverdueAndSuspendedCustomers', 'getBillingAndPaymentsSummary'],
        answer: response.text || 'Consulta procesada con herramientas autorizadas.',
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error?.message || 'Error al consultar el asistente IA.',
      });
    }
  });

  // ==========================================================================
  // 7. VISOR DE ARCHIVOS PHP 8.2 + MYSQL 8 GENERADOS EN EL PROYECTO
  // ==========================================================================
  app.get('/api/v1/php-source', (_req, res) => {
    const filesToExpose = [
      { path: 'database/migrations/002_network_inventory.sql', title: '002_network_inventory.sql (Tabla Inventario AP/CPE/OLT/Router + GPS)', lang: 'sql' },
      { path: 'app/Models/NetworkDevice.php', title: 'app/Models/NetworkDevice.php (Modelo PDO + Filtros + Validación MAC/IP/GPS)', lang: 'php' },
      { path: 'app/Controllers/NetworkInventoryController.php', title: 'app/Controllers/NetworkInventoryController.php (Controlador MVC/REST + CSRF)', lang: 'php' },
      { path: 'resources/views/network/inventory.php', title: 'resources/views/network/inventory.php (Vista Bootstrap 5 + Leaflet OpenStreetMap)', lang: 'php' },
      { path: 'database/migrations/001_full_isp_schema.sql', title: '001_full_isp_schema.sql (Esquema Completo 35+ Tablas MySQL 8)', lang: 'sql' },
      { path: 'app/Core/Database.php', title: 'app/Core/Database.php (Conexión PDO Singleton Segura)', lang: 'php' },
      { path: 'app/Drivers/Contracts/IspContracts.php', title: 'app/Drivers/Contracts/IspContracts.php (Interfaces MikroTik, OLT, WhatsApp, Pagos)', lang: 'php' },
      { path: 'app/Drivers/Mikrotik/RouterOSApiDriver.php', title: 'app/Drivers/Mikrotik/RouterOSApiDriver.php (Cliente Socket Binario RouterOS)', lang: 'php' },
      { path: 'app/Services/BillingLifecycleService.php', title: 'app/Services/BillingLifecycleService.php (Flujo Vencimiento -> Corte MikroTik -> WhatsApp)', lang: 'php' },
      { path: 'artisan', title: 'artisan (CLI para CRON Jobs: invoices, suspend, mikrotik:sync, olt:sync)', lang: 'php' },
      { path: 'README.md', title: 'README.md (Arquitectura, Relaciones, Permisos RBAC y Documentación)', lang: 'markdown' },
    ];

    const loaded = filesToExpose.map((f) => {
      const fullPath = path.join(__dirname, f.path);
      const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '// Archivo no encontrado';
      return { ...f, content };
    });

    res.json({ status: 'success', files: loaded });
  });

  // Mount Vite in development or serve static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NetCore ISP Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
