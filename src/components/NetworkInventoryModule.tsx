import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  Search,
  Plus,
  MapPin,
  Crosshair,
  Activity,
  Edit3,
  Trash2,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  SlidersHorizontal,
  Layers,
  X,
} from 'lucide-react';

export interface NetworkDeviceItem {
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
  customer_name?: string | null;
  customer_code?: string | null;
  customer_status?: string | null;
  parent_device_id: number | null;
  parent_device_name?: string | null;
  parent_gps_lat?: number | null;
  parent_gps_lng?: number | null;
  status: 'online' | 'offline' | 'warning' | 'maintenance';
  last_seen_at: string;
  notes: string;
}

interface CustomerOption {
  id: number;
  customer_code: string;
  first_name: string;
  last_name: string;
  address: string;
  gps_lat: number;
  gps_lng: number;
}

interface Props {
  customers: CustomerOption[];
  onInventoryChange?: () => void;
  onSelectCustomer?: (customerId: number) => void;
}

const DEVICE_TYPE_COLORS: Record<string, { hex: string; label: string }> = {
  Router: { hex: '#38bdf8', label: 'Router MikroTik' },
  OLT: { hex: '#a855f7', label: 'OLT FTTH' },
  AP: { hex: '#10b981', label: 'Access Point (AP)' },
  PTP: { hex: '#f59e0b', label: 'Enlace Troncal PTP' },
  CPE: { hex: '#6366f1', label: 'CPE / ONU Cliente' },
  Switch: { hex: '#94a3b8', label: 'Switch Nodo' },
};

const EMPTY_FORM = {
  device_code: '',
  name: '',
  device_type: 'CPE' as NetworkDeviceItem['device_type'],
  brand: 'Ubiquiti',
  model: 'LiteBeam 5AC Gen2',
  mac_address: '78:8A:20:55:B1:19',
  ip_address: '10.20.40.160',
  frequency_mhz: '5805',
  frequency_band: '5 GHz',
  ssid: 'NETCORE-WISP-NORTE-5G',
  channel_width_mhz: '40',
  signal_dbm: '-54.5',
  firmware_version: 'WA.v8.7.11',
  physical_location: 'Av. Winston Churchill #105, Piantini',
  gps_lat: '18.476250',
  gps_lng: '-69.932400',
  customer_id: '',
  parent_device_id: '5',
  status: 'online' as NetworkDeviceItem['status'],
  notes: '',
};

