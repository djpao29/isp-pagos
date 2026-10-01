<?php
declare(strict_types=1);
/**
 * Vista PHP 8.2 + Bootstrap 5 + Leaflet/OpenStreetMap
 * Módulo: Inventario de Red (AP, CPE, OLT, Routers)
 * Archivo: /resources/views/network/inventory.php
 */
$csrfToken = $_SESSION['csrf_token'] ?? bin2hex(random_bytes(32));
?>
<!DOCTYPE html>
<html lang="es" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
    <title>Inventario de Red & Mapa GIS — NetCore ISP</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</head>
<body class="bg-dark text-light">
<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1">Inventario de Red e Infraestructura GIS</h1>
            <p class="text-secondary mb-0">Gestión unificada de Access Points (AP), CPEs de Clientes, OLTs FTTH y Routers MikroTik con geolocalización OpenStreetMap</p>
        </div>
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#deviceModal" onclick="openNewDeviceModal()">
            + Registrar Dispositivo
        </button>
    </div>

    <!-- Filtros Multicriterio -->
    <div class="card bg-body-tertiary border-secondary mb-4">
        <div class="card-body">
            <form id="filterForm" class="row g-3">
                <div class="col-md-4">
                    <label class="form-label small">Búsqueda (Nombre, IP, MAC, SSID, Modelo, Ubicación)</label>
                    <input type="text" id="filterSearch" class="form-control" placeholder="Ej: 10.10.1.10, Rocket, AA:BB:CC...">
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Tipo de Equipo</label>
                    <select id="filterType" class="form-select">
                        <option value="">Todos</option>
                        <option value="AP">Access Point (AP)</option>
                        <option value="CPE">CPE Cliente</option>
                        <option value="OLT">OLT FTTH</option>
                        <option value="Router">Router MikroTik</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Marca</label>
                    <select id="filterBrand" class="form-select">
                        <option value="">Todas las marcas</option>
                        <option value="Ubiquiti">Ubiquiti</option>
                        <option value="MikroTik">MikroTik</option>
                        <option value="Mimosa">Mimosa</option>
                        <option value="Cambium">Cambium</option>
                        <option value="ZTE">ZTE</option>
                        <option value="Huawei">Huawei</option>
                        <option value="VSOL">VSOL</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Banda / Frecuencia</label>
                    <select id="filterBand" class="form-select">
                        <option value="">Todas</option>
                        <option value="5 GHz">5 GHz</option>
                        <option value="2.4 GHz">2.4 GHz</option>
                        <option value="60 GHz">60 GHz</option>
                        <option value="Fibra Óptica GPON">Fibra Óptica GPON</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Estado</label>
                    <select id="filterStatus" class="form-select">
                        <option value="">Todos</option>
                        <option value="online">Online</option>
                        <option value="warning">Alerta</option>
                        <option value="offline">Offline</option>
                    </select>
                </div>
            </form>
        </div>
    </div>

    <!-- Mapa Integrado OpenStreetMap / Leaflet -->
    <div class="card bg-body-tertiary border-secondary mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
            <span class="fw-semibold">Mapa de Topología e Infraestructura (OpenStreetMap / Leaflet)</span>
            <small class="text-secondary">Haz clic en cualquier marcador para ver telemetría o en el mapa al crear un equipo para capturar GPS</small>
        </div>
        <div class="card-body p-0">
            <div id="networkMap" style="height: 440px; width: 100%;"></div>
        </div>
    </div>

    <!-- Tabla de Dispositivos -->
    <div class="card bg-body-tertiary border-secondary">
        <div class="table-responsive">
            <table class="table table-dark table-hover align-middle mb-0">
                <thead>
                    <tr>
                        <th>Código / Equipo</th>
                        <th>Tipo</th>
                        <th>Marca / Modelo</th>
                        <th>Dirección IP / MAC</th>
                        <th>Frecuencia / SSID</th>
                        <th>Ubicación / Coordenadas GPS</th>
                        <th>Cliente Asociado</th>
                        <th>Estado</th>
                        <th class="text-end">Acciones</th>
                    </tr>
                </thead>
                <tbody id="inventoryTableBody"></tbody>
            </table>
        </div>
    </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
const map = L.map('networkMap').setView([18.4765, -69.9050], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
const markersLayer = L.layerGroup().addTo(map);

async function loadInventory() {
    const params = new URLSearchParams({
        search: document.getElementById('filterSearch').value,
        device_type: document.getElementById('filterType').value,
        brand: document.getElementById('filterBrand').value,
        frequency_band: document.getElementById('filterBand').value,
        status: document.getElementById('filterStatus').value,
    });
    const res = await fetch(`/api/v1/network-inventory?${params.toString()}`);
    const data = await res.json();
    renderInventory(data.devices || []);
}

function renderInventory(devices) {
    markersLayer.clearLayers();
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = devices.map(d => {
        if (d.gps_lat && d.gps_lng) {
            const marker = L.marker([d.gps_lat, d.gps_lng]).bindPopup(
                `<strong>${d.name} (${d.device_type})</strong><br>IP: ${d.ip_address}<br>MAC: ${d.mac_address}<br>SSID: ${d.ssid || 'N/A'}<br>Cliente: ${d.customer_name || 'Infraestructura Troncal'}`
            );
            markersLayer.addLayer(marker);
        }
        return `
            <tr>
                <td><strong>${d.device_code}</strong><br><small class="text-secondary">${d.name}</small></td>
                <td>${d.device_type}</td>
                <td>${d.brand} · ${d.model}</td>
                <td><code>${d.ip_address}</code><br><small class="text-secondary font-monospace">${d.mac_address}</small></td>
                <td>${d.frequency_mhz ? d.frequency_mhz + ' MHz' : (d.frequency_band || 'N/A')}<br><small class="text-info">${d.ssid || '—'}</small></td>
                <td>${d.physical_location}<br><small class="font-monospace text-secondary">${Number(d.gps_lat).toFixed(5)}, ${Number(d.gps_lng).toFixed(5)}</small></td>
                <td>${d.customer_name || '<span class="text-secondary">Nodo / Troncal</span>'}</td>
                <td>${d.status}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-info" onclick="map.flyTo([${d.gps_lat}, ${d.gps_lng}], 16)">Ver en Mapa</button>
                </td>
            </tr>
        `;
    }).join('');
}

document.querySelectorAll('#filterForm input, #filterForm select').forEach(el => {
    el.addEventListener('input', loadInventory);
});
loadInventory();
</script>
</body>
</html>