export default function NetworkInventoryModule({
  customers,
  onInventoryChange,
  onSelectCustomer,
}: Props) {
  const [devices, setDevices] = useState<NetworkDeviceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Multi-criteria filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [bandFilter, setBandFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [associationFilter, setAssociationFilter] = useState<string>('');

  // Map Controls
  const [showLinks, setShowLinks] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [pickGpsMode, setPickGpsMode] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Diagnostics / Notification Banner
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // Leaflet Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const linksLayerRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Record<number, L.Marker>>({});

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter) params.set('device_type', typeFilter);
      if (brandFilter) params.set('brand', brandFilter);
      if (bandFilter) params.set('frequency_band', bandFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/v1/network-inventory?${params.toString()}`);
      const data = await res.json();
      if (data.status === 'success') {
        setDevices(data.devices || []);
      }
    } catch (e) {
      setFeedback({ type: 'err', text: 'Error al consultar el inventario de red.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [search, typeFilter, brandFilter, bandFilter, statusFilter]);

  const displayedDevices = useMemo(() => {
    if (!associationFilter) return devices;
    if (associationFilter === 'customer') {
      return devices.filter((d) => d.customer_id !== null);
    }
    if (associationFilter === 'backbone') {
      return devices.filter((d) => d.customer_id === null);
    }
    return devices;
  }, [devices, associationFilter]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [18.4765, -69.905],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    linksLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Click-to-Pick GPS coordinates on the map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!pickGpsMode && !isModalOpen) return;
      const lat = e.latlng.lat.toFixed(6);
      const lng = e.latlng.lng.toFixed(6);
      setForm((prev) => ({ ...prev, gps_lat: lat, gps_lng: lng }));
      setPickGpsMode(false);
      setIsModalOpen(true);
      setFeedback({
        type: 'ok',
        text: `Coordenadas GPS capturadas del mapa: ${lat}, ${lng}`,
      });
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [pickGpsMode, isModalOpen]);

  // Render Markers, Links, and AP Coverage Circles whenever displayedDevices changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const linksLayer = linksLayerRef.current;
    if (!map || !markersLayer || !linksLayer) return;

    markersLayer.clearLayers();
    linksLayer.clearLayers();
    markerMapRef.current = {};

    displayedDevices.forEach((dev) => {
      if (typeof dev.gps_lat !== 'number' || typeof dev.gps_lng !== 'number') return;

      const typeMeta = DEVICE_TYPE_COLORS[dev.device_type] || DEVICE_TYPE_COLORS.CPE;
      const statusBorder =
        dev.status === 'online'
          ? '#10b981'
          : dev.status === 'warning'
          ? '#f59e0b'
          : '#ef4444';

      // Draw AP coverage circle if enabled
      if (showCoverage && dev.device_type === 'AP') {
        L.circle([dev.gps_lat, dev.gps_lng], {
          radius: 950,
          color: typeMeta.hex,
          weight: 1,
          fillColor: typeMeta.hex,
          fillOpacity: 0.08,
          dashArray: '4 4',
        }).addTo(linksLayer);
      }

      // Draw wireless/fiber link line to parent AP/OLT/Router
      if (
        showLinks &&
        dev.parent_gps_lat &&
        dev.parent_gps_lng
      ) {
        const lineColor =
          dev.status === 'offline'
            ? '#ef4444'
            : dev.status === 'warning'
            ? '#f59e0b'
            : dev.device_type === 'CPE'
            ? '#38bdf8'
            : '#a855f7';

        L.polyline(
          [
            [dev.parent_gps_lat, dev.parent_gps_lng],
            [dev.gps_lat, dev.gps_lng],
          ],
          {
            color: lineColor,
            weight: dev.device_type === 'CPE' ? 2 : 3,
            opacity: 0.75,
            dashArray: dev.frequency_mhz ? '6 4' : undefined,
          }
        ).addTo(linksLayer);
      }

      const iconHtml = `
        <div style="
          display:flex;
          align-items:center;
          justify-content:center;
          width:30px;
          height:30px;
          border-radius:8px;
          background:#0f172a;
          border:2px solid ${statusBorder};
          box-shadow:0 4px 12px rgba(0,0,0,0.65);
          color:${typeMeta.hex};
          font-family:'JetBrains Mono',monospace;
          font-size:10px;
          font-weight:700;
        ">
          ${dev.device_type === 'Router' ? 'RTR' : dev.device_type}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-isp-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -14],
      });

      const popupHtml = `
        <div style="min-width:240px;font-size:12px;line-height:1.45;">
          <div style="font-weight:700;font-size:13px;color:#f8fafc;margin-bottom:2px;">
            ${dev.name}
          </div>
          <div style="color:#94a3b8;font-family:'JetBrains Mono',monospace;font-size:11px;margin-bottom:8px;">
            ${dev.device_code} · ${dev.device_type} · ${dev.brand} ${dev.model}
          </div>
          <div style="border-top:1px solid #1e293b;padding-top:6px;display:grid; gap:3px;">
            <div><span style="color:#64748b;">IP / MAC:</span> <code style="color:#38bdf8;">${dev.ip_address}</code> · <code>${dev.mac_address}</code></div>
            <div><span style="color:#64748b;">Frecuencia / SSID:</span> ${dev.frequency_mhz ? `${dev.frequency_mhz} MHz` : dev.frequency_band} ${dev.ssid ? `· <strong>${dev.ssid}</strong>` : ''}</div>
            <div><span style="color:#64748b;">Señal / Nivel:</span> ${dev.signal_dbm !== null ? `${dev.signal_dbm} dBm` : 'N/A'} · Estado: <strong style="color:${statusBorder};">${dev.status.toUpperCase()}</strong></div>
            <div><span style="color:#64748b;">Ubicación:</span> ${dev.physical_location}</div>
            <div><span style="color:#64748b;">GPS:</span> <code>${dev.gps_lat.toFixed(5)}, ${dev.gps_lng.toFixed(5)}</code></div>
            <div><span style="color:#64748b;">Cliente:</span> ${dev.customer_name ? `<strong>${dev.customer_name}</strong> (${dev.customer_code})` : 'Infraestructura Troncal ISP'}</div>
          </div>
        </div>
      `;

      const marker = L.marker([dev.gps_lat, dev.gps_lng], { icon: customIcon }).bindPopup(popupHtml);
      marker.on('click', () => setSelectedDeviceId(dev.id));
      marker.addTo(markersLayer);
      markerMapRef.current[dev.id] = marker;
    });
  }, [displayedDevices, showLinks, showCoverage]);

  const focusDeviceOnMap = (device: NetworkDeviceItem) => {
    setSelectedDeviceId(device.id);
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([device.gps_lat, device.gps_lng], 16, { duration: 0.6 });
    const marker = markerMapRef.current[device.id];
    if (marker) {
      marker.openPopup();
    }
  };

  const fitAllMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map || displayedDevices.length === 0) return;
    const bounds = L.latLngBounds(displayedDevices.map((d) => [d.gps_lat, d.gps_lng] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36] });
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setFormError(null);
    setForm({
      ...EMPTY_FORM,
      device_code: `CPE-CLI-${Math.floor(110 + Math.random() * 800)}`,
      mac_address: `78:8A:20:${Math.floor(10 + Math.random() * 89)}:${Math.floor(10 + Math.random() * 89)}:4B`,
      ip_address: `10.20.40.${Math.floor(110 + Math.random() * 140)}`,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dev: NetworkDeviceItem) => {
    setEditingId(dev.id);
    setFormError(null);
    setForm({
      device_code: dev.device_code,
      name: dev.name,
      device_type: dev.device_type,
      brand: dev.brand,
      model: dev.model,
      mac_address: dev.mac_address,
      ip_address: dev.ip_address,
      frequency_mhz: dev.frequency_mhz ? String(dev.frequency_mhz) : '',
      frequency_band: dev.frequency_band || '5 GHz',
      ssid: dev.ssid || '',
      channel_width_mhz: dev.channel_width_mhz ? String(dev.channel_width_mhz) : '',
      signal_dbm: dev.signal_dbm !== null ? String(dev.signal_dbm) : '',
      firmware_version: dev.firmware_version || '',
      physical_location: dev.physical_location,
      gps_lat: String(dev.gps_lat),
      gps_lng: String(dev.gps_lng),
      customer_id: dev.customer_id ? String(dev.customer_id) : '',
      parent_device_id: dev.parent_device_id ? String(dev.parent_device_id) : '',
      status: dev.status,
      notes: dev.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleCustomerSelectInForm = (customerIdStr: string) => {
    const cust = customers.find((c) => String(c.id) === customerIdStr);
    if (cust) {
      setForm((prev) => ({
        ...prev,
        customer_id: customerIdStr,
        name: prev.name || `CPE ${cust.first_name} ${cust.last_name}`,
        physical_location: cust.address,
        gps_lat: String(cust.gps_lat),
        gps_lng: String(cust.gps_lng),
      }));
    } else {
      setForm((prev) => ({ ...prev, customer_id: '' }));
    }
  };

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const url = editingId ? `/api/v1/network-inventory/${editingId}` : '/api/v1/network-inventory';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setFormError(data.message || 'Error al guardar el dispositivo.');
        setSaving(false);
        return;
      }

      setIsModalOpen(false);
      setFeedback({
        type: 'ok',
        text: data.message || 'Dispositivo guardado correctamente.',
      });
      await fetchInventory();
      onInventoryChange?.();
    } catch (err) {
      setFormError('Error de red al guardar el dispositivo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDevice = async (dev: NetworkDeviceItem) => {
    try {
      const res = await fetch(`/api/v1/network-inventory/${dev.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({
          type: 'warn',
          text: `Dispositivo ${dev.device_code} (${dev.name}) eliminado del inventario.`,
        });
        await fetchInventory();
        onInventoryChange?.();
      }
    } catch (err) {
      setFeedback({ type: 'err', text: 'No se pudo eliminar el dispositivo.' });
    }
  };

  const handlePingDevice = async (dev: NetworkDeviceItem) => {
    setFeedback({
      type: 'ok',
      text: `Ejecutando prueba TCP/ICMP hacia ${dev.name} (${dev.ip_address})...`,
    });
    try {
      const res = await fetch(`/api/v1/network-inventory/${dev.id}/ping`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({
          type: 'ok',
          text: `[${dev.device_code}] ${data.diagnostics}`,
        });
        fetchInventory();
      }
    } catch (err) {
      setFeedback({ type: 'err', text: 'Error al ejecutar prueba de conectividad.' });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Codigo',
      'Nombre',
      'Tipo',
      'Marca',
      'Modelo',
      'MAC',
      'IP',
      'Frecuencia_MHz',
      'Banda',
      'SSID',
      'Senal_dBm',
      'Ubicacion_Fisica',
      'GPS_Lat',
      'GPS_Lng',
      'Cliente_Asociado',
      'Estado',
    ];
    const rows = displayedDevices.map((d) => [
      d.device_code,
      `"${d.name.replace(/"/g, '""')}"`,
      d.device_type,
      d.brand,
      `"${d.model}"`,
      d.mac_address,
      d.ip_address,
      d.frequency_mhz ?? '',
      `"${d.frequency_band}"`,
      `"${d.ssid ?? ''}"`,
      d.signal_dbm ?? '',
      `"${d.physical_location.replace(/"/g, '""')}"`,
      d.gps_lat,
      d.gps_lng,
      `"${d.customer_name ?? 'Troncal ISP'}"`,
      d.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventario_red_isp_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const counts = useMemo(() => {
    return {
      total: displayedDevices.length,
      ap: displayedDevices.filter((d) => d.device_type === 'AP').length,
      cpe: displayedDevices.filter((d) => d.device_type === 'CPE').length,
      olt: displayedDevices.filter((d) => d.device_type === 'OLT').length,
      router: displayedDevices.filter((d) => d.device_type === 'Router').length,
      online: displayedDevices.filter((d) => d.status === 'online').length,
    };
  }, [displayedDevices]);

  const parentCandidates = useMemo(
    () => devices.filter((d) => d.device_type === 'AP' || d.device_type === 'OLT' || d.device_type === 'Router'),
    [devices]
  );

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Inventario de Red y Mapa GIS (OpenStreetMap / Leaflet)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Registro unificado de Access Points (AP), CPEs de Clientes, OLTs FTTH, Routers MikroTik y enlaces troncales con coordenadas GPS.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setPickGpsMode((v) => !v);
            }}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              pickGpsMode
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {pickGpsMode ? 'Haz clic en el Mapa para capturar GPS...' : 'Capturar GPS en Mapa'}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Registrar Dispositivo
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
              : feedback.type === 'warn'
              ? 'border-amber-500/40 bg-amber-950/40 text-amber-200'
              : 'border-rose-500/40 bg-rose-950/40 text-rose-200'
          }`}
        >
          <span className="font-mono">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-4 text-slate-400 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary Metric Strip (Tabular Numerals, Single-Elevation Depth) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-xs text-slate-400">Total Dispositivos</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
            {counts.total}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{counts.online} en línea ahora</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-xs text-slate-400">Access Points (AP)</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-emerald-400">
            {counts.ap}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Nodos WISP 5 GHz</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-xs text-slate-400">CPE / ONUs Clientes</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-indigo-400">
            {counts.cpe}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Equipos domiciliarios</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-xs text-slate-400">OLTs FTTH</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-purple-400">
            {counts.olt}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Cabeceras GPON</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-xs text-slate-400">Routers MikroTik</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-sky-400">
            {counts.router}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">BGP & Concentradores</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-xs text-slate-400">Cobertura GPS</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
            100%
          </div>
          <div className="mt-0.5 text-xs text-slate-500">OpenStreetMap Activo</div>
        </div>
      </div>

      {/* Multi-Criteria Filter & Search Bar */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Interactive Segmented Control for Device Type */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-950 p-1 border border-slate-800">
            {[
              { id: '', label: 'Todos' },
              { id: 'AP', label: 'Access Points (AP)' },
              { id: 'CPE', label: 'CPE Clientes' },
              { id: 'OLT', label: 'OLTs FTTH' },
              { id: 'Router', label: 'Routers MikroTik' },
              { id: 'PTP', label: 'Enlaces PTP' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  typeFilter === tab.id
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Free-text search */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, IP, MAC, SSID, modelo, ubicación o cliente..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Secondary Criteria Selectors */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Marca del Fabricante</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Todas las marcas</option>
              <option value="Ubiquiti">Ubiquiti</option>
              <option value="MikroTik">MikroTik</option>
              <option value="Mimosa">Mimosa</option>
              <option value="Cambium">Cambium</option>
              <option value="ZTE">ZTE</option>
              <option value="Huawei">Huawei</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Frecuencia / Medio</label>
            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Todas las bandas</option>
              <option value="5 GHz">Inalámbrico 5 GHz</option>
              <option value="2.4 GHz">Inalámbrico 2.4 GHz</option>
              <option value="60 GHz">Troncal 60 GHz</option>
              <option value="Fibra">Fibra Óptica GPON / 10GbE</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Estado Operativo</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Todos los estados</option>
              <option value="online">Online (Operativo)</option>
              <option value="warning">Alerta (Señal degradada)</option>
              <option value="offline">Offline / Suspendido</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Asignación de Cliente</label>
            <select
              value={associationFilter}
              onChange={(e) => setAssociationFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Todos los equipos</option>
              <option value="customer">Con Cliente Asociado (CPE/ONU)</option>
              <option value="backbone">Infraestructura Troncal (Nodos)</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTypeFilter('');
                setBrandFilter('');
                setBandFilter('');
                setStatusFilter('');
                setAssociationFilter('');
              }}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Limpiar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Integrated OpenStreetMap / Leaflet Topology View */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <Layers className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-semibold text-slate-200">
              Mapa de Topología e Infraestructura en Vivo (Leaflet + OpenStreetMap)
            </span>
            <span className="hidden md:inline text-xs text-slate-500">
              · RTR (Azul) · OLT (Violeta) · AP (Verde) · CPE (Índigo) · PTP (Ámbar)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLinks((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                showLinks
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              {showLinks ? 'Enlaces Visibles' : 'Enlaces Ocultos'}
            </button>
            <button
              type="button"
              onClick={() => setShowCoverage((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                showCoverage
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              {showCoverage ? 'Cobertura AP Visible' : 'Cobertura AP Oculta'}
            </button>
            <button
              type="button"
              onClick={fitAllMarkers}
              className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Encuadrar Todos ({displayedDevices.length})
            </button>
          </div>
        </div>

        <div
          ref={mapContainerRef}
          className="h-[420px] w-full z-0"
          aria-label="Mapa de dispositivos de red ISP con OpenStreetMap"
        />
      </div>

      {/* High-Density Network Inventory Data Grid */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-xs font-semibold text-slate-200">
            Lista de Dispositivos Registrados ({displayedDevices.length})
          </div>
          <button
            type="button"
            onClick={fetchInventory}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400">
                <th className="py-3 px-4">Código / Dispositivo</th>
                <th className="py-3 px-3">Tipo · Marca · Modelo</th>
                <th className="py-3 px-3">Dirección IP / MAC</th>
                <th className="py-3 px-3">Frecuencia / SSID</th>
                <th className="py-3 px-3 text-right">Señal</th>
                <th className="py-3 px-3">Ubicación Física & GPS</th>
                <th className="py-3 px-3">Cliente Asociado / Nodo Padre</th>
                <th className="py-3 px-3">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {displayedDevices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No se encontraron dispositivos con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                displayedDevices.map((dev) => {
                  const isSelected = selectedDeviceId === dev.id;
                  return (
                    <tr
                      key={dev.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-100">
                          {dev.device_code}
                        </div>
                        <div className="text-slate-300 mt-0.5">{dev.name}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-slate-200 font-medium">
                          {dev.device_type} <span className="text-slate-600">·</span> {dev.brand}
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          {dev.model} <span className="text-slate-600">·</span>{' '}
                          <span className="font-mono text-[11px]">{dev.firmware_version}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums">
                        <div className="text-sky-400 font-medium">{dev.ip_address}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">{dev.mac_address}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono tabular-nums text-slate-200">
                          {dev.frequency_mhz
                            ? `${dev.frequency_mhz} MHz (${dev.frequency_band})`
                            : dev.frequency_band}
                        </div>
                        <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                          {dev.ssid ? `SSID: ${dev.ssid}` : 'Medio físico / Troncal'}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {dev.signal_dbm !== null ? (
                          <span
                            className={
                              dev.signal_dbm < -62
                                ? 'text-amber-400 font-semibold'
                                : 'text-emerald-400 font-medium'
                            }
                          >
                            {dev.signal_dbm > 0 ? `+${dev.signal_dbm}` : dev.signal_dbm} dBm
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-slate-200 max-w-[210px] truncate" title={dev.physical_location}>
                          {dev.physical_location}
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-400 mt-0.5">
                          {dev.gps_lat.toFixed(5)}, {dev.gps_lng.toFixed(5)}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {dev.customer_id && dev.customer_name ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => onSelectCustomer?.(dev.customer_id!)}
                              className="font-medium text-sky-400 hover:underline text-left"
                            >
                              {dev.customer_name}
                            </button>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {dev.customer_code} · {dev.parent_device_name || 'Directo'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-300">Infraestructura Troncal</span>
                            <div className="text-[11px] text-slate-500">
                              {dev.parent_device_name ? `Uplink: ${dev.parent_device_name}` : 'Nodo Raíz Core'}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {dev.status === 'online' && (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Online
                          </span>
                        )}
                        {dev.status === 'warning' && (
                          <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Alerta
                          </span>
                        )}
                        {dev.status === 'offline' && (
                          <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
                            <XCircle className="h-3.5 w-3.5" />
                            Offline
                          </span>
                        )}
                        {dev.status === 'maintenance' && (
                          <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium">
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Mantenimiento
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => focusDeviceOnMap(dev)}
                            title="Centrar ubicación en el mapa Leaflet"
                            className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-300 hover:border-sky-500/50 hover:text-sky-400 transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePingDevice(dev)}
                            title="Probar conectividad TCP / Telemetría"
                            className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
                          >
                            <Activity className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(dev)}
                            title="Editar dispositivo"
                            className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDevice(dev)}
                            title="Eliminar dispositivo"
                            className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Network Device Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  {editingId ? 'Editar Dispositivo de Red' : 'Registrar Dispositivo en Inventario de Red'}
                </h2>
                <p className="text-xs text-slate-400">
                  Soporta Access Points (AP), CPEs de Clientes, OLTs FTTH y Routers MikroTik
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tipo de Dispositivo *
                  </label>
                  <select
                    value={form.device_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        device_type: e.target.value as NetworkDeviceItem['device_type'],
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="AP">Access Point (AP)</option>
                    <option value="CPE">CPE / ONU Cliente</option>
                    <option value="OLT">OLT FTTH</option>
                    <option value="Router">Router MikroTik</option>
                    <option value="PTP">Enlace Troncal PTP</option>
                    <option value="Switch">Switch Nodo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Código Interno *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.device_code}
                    onChange={(e) => setForm({ ...form, device_code: e.target.value })}
                    placeholder="Ej: AP-SECT-04"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Estado Operativo
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as NetworkDeviceItem['status'] })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="online">Online</option>
                    <option value="warning">Alerta (Señal)</option>
                    <option value="offline">Offline</option>
                    <option value="maintenance">Mantenimiento</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Marca *</label>
                  <input
                    type="text"
                    required
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="Ubiquiti, MikroTik, ZTE..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Modelo *</label>
                  <input
                    type="text"
                    required
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="Rocket Prism 5AC, CCR2004..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nombre / Hostname *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="AP Sectorial Oeste / CPE Cliente"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Dirección IP (IPv4) *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.ip_address}
                    onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                    placeholder="10.10.1.25"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Dirección MAC (AA:BB:CC:DD:EE:FF) *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.mac_address}
                    onChange={(e) => setForm({ ...form, mac_address: e.target.value.toUpperCase() })}
                    placeholder="78:8A:20:41:B2:10"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nivel Señal / Potencia (dBm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.signal_dbm}
                    onChange={(e) => setForm({ ...form, signal_dbm: e.target.value })}
                    placeholder="-54.0 o 4.8"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Frecuencia (MHz)
                  </label>
                  <input
                    type="number"
                    value={form.frequency_mhz}
                    onChange={(e) => setForm({ ...form, frequency_mhz: e.target.value })}
                    placeholder="Ej: 5805 (Vacío si es Fibra)"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Banda / Medio Físico
                  </label>
                  <select
                    value={form.frequency_band}
                    onChange={(e) => setForm({ ...form, frequency_band: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="5 GHz">5 GHz (WISP)</option>
                    <option value="2.4 GHz">2.4 GHz</option>
                    <option value="60 GHz">60 GHz (PTP)</option>
                    <option value="Fibra Óptica GPON">Fibra Óptica GPON</option>
                    <option value="Fibra / 10GbE">Fibra / 10GbE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SSID (Si es AP / CPE / PTP)
                  </label>
                  <input
                    type="text"
                    value={form.ssid}
                    onChange={(e) => setForm({ ...form, ssid: e.target.value })}
                    placeholder="NETCORE-WISP-NORTE-5G"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cliente Asociado (Opcional - para CPE / ONU)
                  </label>
                  <select
                    value={form.customer_id}
                    onChange={(e) => handleCustomerSelectInForm(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="">— Sin cliente (Infraestructura Troncal ISP) —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.customer_code} · {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Conectado a Nodo / AP / OLT Padre
                  </label>
                  <select
                    value={form.parent_device_id}
                    onChange={(e) => setForm({ ...form, parent_device_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="">— Nodo Core Principal —</option>
                    {parentCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.device_type}] {p.device_code} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ubicación Física *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.physical_location}
                    onChange={(e) => setForm({ ...form, physical_location: e.target.value })}
                    placeholder="Torre Norte / Domicilio Cliente"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Latitud GPS *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={form.gps_lat}
                    onChange={(e) => setForm({ ...form, gps_lat: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Longitud GPS *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={form.gps_lng}
                    onChange={(e) => setForm({ ...form, gps_lng: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Notas Técnicas / Observaciones de Instalación
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Alineación, altura en torre, puerto PON o detalles de acceso..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setPickGpsMode(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Seleccionar coordenadas haciendo clic en el mapa
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-sky-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Registrar en Inventario'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
