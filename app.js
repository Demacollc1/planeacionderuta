/* =============================================================================
   Planificador de Rutas de Venta y Promotoría — Demaco
   App 100% cliente (sin backend). Optimiza recorridos, presupuesta el tiempo
   del día (ingreso, almuerzo, salida), soporta rutas locales de 1 día y viajes
   de múltiples días con hotel y hora de inicio de retorno.
   ============================================================================= */

'use strict';

/* ------------------------------- Estado global ---------------------------- */
const STATE = {
  clients: [],          // {id, nombre, lat, lon, tipo, dir, estadia (min|null)}
  selectedIds: new Set(),
  startPoint: null,     // {lat, lon, label}
  endPoint: null,
  hotel: null,
  map: null,
  markers: new Map(),   // id -> marker
  layers: {},
  drawnArea: null,
  pickMode: null,       // 'start' | 'end' | 'hotel' | 'addClient' | null
  routeLayer: null,
  lastPlan: null,
  distCache: new Map(), // "aLat,aLon|bLat,bLon" -> minutos
  roadKm: new Map(),    // mismo key -> km reales (OSRM)
  roadMode: false,      // true si se obtuvo matriz OSRM para este plan
  planNote: '',         // aviso mostrado en resultados
  canvas: null,         // renderer canvas para rendimiento
  filter: { ciudad: '', tipo: '', q: '', vend: '', aten: '', montoMin: null, montoMax: null },
  ordenarMonto: false,
  colorByVend: false,
  vendInfo: {},         // nombre -> {n, i}
  showOnlySelected: false, // tras dibujar área: la lista muestra solo seleccionados
};

const LIST_CAP = 400; // máximo de filas dibujadas en la lista (rendimiento)
const SIN_VEND = '(Sin vendedor)';

/* Color por tipo de contacto (ABAT1) */
const TYPE_COLORS = {
  C: '#3b82f6', V: '#f59e0b', E: '#9333ea', LI: '#14b8a6',
  INA: '#94a3b8', X: '#64748b', CT: '#0ea5e9', F: '#e11d48',
};
function typeColor(c) { return TYPE_COLORS[c.abat1] || '#64748b'; }

/* Formato de moneda USD (Ecuador) */
function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/* Estado de atención: true=atendido, false=no atendido, null=sin dato */
function atenLabel(c) {
  if (c.atendido === true) return 'Atendido';
  if (c.atendido === false) return 'No atendido';
  return 'Sin dato';
}
function atenSymbol(c) {
  if (c.atendido === true) return '✓';
  if (c.atendido === false) return '✕';
  return '';
}
function atenColor(c) {
  if (c.atendido === true) return '#16a34a';
  if (c.atendido === false) return '#dc2626';
  return '#94a3b8';
}
/* URL de Google Maps con destino a las coordenadas del cliente (navegación) */
function gmapsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
}
/* URL de Google Maps para VER el punto (ubicación por coordenadas) */
function gmapsViewUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

/* Color estable por vendedor (ángulo áureo sobre la rueda de tono) */
function vendorColor(vend) {
  if (!vend || vend === SIN_VEND) return '#94a3b8';
  const info = STATE.vendInfo[vend];
  const i = info ? info.i : 0;
  const hue = (i * 137.508) % 360;
  const light = 42 + (i % 3) * 7; // variar un poco la luminosidad
  return `hsl(${hue.toFixed(1)}, 68%, ${light}%)`;
}

/* --------------------------------- Utils ---------------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
let __id = 0;
const uid = () => 'c' + (++__id);

function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
function fromMin(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function fmtDur(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

/* Haversine en km */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function cacheKey(a, b) {
  return `${a.lat.toFixed(5)},${a.lon.toFixed(5)}|${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
}
function trafficFactor() { return Number($('#traffic') && $('#traffic').value) || 1; }
/* Tiempo mínimo de desplazamiento entre paradas (estacionar/caminar), en minutos */
function minStopBuffer() { const el = $('#minStop'); return el ? (Number(el.value) || 0) : 0; }
/* Tiempo de viaje entre paradas con piso mínimo aplicado */
function legMin(a, b) { return Math.max(travelMin(a, b), minStopBuffer()); }

/* Tiempo de viaje en minutos. Usa la matriz OSRM (real) si está en caché;
   si no, estima con haversine + factor de vía + velocidad. En ambos casos
   multiplica por el factor de tráfico. */
function travelMin(a, b) {
  if (!a || !b) return 0;
  const key = cacheKey(a, b);
  if (STATE.distCache.has(key)) return STATE.distCache.get(key); // ya incluye tráfico
  const speed = Number($('#speed').value) || 30;
  const factor = Number($('#roadFactor').value) || 1.3;
  const km = haversineKm(a, b) * factor;
  const min = (km / speed) * 60 * trafficFactor();
  STATE.distCache.set(key, min);
  return min;
}
function travelKm(a, b) {
  const key = cacheKey(a, b);
  if (STATE.roadKm.has(key)) return STATE.roadKm.get(key); // km reales OSRM
  const factor = Number($('#roadFactor').value) || 1.3;
  return haversineKm(a, b) * factor;
}

/* Obtiene la matriz de tiempos/distancias reales por carretera (OSRM table).
   Rellena distCache (min, con tráfico) y roadKm (km reales). */
async function ensureRoadMatrix(points) {
  const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.durations) throw new Error(data.code || 'sin datos');
  const tf = trafficFactor();
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dur = data.durations[i][j];
      if (dur == null) continue;
      const key = cacheKey(points[i], points[j]);
      STATE.distCache.set(key, (dur / 60) * tf);
      const dist = data.distances && data.distances[i][j];
      if (dist != null) STATE.roadKm.set(key, dist / 1000);
    }
  }
}

/* Geometría real (calles) de una secuencia ordenada de puntos (OSRM route). */
async function fetchRoadGeometry(seq) {
  const coords = seq.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error(data.code || 'sin ruta');
  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // a [lat,lon]
}

/* --------------------------- Datos de ejemplo ----------------------------- */
function makeSample() {
  // Dos clusters: Medellín (local) y Bogotá (para demo de viaje multi-día)
  const clusters = [
    { c: { lat: 6.2518, lon: -75.5636 }, n: 'Medellín', count: 18, spread: 0.045 },
    { c: { lat: 4.6510, lon: -74.0817 }, n: 'Bogotá', count: 12, spread: 0.05 },
  ];
  const tipos = ['Cliente', 'Cliente', 'Cliente', 'Promotoría', 'Prospecto'];
  const nombres = ['Tienda', 'Minimercado', 'Autoservicio', 'Distribuidora', 'Supermercado',
    'Panadería', 'Ferretería', 'Farmacia', 'Papelería', 'Cafetería'];
  const out = [];
  let seed = 42;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  clusters.forEach((cl) => {
    for (let i = 0; i < cl.count; i++) {
      const lat = cl.c.lat + (rnd() - 0.5) * cl.spread * 2;
      const lon = cl.c.lon + (rnd() - 0.5) * cl.spread * 2;
      out.push({
        id: uid(),
        nombre: `${nombres[Math.floor(rnd() * nombres.length)]} ${cl.n.slice(0,3).toUpperCase()}-${i + 1}`,
        lat, lon,
        tipo: tipos[Math.floor(rnd() * tipos.length)],
        dir: `${cl.n}`,
        estadia: null,
      });
    }
  });
  return out;
}

/* ------------------------------- CSV parsing ------------------------------ */
function parseCSV(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function importCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) { alert('El archivo está vacío.'); return; }
  const header = rows[0].map(h => h.trim().toLowerCase());
  const find = (...names) => {
    for (const n of names) {
      const idx = header.findIndex(h => h === n || h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const iLat = find('latitud', 'lat', 'latitude', 'y');
  const iLon = find('longitud', 'lon', 'lng', 'long', 'longitude', 'x');
  const iName = find('nombre', 'cliente', 'name', 'razon', 'razón', 'establecimiento');
  const iTipo = find('tipo', 'canal', 'segmento', 'categoria', 'categoría');
  const iDir = find('direccion', 'dirección', 'address', 'barrio', 'zona', 'ciudad');
  const iEst = find('estadia', 'estadía', 'tiempo', 'permanencia', 'minutos');

  if (iLat < 0 || iLon < 0) {
    alert('No se encontraron columnas de latitud/longitud.\nEncabezados detectados: ' + header.join(', '));
    return;
  }
  const parsed = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lat = parseFloat(String(row[iLat]).replace(',', '.'));
    const lon = parseFloat(String(row[iLon]).replace(',', '.'));
    if (!isFinite(lat) || !isFinite(lon)) continue;
    parsed.push({
      id: uid(),
      nombre: (iName >= 0 ? row[iName] : '') || `Cliente ${r}`,
      lat, lon,
      tipo: (iTipo >= 0 ? row[iTipo] : 'Cliente') || 'Cliente',
      dir: (iDir >= 0 ? row[iDir] : '') || '',
      estadia: iEst >= 0 && isFinite(parseFloat(row[iEst])) ? parseFloat(row[iEst]) : null,
    });
  }
  if (!parsed.length) { alert('No se pudieron leer coordenadas válidas.'); return; }
  STATE.clients = parsed;
  STATE.selectedIds = new Set(parsed.map(c => c.id));
  afterClientsLoaded();
  alert(`Se importaron ${parsed.length} clientes.`);
}

/* ---------------------------- Mapa (Leaflet) ------------------------------ */
function initMap() {
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([-1.5, -78.5], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(map);
  STATE.map = map;
  STATE.canvas = L.canvas({ padding: 0.5 });

  // Grupo de dibujo de área
  const drawn = new L.FeatureGroup();
  map.addLayer(drawn);
  STATE.layers.drawn = drawn;

  const drawControl = new L.Control.Draw({
    draw: {
      polygon: { allowIntersection: false, shapeOptions: { color: '#2563eb' } },
      rectangle: { shapeOptions: { color: '#2563eb' } },
      circle: { shapeOptions: { color: '#2563eb' } },
      polyline: false, marker: false, circlemarker: false,
    },
    edit: { featureGroup: drawn, remove: true },
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (e) => {
    drawn.clearLayers();
    drawn.addLayer(e.layer);
    STATE.drawnArea = e.layer;
    selectClientsInArea();
  });
  map.on(L.Draw.Event.DELETED, () => {
    STATE.drawnArea = null; STATE.showOnlySelected = false;
    renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
  });
  map.on(L.Draw.Event.EDITED, () => { selectClientsInArea(); });

  // Click para fijar puntos (inicio/fin/hotel) o agregar cliente
  map.on('click', (e) => {
    if (!STATE.pickMode) return;
    const p = { lat: e.latlng.lat, lon: e.latlng.lng };
    if (STATE.pickMode === 'start') { STATE.startPoint = { ...p, label: 'Inicio' }; $('#startLabel').textContent = coordLabel(p); }
    else if (STATE.pickMode === 'end') { STATE.endPoint = { ...p, label: 'Fin' }; $('#endLabel').textContent = coordLabel(p); }
    else if (STATE.pickMode === 'hotel') { STATE.hotel = { ...p, label: 'Hotel' }; $('#hotelLabel').textContent = coordLabel(p); }
    else if (STATE.pickMode === 'addClient') {
      const nombre = prompt('Nombre del cliente:', 'Nuevo cliente');
      if (nombre) {
        const c = { id: uid(), nombre, lat: p.lat, lon: p.lon, tipo: 'Cliente', dir: '', estadia: null };
        STATE.clients.push(c);
        STATE.selectedIds.add(c.id);
        afterClientsLoaded();
      }
    }
    setPickMode(null);
    renderSpecialMarkers();
  });
}

function coordLabel(p) {
  return `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
}

function setPickMode(mode) {
  STATE.pickMode = mode;
  $$('.pick-btn').forEach(b => b.classList.remove('active'));
  if (mode) {
    const btn = $(`.pick-btn[data-pick="${mode}"]`);
    if (btn) btn.classList.add('active');
    STATE.map.getContainer().style.cursor = 'crosshair';
  } else {
    STATE.map.getContainer().style.cursor = '';
  }
}

/* Punto dentro del área dibujada */
function pointInArea(c) {
  const area = STATE.drawnArea;
  if (!area) return true;
  const latlng = L.latLng(c.lat, c.lon);
  if (area instanceof L.Circle) {
    return STATE.map.distance(latlng, area.getLatLng()) <= area.getRadius();
  }
  // Polígono / rectángulo
  const poly = area.getLatLngs()[0];
  return rayCast(c.lat, c.lon, poly);
}
function rayCast(lat, lon, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].lat, xi = poly[i].lng;
    const yj = poly[j].lat, xj = poly[j].lng;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function selectClientsInArea() {
  if (!STATE.drawnArea) return;
  // Solo entre los clientes visibles (respeta filtro de ciudad/tipo/búsqueda)
  const ids = visibleClients().filter(pointInArea).map(c => c.id);
  STATE.selectedIds = new Set(ids);
  STATE.showOnlySelected = true; // el panel muestra solo lo seleccionado en el área
  renderClientMarkers();
  renderClientList();
  renderVendLegend();
  updateCounts();
}

function selectedClients() {
  return STATE.clients.filter(c => STATE.selectedIds.has(c.id));
}

window.showAllClients = function () {
  STATE.showOnlySelected = false;
  renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
};

/* Clientes visibles según filtros de sector/ciudad, tipo y búsqueda */
function visibleClients() {
  const f = STATE.filter;
  const q = (f.q || '').toLowerCase();
  return STATE.clients.filter(c => {
    if (f.ciudad && (c.ciudad || '') !== f.ciudad) return false;
    if (f.tipo && (c.tipo || '') !== f.tipo) return false;
    if (f.vend && (c.vend || SIN_VEND) !== f.vend) return false;
    if (f.aten === 'si' && c.atendido !== true) return false;
    if (f.aten === 'no' && c.atendido !== false) return false;
    if (f.aten === 'sd' && c.atendido !== null) return false;
    if (f.montoMin != null && !(c.venta2026 != null && c.venta2026 >= f.montoMin)) return false;
    if (f.montoMax != null && !(c.venta2026 != null && c.venta2026 <= f.montoMax)) return false;
    if (q && !(`${c.nombre} ${c.dir} ${c.tipo} ${c.ruc || ''} ${c.ciudad || ''} ${c.vend || ''}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

/* Lista visible ya ordenada según preferencia (por monto desc si está activo) */
function visibleForList() {
  const list = visibleClients();
  if (STATE.ordenarMonto) {
    return list.slice().sort((a, b) => (b.venta2026 || 0) - (a.venta2026 || 0));
  }
  return list;
}

const ICON_CAP = 1800; // sobre este número de visibles, se usa canvas (rendimiento)

function clientPopupHtml(c) {
  return `<b>${escapeHtml(c.nombre)}</b><br>` +
    `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;background:${typeColor(c)};display:inline-block"></span><b>${escapeHtml(c.tipo)}</b>${c.abat1 ? ' <span style="color:#94a3b8">('+escapeHtml(c.abat1)+')</span>' : ''}</span>` +
    `${c.ruc ? ' <span style="color:#64748b">· RUC ' + escapeHtml(c.ruc) + '</span>' : ''}<br>` +
    `${escapeHtml(c.dir)}${c.ciudad ? '<br>' + escapeHtml(c.ciudad) : ''}<br>` +
    `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:50%;background:${vendorColor(c.vend)};display:inline-block"></span><b>${escapeHtml(c.vend || SIN_VEND)}</b></span><br>` +
    `<span style="display:inline-flex;align-items:center;gap:5px;margin-top:2px"><b style="color:${atenColor(c)}">${atenSymbol(c) || '•'} ${atenLabel(c)}</b> · Compra 2026: <b>${fmtMoney(c.venta2026)}</b></span><br>` +
    `<button onclick="toggleClient('${c.id}')">${STATE.selectedIds.has(c.id) ? '➖ Quitar de la ruta' : '➕ Agregar a la ruta'}</button>`;
}

/* Marcadores de clientes. Si hay pocos visibles usa iconos (✓ atendido / ✕ no atendido);
   si hay miles usa circleMarker sobre canvas (fluido) diferenciando atención por relleno. */
function renderClientMarkers() {
  STATE.markers.forEach(m => STATE.map.removeLayer(m));
  STATE.markers.clear();
  const vis = visibleClients();
  const useIcons = vis.length <= ICON_CAP;
  const hint = $('#iconHint');
  if (hint) hint.style.display = useIcons ? 'none' : 'block';

  vis.forEach(c => {
    const selected = STATE.selectedIds.has(c.id);
    const fill = STATE.colorByVend ? vendorColor(c.vend) : (selected ? '#16a34a' : typeColor(c));
    let m;
    if (useIcons) {
      const sym = atenSymbol(c);                 // ✓ / ✕ / ''
      const size = selected ? 22 : 18;
      const ring = c.atendido === false ? '#dc2626' : (c.atendido === true ? '#16a34a' : '#fff');
      const html = `<div class="cm-ic${selected ? ' sel' : ''}" style="width:${size}px;height:${size}px;background:${fill};border-color:${selected ? '#0f172a' : ring}">${sym}</div>`;
      m = L.marker([c.lat, c.lon], {
        icon: L.divIcon({ className: 'cm-wrap', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
      });
    } else {
      // canvas: atendido = relleno sólido; no atendido = anillo hueco; sin dato = punto tenue
      const noAt = c.atendido === false;
      m = L.circleMarker([c.lat, c.lon], {
        renderer: STATE.canvas,
        radius: selected ? 6 : 4,
        color: noAt ? '#dc2626' : (selected ? '#0f172a' : '#fff'),
        weight: noAt ? 2 : (selected ? 2 : 0.5),
        fillColor: fill,
        fillOpacity: noAt ? 0.1 : (selected ? 0.95 : 0.75),
      });
    }
    m.bindPopup(() => clientPopupHtml(c));
    m.addTo(STATE.map);
    STATE.markers.set(c.id, m);
  });
}

window.toggleClient = function (id) {
  if (STATE.selectedIds.has(id)) STATE.selectedIds.delete(id);
  else STATE.selectedIds.add(id);
  renderClientMarkers();
  renderClientList();
  updateCounts();
  const m = STATE.markers.get(id);
  if (m) m.closePopup();
};

const specialMarkers = {};
function renderSpecialMarkers() {
  ['start', 'end', 'hotel'].forEach(k => {
    if (specialMarkers[k]) { STATE.map.removeLayer(specialMarkers[k]); specialMarkers[k] = null; }
  });
  const defs = [
    { k: 'start', p: STATE.startPoint, color: '#2563eb', txt: 'I' },
    { k: 'end', p: STATE.endPoint, color: '#dc2626', txt: 'F' },
    { k: 'hotel', p: STATE.hotel, color: '#9333ea', txt: 'H' },
  ];
  defs.forEach(d => {
    if (!d.p) return;
    const icon = L.divIcon({
      className: 'special-icon',
      html: `<div style="background:${d.color};color:#fff;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px"><span style="transform:rotate(45deg)">${d.txt}</span></div>`,
      iconSize: [24, 24], iconAnchor: [12, 24],
    });
    specialMarkers[d.k] = L.marker([d.p.lat, d.p.lon], { icon }).addTo(STATE.map);
  });
}

/* --------------------------- Lista de clientes ---------------------------- */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderClientList() {
  const box = $('#clientList');
  const onlySel = STATE.showOnlySelected;
  let list = onlySel ? selectedClients() : visibleForList();
  if (onlySel && STATE.ordenarMonto) list = list.slice().sort((a, b) => (b.venta2026 || 0) - (a.venta2026 || 0));
  const shown = list.slice(0, LIST_CAP);
  let banner = '';
  if (onlySel) {
    banner = `<div class="sel-banner">✅ <b>${list.length}</b> cliente(s) seleccionados en el área
      <button onclick="showAllClients()">Ver todos</button></div>`;
  }
  let html = banner + shown.map(c => {
    const sel = STATE.selectedIds.has(c.id);
    return `<div class="client-row ${sel ? 'sel' : ''}">
      <input type="checkbox" ${sel ? 'checked' : ''} onchange="toggleClient('${c.id}')">
      <div class="client-meta" onclick="flyTo('${c.id}')">
        <div class="cn">${escapeHtml(c.nombre)} <span class="aten-badge" style="background:${atenColor(c)}1a;color:${atenColor(c)}">${atenSymbol(c) || '•'} ${atenLabel(c)}</span></div>
        <div class="cd"><span style="color:${typeColor(c)}">●</span> ${escapeHtml(c.tipo)} · <span style="color:${vendorColor(c.vend)}">●</span> ${escapeHtml(c.vend || SIN_VEND)}${c.ciudad ? ' · ' + escapeHtml(c.ciudad) : ''}</div>
        <div class="cd">💰 Compra 2026: <b style="color:#0f172a">${fmtMoney(c.venta2026)}</b></div>
      </div>
      <input class="estadia-in" type="number" min="0" step="5" placeholder="def"
        value="${c.estadia ?? ''}" title="Tiempo de estadía (min) para este cliente"
        onchange="setEstadia('${c.id}', this.value)">
    </div>`;
  }).join('');
  if (!shown.length) html = onlySel
    ? '<div class="empty">No hay clientes dentro del área dibujada. <button onclick="showAllClients()" style="background:none;border:0;color:var(--brand);cursor:pointer;text-decoration:underline">Ver todos</button></div>'
    : '<div class="empty">No hay clientes con estos filtros.</div>';
  else if (list.length > LIST_CAP) html += `<div class="empty">Mostrando ${LIST_CAP} de ${list.length}. Afina el filtro de ciudad/búsqueda o dibuja un área en el mapa.</div>`;
  box.innerHTML = html;
}

window.flyTo = function (id) {
  const c = STATE.clients.find(x => x.id === id);
  if (c) { STATE.map.setView([c.lat, c.lon], 15); const m = STATE.markers.get(id); if (m) m.openPopup(); }
};
window.setEstadia = function (id, val) {
  const c = STATE.clients.find(x => x.id === id);
  if (c) c.estadia = val === '' ? null : Number(val);
};

function updateCounts() {
  $('#countTotal').textContent = STATE.clients.length;
  $('#countSel').textContent = STATE.selectedIds.size;
  const tb = $('#tbSel');
  if (tb) tb.textContent = STATE.selectedIds.size;
}

/* Poblar selects de ciudad y tipo a partir de los datos */
function populateFilters() {
  const cities = new Map(); // ciudad -> conteo
  const tipos = new Map();
  STATE.clients.forEach(c => {
    const ci = c.ciudad || '';
    if (ci) cities.set(ci, (cities.get(ci) || 0) + 1);
    const t = c.tipo || '';
    if (t) tipos.set(t, (tipos.get(t) || 0) + 1);
  });
  const citySel = $('#cityFilter');
  const sortedCities = Array.from(cities.entries()).sort((a, b) => b[1] - a[1]);
  citySel.innerHTML = '<option value="">Todas las ciudades (' + STATE.clients.length + ')</option>' +
    sortedCities.map(([c, n]) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${n})</option>`).join('');
  const tipoSel = $('#tipoFilter');
  tipoSel.innerHTML = '<option value="">Todos</option>' +
    Array.from(tipos.entries()).sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${n})</option>`).join('');
  // Vendedores (ordenados por # de clientes; el índice de color viene de VENDEDORES)
  const vends = new Map();
  STATE.clients.forEach(c => { const v = c.vend || SIN_VEND; vends.set(v, (vends.get(v) || 0) + 1); });
  const vendSel = $('#vendFilter');
  const sortedV = Array.from(vends.entries()).sort((a, b) => b[1] - a[1]);
  vendSel.innerHTML = '<option value="">Todos los vendedores (' + STATE.clients.length + ')</option>' +
    sortedV.map(([v, n]) => `<option value="${escapeHtml(v)}">${escapeHtml(v)} (${n})</option>`).join('');
}

/* Leyenda de vendedores visibles (solo cuando se colorea por vendedor) */
function renderVendLegend() {
  const box = $('#vendLegend');
  const bySelection = STATE.showOnlySelected && STATE.selectedIds.size > 0;
  // Se muestra si se colorea por vendedor, o si hay una selección de área
  if (!STATE.colorByVend && !bySelection) { box.style.display = 'none'; return; }
  const source = bySelection ? selectedClients() : visibleClients();
  const counts = new Map();
  source.forEach(c => { const v = c.vend || SIN_VEND; counts.set(v, (counts.get(v) || 0) + 1); });
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  box.style.display = 'block';
  const title = bySelection
    ? `Vendedores en la selección (${rows.length}) · elige uno para su ruta`
    : `${rows.length} vendedor(es) · clic para filtrar`;
  box.innerHTML = `<div style="font-size:11px;color:#64748b;padding:2px 4px 5px;font-weight:600">${title}</div>` +
    rows.map(([v, n]) => {
      const vv = v.replace(/'/g, "\\'");
      if (bySelection) {
        return `<div class="lg-row">
          <span class="sw" style="background:${vendorColor(v)}"></span>
          <span class="lg-name">${escapeHtml(v)}</span><span class="lg-n">${n}</span>
          <button class="lg-only" title="Dejar solo este vendedor en la selección" onclick="keepOnlyVendorInSelection('${vv}')">Solo este ▸</button></div>`;
      }
      return `<div class="lg-row ${STATE.filter.vend === v ? 'on' : ''}" onclick="filterVend('${vv}')">
        <span class="sw" style="background:${vendorColor(v)}"></span>
        <span class="lg-name">${escapeHtml(v)}</span><span class="lg-n">${n}</span></div>`;
    }).join('');
}

/* Guarda una nota por cliente (aparece en el reporte imprimible) */
window.setNota = function (id, val) {
  const c = STATE.clients.find(x => x.id === id);
  if (c) c.nota = val;
};

/* Deja en la selección solo los clientes de un vendedor (dentro del área) */
window.keepOnlyVendorInSelection = function (v) {
  const keep = selectedClients().filter(c => (c.vend || SIN_VEND) === v).map(c => c.id);
  STATE.selectedIds = new Set(keep);
  STATE.showOnlySelected = true;
  renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
  fitToClients(selectedClients());
};

window.filterVend = function (v) {
  const cur = $('#vendFilter').value;
  $('#vendFilter').value = (cur === v) ? '' : v; // clic de nuevo = quitar filtro
  applyFilters();
};

/* ---------------------- Resumen por vendedor (pestaña) -------------------- */
let VS_SORT = { key: 'n', dir: -1 };

function computeVendorSummary() {
  const by = new Map();
  STATE.clients.forEach(c => {
    const v = c.vend || SIN_VEND;
    if (!by.has(v)) by.set(v, { vend: v, n: 0, cities: new Map() });
    const o = by.get(v); o.n++;
    if (c.ciudad) o.cities.set(c.ciudad, (o.cities.get(c.ciudad) || 0) + 1);
  });
  return Array.from(by.values()).map(o => {
    const cs = Array.from(o.cities.entries()).sort((a, b) => b[1] - a[1]);
    return { vend: o.vend, n: o.n, nc: cs.length, top: cs[0] ? cs[0][0] : '—', color: vendorColor(o.vend) };
  });
}

function renderVendorSummary() {
  const rows = computeVendorSummary();
  const q = ($('#vsSearch').value || '').toLowerCase();
  let list = q ? rows.filter(r => r.vend.toLowerCase().includes(q)) : rows;
  const k = VS_SORT.key, dir = VS_SORT.dir;
  list = list.slice().sort((a, b) => {
    let av = a[k], bv = b[k];
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
  const totCli = rows.reduce((s, r) => s + r.n, 0);
  $('#vsSub').textContent = `${rows.length} vendedores · ${totCli} clientes geolocalizados`;
  const tb = $('#vsTable tbody');
  tb.innerHTML = list.map(r => `<tr>
    <td><span class="vs-sw" style="background:${r.color}"></span></td>
    <td class="txt">${escapeHtml(r.vend)}</td>
    <td class="num">${r.n}</td>
    <td>${r.nc}</td>
    <td class="txt">${escapeHtml(r.top)}</td>
    <td><button class="vs-plan-btn" onclick="planVendor('${r.vend.replace(/'/g, "\\'")}')">Planear ruta ▸</button></td>
  </tr>`).join('');
}

/* Ir al planificador con ese vendedor seleccionado */
window.planVendor = function (vend) {
  $('#vendFilter').value = vend;
  $('#colorByVend').checked = true;
  applyFilters();
  visibleClients().forEach(c => STATE.selectedIds.add(c.id));
  renderClientMarkers(); renderClientList(); updateCounts();
  // cambiar a la pestaña Planificador
  $$('.tab-btn').forEach(x => x.classList.remove('active'));
  $$('.tab-panel').forEach(x => x.classList.remove('active'));
  $('.tab-btn[data-tab="tab-plan"]').classList.add('active');
  $('#tab-plan').classList.add('active');
  setTimeout(() => { STATE.map.invalidateSize(); fitToClients(visibleClients()); }, 60);
};

window.exportVendorSummary = function () {
  const rows = computeVendorSummary().sort((a, b) => b.n - a.n);
  const out = [['Vendedor', 'Clientes', 'Ciudades', 'Ciudad principal']];
  rows.forEach(r => out.push([r.vend, r.n, r.nc, r.top]));
  const csv = out.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'resumen_por_vendedor.csv'; a.click();
};

function afterClientsLoaded() {
  populateFilters();
  renderClientMarkers();
  renderSpecialMarkers();
  renderClientList();
  updateCounts();
  fitToClients(visibleClients());
}

function fitToClients(list) {
  if (!list || !list.length) return;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  list.forEach(c => {
    minLat = Math.min(minLat, c.lat); maxLat = Math.max(maxLat, c.lat);
    minLon = Math.min(minLon, c.lon); maxLon = Math.max(maxLon, c.lon);
  });
  try { STATE.map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [30, 30] }); } catch (e) {}
}

/* Se llama al cambiar cualquier filtro */
function applyFilters() {
  STATE.filter.ciudad = $('#cityFilter').value;
  STATE.filter.tipo = $('#tipoFilter').value;
  STATE.filter.vend = $('#vendFilter').value;
  STATE.filter.aten = $('#atenFilter').value;
  const mmin = parseFloat($('#montoMin').value);
  const mmax = parseFloat($('#montoMax').value);
  STATE.filter.montoMin = isFinite(mmin) ? mmin : null;
  STATE.filter.montoMax = isFinite(mmax) ? mmax : null;
  STATE.ordenarMonto = $('#ordenarMonto').checked;
  STATE.filter.q = $('#clientSearch').value || '';
  STATE.colorByVend = $('#colorByVend').checked;
  renderClientMarkers();
  renderClientList();
  renderVendLegend();
  updateCounts();
  if (STATE.filter.ciudad || STATE.filter.vend) fitToClients(visibleClients());
}

/* ====================== Motor de optimización de rutas ===================== */

/* Optimizador greedy con presupuesto de tiempo del día.
   Devuelve { visited:[client], legs, timeline } para un tramo de día. */
function buildDaySegment(opts) {
  // opts: { origin, dayEnd(min), startTime(min), pool:[client], mustEndAt (punto),
  //         lunch:{start,dur,taken}, defEstadia, forceReserveReturn (min extra a reservar) }
  const { origin, mustEndAt, defEstadia } = opts;
  let time = opts.startTime;
  let pos = origin;
  const pool = opts.pool.slice();
  const visited = [];
  const timeline = [];
  let lunchTaken = opts.lunch ? opts.lunch.taken : true;

  timeline.push({ type: 'start', time, label: opts.originLabel || 'Inicio', pos });

  while (pool.length) {
    // elegir el cliente no visitado más cercano que quepa en el presupuesto
    let best = -1, bestT = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const t = travelMin(pos, pool[i]);
      if (t < bestT) { bestT = t; best = i; }
    }
    if (best < 0) break;
    const cand = pool[best];
    let travel = legMin(pos, cand);
    let arrival = time + travel;

    // ¿almuerzo antes de atender?
    let lunchInsert = null;
    if (!lunchTaken && opts.lunch && arrival >= opts.lunch.start) {
      lunchInsert = Math.max(opts.lunch.start, time);
    }
    const effArrival = lunchInsert != null ? arrival + opts.lunch.dur : arrival;
    const stay = (cand.estadia != null ? cand.estadia : defEstadia);
    const serviceEnd = effArrival + stay;

    // reservar regreso al punto de cierre del tramo (fin del día / hotel / punto final)
    const backT = opts.reserveReturnTravel === false ? 0 : travelMin(cand, mustEndAt);
    const reserve = opts.forceReserveReturn || 0;
    if (serviceEnd + backT + reserve > opts.dayEnd) {
      // no cabe este cliente -> como es el más cercano, intentamos con el resto
      // pero si el más cercano no cabe, difícilmente otro más lejano quepa: cortar
      pool.splice(best, 1);
      // seguimos probando otros por si uno lejano tiene cierre más cercano
      continue;
    }

    // confirmar visita
    if (lunchInsert != null) {
      timeline.push({ type: 'lunch', time: lunchInsert, endTime: lunchInsert + opts.lunch.dur, label: 'Almuerzo' });
      lunchTaken = true;
      time = lunchInsert + opts.lunch.dur;
      // recomputar viaje desde pos (el viaje ya se hizo conceptualmente; simplificamos:
      // el almuerzo se toma y luego se continúa el viaje restante)
      arrival = time + travel;
    }
    timeline.push({
      type: 'visit', client: cand, arrive: arrival, depart: arrival + stay,
      travel, stay, km: travelKm(pos, cand),
    });
    visited.push(cand);
    time = arrival + stay;
    pos = cand;
    pool.splice(best, 1);
  }

  // cierre del tramo. Si hay hora de inicio de retorno, el viaje de vuelta
  // arranca a esa hora (se espera si se terminó antes).
  let departTime = time;
  if (opts.closeDepartAt != null && departTime < opts.closeDepartAt) {
    timeline.push({ type: 'wait', from: departTime, to: opts.closeDepartAt, label: 'Espera / cierre de visitas' });
    departTime = opts.closeDepartAt;
  }
  const backTravel = travelMin(pos, mustEndAt);
  const backKm = travelKm(pos, mustEndAt);
  timeline.push({ type: 'end', time: departTime + backTravel, depart: departTime, travel: backTravel, km: backKm, label: opts.endLabel || 'Fin', pos: mustEndAt });

  return { visited, timeline, endTime: departTime + backTravel, lunchTaken, remainingPool: pool };
}

/* 2-opt para reducir distancia sobre el conjunto ya elegido (mejora estética) */
function twoOpt(points, origin, dest) {
  if (points.length < 3) return points;
  const dist = (a, b) => travelMin(a, b);
  let route = points.slice();
  let improved = true;
  const total = (r) => {
    let s = dist(origin, r[0]);
    for (let i = 0; i < r.length - 1; i++) s += dist(r[i], r[i + 1]);
    s += dist(r[r.length - 1], dest);
    return s;
  };
  let iter = 0;
  while (improved && iter < 40) {
    improved = false; iter++;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const nr = route.slice(0, i).concat(route.slice(i, k + 1).reverse(), route.slice(k + 1));
        if (total(nr) + 0.01 < total(route)) { route = nr; improved = true; }
      }
    }
  }
  return route;
}

/* ------------------------------ Planificar -------------------------------- */
async function planRoute() {
  const cfg = readConfig();
  if (!cfg) return;

  const pool = STATE.clients.filter(c => STATE.selectedIds.has(c.id));
  if (!pool.length) { alert('Selecciona al menos un cliente (dibuja un área o marca clientes).'); return; }
  if (!cfg.start) { alert('Define el punto de inicio.'); return; }
  if (!cfg.end) { alert('Define el punto final.'); return; }

  STATE.distCache.clear();
  STATE.roadKm.clear();
  STATE.roadMode = false;
  STATE.planNote = '';

  // Rutas reales por carretera (OSRM) si está activo y la cantidad es razonable
  if ($('#useOSRM').checked) {
    const pts = [cfg.start, cfg.end];
    if (cfg.hotel) pts.push(cfg.hotel);
    pool.forEach(c => pts.push(c));
    const uniq = []; const seen = new Set();
    for (const p of pts) { const k = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`; if (!seen.has(k)) { seen.add(k); uniq.push(p); } }
    if (uniq.length > 90) {
      STATE.planNote = `⚠ ${uniq.length} puntos: demasiados para ruta real (máx. 90). Se usó estimación. Reduce la selección o usa "Solo este" vendedor.`;
    } else {
      setPlanBusy(true);
      try { await ensureRoadMatrix(uniq); STATE.roadMode = true; }
      catch (e) { STATE.planNote = `⚠ No se pudo obtener rutas reales (${e.message}). Se usó estimación por distancia.`; }
      finally { setPlanBusy(false); }
    }
  }

  const plan = cfg.tipo === 'local' ? planLocal(cfg, pool) : planMultiDay(cfg, pool);
  if (!plan) return;
  if (STATE.roadMode && !STATE.planNote) STATE.planNote = '🛣️ Tiempos y recorrido calculados con rutas reales por carretera (OSRM), tráfico ×' + trafficFactor().toFixed(1) + '.';
  STATE.lastPlan = plan;
  renderPlan(plan, cfg);
  await drawRouteOnMap(plan, STATE.roadMode);
}

function setPlanBusy(busy) {
  const b = $('#btnPlan');
  if (!b) return;
  b.disabled = busy;
  b.textContent = busy ? '⏳ Calculando rutas reales…' : '🚀 Calcular ruta';
}

/* Planifica automáticamente varias jornadas (día 1, 2, 3…) desde el mismo punto
   de inicio/fin, hasta cubrir todos los clientes seleccionados o agotar el máximo. */
async function planAllDays() {
  const cfg = readConfig();
  if (!cfg) return;
  const pool = STATE.clients.filter(c => STATE.selectedIds.has(c.id));
  if (!pool.length) { alert('Selecciona al menos un cliente.'); return; }
  if (!cfg.start || !cfg.end) { alert('Define el punto de inicio y el final.'); return; }
  if (pool.length > 1200 && !confirm(`Vas a planificar ${pool.length} clientes en varias jornadas (puede generar muchos días y tardar unos segundos). ¿Continuar?`)) return;

  STATE.distCache.clear(); STATE.roadKm.clear(); STATE.roadMode = false; STATE.planNote = '';
  const btn = $('#btnPlanAll'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Planificando…'; }

  // Rutas reales solo si el conjunto es pequeño (≤90 puntos)
  if ($('#useOSRM').checked) {
    const pts = [cfg.start, cfg.end]; pool.forEach(c => pts.push(c));
    const uniq = []; const seen = new Set();
    for (const p of pts) { const k = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`; if (!seen.has(k)) { seen.add(k); uniq.push(p); } }
    if (uniq.length <= 90) { try { await ensureRoadMatrix(uniq); STATE.roadMode = true; } catch (e) { STATE.planNote = '⚠ ' + e.message + ' — se usó estimación.'; } }
    else STATE.planNote = `ℹ ${pool.length} clientes: se usó estimación de distancia (la ruta real por calles aplica solo con ≤90 puntos).`;
  }

  const lunchObj = () => cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur } : null;
  const MAX_DAYS = 90;
  let remaining = pool.slice();
  const days = [];
  let dn = 1;
  // Ceder el hilo un instante para que el botón muestre "Planificando…"
  await new Promise(r => setTimeout(r, 20));
  while (remaining.length && dn <= MAX_DAYS) {
    const seg = buildDaySegment({
      origin: cfg.start, originLabel: 'Punto de inicio', mustEndAt: cfg.end, endLabel: 'Punto final',
      startTime: cfg.entry, dayEnd: cfg.exit, pool: remaining, defEstadia: cfg.defEstadia,
      lunch: cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur, taken: false } : null,
    });
    if (!seg.visited.length) break; // ninguno más cabe en la jornada desde este inicio
    const refined = twoOpt(seg.visited, cfg.start, cfg.end);
    const simOpts = {
      origin: cfg.start, originLabel: 'Punto de inicio', mustEndAt: cfg.end, endLabel: 'Punto final',
      startTime: cfg.entry, dayEnd: cfg.exit, defEstadia: cfg.defEstadia, lunch: lunchObj(),
    };
    const s = simulateFixedOrder({ ...simOpts, order: refined });
    days.push({ label: `Jornada ${dn}`, timeline: s.timeline, visited: s.visited, endTime: s.endTime, order: s.visited.slice(), simOpts });
    remaining = remaining.filter(c => !s.visited.includes(c));
    dn++;
  }

  const plan = { tipo: 'auto', days, notVisited: remaining, removed: [], cfg };
  if (!STATE.planNote) {
    STATE.planNote = `📅 ${days.length} jornada(s) planificada(s) automáticamente${remaining.length ? ' · ' + remaining.length + ' cliente(s) no ubicables en el horario' : ' · todos los clientes cubiertos'}.` + (STATE.roadMode ? ' Rutas reales.' : '');
  }
  STATE.lastPlan = plan;
  renderPlan(plan, cfg);
  await drawRouteOnMap(plan, STATE.roadMode);
  if (btn) { btn.disabled = false; btn.textContent = '📅 Planificar todos los días (auto)'; }
}

function readConfig() {
  const cfg = {
    tipo: $('input[name="tipo"]:checked').value,
    entry: toMin($('#entry').value),
    exit: toMin($('#exit').value),
    lunchStart: toMin($('#lunchStart').value),
    lunchDur: $('#lunchOn').checked ? (Number($('#lunchDur').value) || 0) : 0,
    defEstadia: Number($('#defEstadia').value) || 0,
    start: STATE.startPoint,
    end: STATE.endPoint,
    hotel: STATE.hotel,
    days: Number($('#days').value) || 2,
    returnStart: toMin($('#returnStart').value),
  };
  if (cfg.entry == null || cfg.exit == null) { alert('Define hora de ingreso y de salida.'); return null; }
  if (cfg.exit <= cfg.entry) { alert('La hora de salida debe ser mayor que la de ingreso.'); return null; }
  return cfg;
}

function planLocal(cfg, pool) {
  // Ordenar con greedy + 2-opt, luego presupuestar
  const seg = buildDaySegment({
    origin: cfg.start, originLabel: 'Punto de inicio',
    mustEndAt: cfg.end, endLabel: 'Punto final',
    startTime: cfg.entry, dayEnd: cfg.exit,
    pool, defEstadia: cfg.defEstadia,
    lunch: cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur, taken: false } : null,
  });
  // refinar orden de los visitados con 2-opt y re-simular
  const refinedOrder = twoOpt(seg.visited, cfg.start, cfg.end);
  const simOpts = {
    origin: cfg.start, originLabel: 'Punto de inicio',
    mustEndAt: cfg.end, endLabel: 'Punto final',
    startTime: cfg.entry, dayEnd: cfg.exit, defEstadia: cfg.defEstadia,
    lunch: cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur } : null,
  };
  const seg2 = simulateFixedOrder({ ...simOpts, order: refinedOrder });
  const notVisited = pool.filter(c => !seg2.visited.includes(c));
  return {
    tipo: 'local',
    days: [{ label: 'Día 1', timeline: seg2.timeline, visited: seg2.visited, endTime: seg2.endTime, order: seg2.visited.slice(), simOpts }],
    notVisited, removed: [], cfg,
  };
}

/* Simula un orden fijo respetando presupuesto (recorta lo que no alcanza) */
function simulateFixedOrder(opts) {
  let time = opts.startTime, pos = opts.origin;
  const visited = [], timeline = [];
  let lunchTaken = opts.lunch ? false : true;
  timeline.push({ type: 'start', time, label: opts.originLabel, pos });
  for (const cand of opts.order) {
    const travel = legMin(pos, cand);
    let arrival = time + travel;
    let lunchInsert = null;
    if (!lunchTaken && opts.lunch && arrival >= opts.lunch.start) lunchInsert = Math.max(opts.lunch.start, time);
    const effArrival = lunchInsert != null ? arrival + opts.lunch.dur : arrival;
    const stay = (cand.estadia != null ? cand.estadia : opts.defEstadia);
    const serviceEnd = effArrival + stay;
    const backT = opts.reserveReturnTravel === false ? 0 : travelMin(cand, opts.mustEndAt);
    const reserve = opts.forceReserveReturn || 0;
    // forceAll: incluir todas las paradas del orden aunque excedan el horario (edición manual)
    if (!opts.forceAll && serviceEnd + backT + reserve > opts.dayEnd) continue; // no alcanza -> saltar
    if (lunchInsert != null) {
      timeline.push({ type: 'lunch', time: lunchInsert, endTime: lunchInsert + opts.lunch.dur, label: 'Almuerzo' });
      lunchTaken = true; time = lunchInsert + opts.lunch.dur; arrival = time + travel;
    }
    timeline.push({ type: 'visit', client: cand, arrive: arrival, depart: arrival + stay, travel, stay, km: travelKm(pos, cand) });
    visited.push(cand); time = arrival + stay; pos = cand;
  }
  let departTime = time;
  if (opts.closeDepartAt != null && departTime < opts.closeDepartAt) {
    timeline.push({ type: 'wait', from: departTime, to: opts.closeDepartAt, label: 'Espera / cierre de visitas' });
    departTime = opts.closeDepartAt;
  }
  const backTravel = travelMin(pos, opts.mustEndAt);
  timeline.push({ type: 'end', time: departTime + backTravel, depart: departTime, travel: backTravel, km: travelKm(pos, opts.mustEndAt), label: opts.endLabel, pos: opts.mustEndAt });
  return { visited, timeline, endTime: departTime + backTravel, remainingPool: opts.order.filter(c => !visited.includes(c)) };
}

function planMultiDay(cfg, pool) {
  if (!cfg.hotel) { alert('Para viaje de múltiples días, define la ubicación del hotel.'); return null; }
  const days = [];
  let remaining = pool.slice();
  const lunchDef = () => cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur, taken: false } : null;

  const lunchOpt = () => cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur } : null;

  // Día 1: desde punto de inicio -> zona -> hotel.
  {
    const seg = buildDaySegment({
      origin: cfg.start, originLabel: 'Punto de inicio (salida)',
      mustEndAt: cfg.hotel, endLabel: 'Hotel',
      startTime: cfg.entry, dayEnd: cfg.exit,
      pool: remaining, defEstadia: cfg.defEstadia, lunch: lunchDef(),
    });
    const refined = twoOpt(seg.visited, cfg.start, cfg.hotel);
    const simOpts = {
      origin: cfg.start, originLabel: 'Punto de inicio (salida)',
      mustEndAt: cfg.hotel, endLabel: 'Hotel', startTime: cfg.entry, dayEnd: cfg.exit,
      defEstadia: cfg.defEstadia, lunch: lunchOpt(),
    };
    const s = simulateFixedOrder({ ...simOpts, order: refined });
    days.push({ label: 'Día 1 (salida)', timeline: s.timeline, visited: s.visited, endTime: s.endTime, order: s.visited.slice(), simOpts });
    remaining = remaining.filter(c => !s.visited.includes(c));
  }

  // Días intermedios: hotel -> zona -> hotel
  let dayNum = 2;
  while (remaining.length && dayNum < cfg.days) {
    const seg = buildDaySegment({
      origin: cfg.hotel, originLabel: 'Hotel',
      mustEndAt: cfg.hotel, endLabel: 'Hotel',
      startTime: cfg.entry, dayEnd: cfg.exit,
      pool: remaining, defEstadia: cfg.defEstadia, lunch: lunchDef(),
    });
    const refined = twoOpt(seg.visited, cfg.hotel, cfg.hotel);
    const simOpts = {
      origin: cfg.hotel, originLabel: 'Hotel', mustEndAt: cfg.hotel, endLabel: 'Hotel',
      startTime: cfg.entry, dayEnd: cfg.exit, defEstadia: cfg.defEstadia, lunch: lunchOpt(),
    };
    const s = simulateFixedOrder({ ...simOpts, order: refined });
    if (!s.visited.length) break;
    days.push({ label: `Día ${dayNum}`, timeline: s.timeline, visited: s.visited, endTime: s.endTime, order: s.visited.slice(), simOpts });
    remaining = remaining.filter(c => !s.visited.includes(c));
    dayNum++;
  }

  // Último día (retorno): hotel -> zona -> punto final.
  {
    const retStart = cfg.returnStart != null ? cfg.returnStart : cfg.exit;
    const seg = buildDaySegment({
      origin: cfg.hotel, originLabel: 'Hotel',
      mustEndAt: cfg.end, endLabel: 'Punto final (retorno)',
      startTime: cfg.entry, dayEnd: retStart,
      pool: remaining, defEstadia: cfg.defEstadia, lunch: lunchDef(),
      reserveReturnTravel: false, closeDepartAt: retStart,
    });
    const refined = twoOpt(seg.visited, cfg.hotel, cfg.end);
    const simOpts = {
      origin: cfg.hotel, originLabel: 'Hotel', mustEndAt: cfg.end, endLabel: 'Punto final (retorno)',
      startTime: cfg.entry, dayEnd: retStart, defEstadia: cfg.defEstadia, lunch: lunchOpt(),
      reserveReturnTravel: false, closeDepartAt: retStart,
    };
    const s = simulateFixedOrder({ ...simOpts, order: refined });
    days.push({
      label: `Día ${dayNum} (retorno${retStart != null ? ', inicia ' + fromMin(retStart) : ''})`,
      timeline: s.timeline, visited: s.visited, endTime: s.endTime, isReturn: true, order: s.visited.slice(), simOpts,
    });
    remaining = remaining.filter(c => !s.visited.includes(c));
  }

  return { tipo: 'multi', days, notVisited: remaining, removed: [], cfg };
}

/* Re-simula un día tras editar su orden (mover/eliminar/agregar puntos).
   forceAll: incluye todas las paradas del orden aunque excedan el horario. */
function resimulateDay(day) {
  const s = simulateFixedOrder({ ...day.simOpts, order: day.order, forceAll: true });
  day.timeline = s.timeline; day.visited = s.visited; day.endTime = s.endTime;
}

/* Aplica cambios manuales al plan y refresca vista + mapa */
function refreshEditedPlan() {
  const plan = STATE.lastPlan;
  renderPlan(plan, plan.cfg);
  drawRouteOnMap(plan, false); // recorrido en línea tras editar (los tiempos siguen siendo reales)
}

window.removeStop = function (dayIdx, id) {
  const plan = STATE.lastPlan; if (!plan) return;
  const day = plan.days[dayIdx];
  const c = day.order.find(x => x.id === id); if (!c) return;
  day.order = day.order.filter(x => x.id !== id);
  plan.removed = plan.removed || []; plan.removed.push(c);
  resimulateDay(day);
  refreshEditedPlan();
};

window.moveStop = function (dayIdx, id, dir) {
  const plan = STATE.lastPlan; if (!plan) return;
  const day = plan.days[dayIdx];
  const i = day.order.findIndex(x => x.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= day.order.length) return;
  const tmp = day.order[i]; day.order[i] = day.order[j]; day.order[j] = tmp;
  resimulateDay(day);
  refreshEditedPlan();
};

window.restoreStop = function (id) {
  const plan = STATE.lastPlan; if (!plan) return;
  const idx = (plan.removed || []).findIndex(x => x.id === id);
  if (idx < 0) return;
  const c = plan.removed.splice(idx, 1)[0];
  plan.days[0].order.push(c); // se reincorpora al primer día (al final); reordénalo si hace falta
  resimulateDay(plan.days[0]);
  refreshEditedPlan();
};

/* Crea una ruta nueva usando exactamente los clientes que no alcanzaron en el plan actual */
window.planLeftovers = function () {
  const plan = STATE.lastPlan;
  if (!plan || !plan.notVisited || !plan.notVisited.length) return;
  const ids = plan.notVisited.map(c => c.id);
  STATE.selectedIds = new Set(ids);
  STATE.showOnlySelected = false;
  renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
  planRoute(); // recalcula con la configuración actual (horarios, inicio/fin, etc.)
};

/* Agrega un cliente "no alcanza" al itinerario (forzado, al final del día indicado) */
window.addStop = function (id, dayIdx) {
  const plan = STATE.lastPlan; if (!plan) return;
  const idx = plan.notVisited.findIndex(x => x.id === id);
  if (idx < 0) return;
  const c = plan.notVisited.splice(idx, 1)[0];
  const di = (dayIdx != null && plan.days[dayIdx]) ? dayIdx : 0;
  plan.days[di].order.push(c);
  resimulateDay(plan.days[di]);
  refreshEditedPlan();
};

/* ------------------------------ Render plan ------------------------------- */
function renderPlan(plan, cfg) {
  if (!plan) return;
  const box = $('#results');
  let totalVisits = 0, totalKm = 0, totalMin = 0;
  plan.days.forEach(d => {
    d.timeline.forEach(t => {
      if (t.type === 'visit') { totalVisits++; totalKm += t.km || 0; }
      if (t.km) totalKm += 0; // (km de visitas ya sumado)
      if (t.type === 'end') totalKm += t.km || 0;
    });
  });
  // recomputar km total limpio
  totalKm = 0;
  let totalVenta = 0, nAten = 0, nNoAten = 0;
  plan.days.forEach(d => d.timeline.forEach(t => {
    if (t.km && (t.type === 'visit' || t.type === 'end')) totalKm += t.km;
    if (t.type === 'visit') {
      if (t.client.venta2026 != null) totalVenta += t.client.venta2026;
      if (t.client.atendido === true) nAten++;
      else if (t.client.atendido === false) nNoAten++;
    }
  }));

  let html = '';
  if (STATE.planNote) html += `<div class="plan-note">${escapeHtml(STATE.planNote)}</div>`;
  html += `<div class="summary">
    <div class="stat"><div class="num">${totalVisits}</div><div class="lbl">Clientes en ruta</div></div>
    <div class="stat"><div class="num">${plan.days.length}</div><div class="lbl">${plan.tipo === 'local' ? 'Día' : 'Días'}</div></div>
    <div class="stat"><div class="num">${totalKm.toFixed(1)}</div><div class="lbl">km ${STATE.roadMode ? 'reales' : 'aprox.'}</div></div>
    <div class="stat"><div class="num">${plan.notVisited.length}</div><div class="lbl">Sin alcanzar</div></div>
  </div>
  <div class="route-money">💰 Compra 2026 en ruta: <b>${fmtMoney(totalVenta)}</b> · <span style="color:#16a34a">✓ ${nAten} atendidos</span> · <span style="color:#dc2626">✕ ${nNoAten} no atendidos</span></div>
  <div class="edit-hint">✏️ Puedes reordenar (▲▼) o quitar (✕) clientes de la ruta; los tiempos se recalculan al instante.</div>`;

  const dayColors = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
  plan.days.forEach((d, di) => {
    const dcol = dayColors[di % dayColors.length];
    const over = d.simOpts && !d.isReturn && d.endTime > d.simOpts.dayEnd;
    const overTag = over ? ` <span class="over-tag">⚠ excede la hora de salida</span>` : '';
    html += `<div class="day"><div class="day-head">${escapeHtml(d.label)} <span class="day-sub">${d.visited.length} visitas · termina ${fromMin(d.endTime)}</span>${overTag}</div><div class="timeline">`;
    const nVis = d.order ? d.order.length : d.visited.length;
    let vi = 0;
    d.timeline.forEach(t => {
      if (t.type === 'start') {
        html += tlRow('▶', fromMin(t.time), `<b>${escapeHtml(t.label)}</b>`, 'start');
      } else if (t.type === 'lunch') {
        html += tlRow('🍽', `${fromMin(t.time)}–${fromMin(t.endTime)}`, `<b>Almuerzo</b> (${fmtDur(t.endTime - t.time)})`, 'lunch');
      } else if (t.type === 'visit') {
        const cid = t.client.id;
        const ctrls = `<div class="tl-edit">
          <button ${vi === 0 ? 'disabled' : ''} title="Subir" onclick="moveStop(${di},'${cid}',-1)">▲</button>
          <button ${vi === nVis - 1 ? 'disabled' : ''} title="Bajar" onclick="moveStop(${di},'${cid}',1)">▼</button>
          <button class="del" title="Quitar de la ruta" onclick="removeStop(${di},'${cid}')">✕</button>
        </div>`;
        const cl = t.client;
        html += `<div class="tl-row visit"><div class="tl-ico"><span class="stop-num" style="background:${dcol}">${vi + 1}</span></div><div class="tl-time">${fromMin(t.arrive)}–${fromMin(t.depart)}</div>` +
          `<div class="tl-body"><b>${escapeHtml(cl.nombre)}</b> <span class="tag" style="background:${typeColor(cl)}22;color:${typeColor(cl)}">${escapeHtml(cl.tipo)}</span> <span class="tag" style="background:${atenColor(cl)}1a;color:${atenColor(cl)}">${atenSymbol(cl) || '•'} ${atenLabel(cl)}</span>` +
          `<div class="tl-code">Cód. <b>${escapeHtml(cl.id)}</b>${cl.ruc ? ' · RUC ' + escapeHtml(cl.ruc) : ''}</div>` +
          `<div class="tl-money">💰 Venta 2026: <b>${fmtMoney(cl.venta2026)}</b> <a class="go-link" href="${gmapsUrl(cl.lat, cl.lon)}" target="_blank" rel="noopener">🧭 Ir</a></div>` +
          `<div class="tl-sub">Viaje ${fmtDur(t.travel)} (${t.km.toFixed(1)} km) · Estadía ${fmtDur(t.stay)}${cl.vend && cl.vend !== SIN_VEND ? ' · ' + escapeHtml(cl.vend) : ''}</div>` +
          `<div class="tl-nota">📝 <input type="text" value="${escapeHtml(cl.nota || '')}" placeholder="Nota para el reporte…" onchange="setNota('${cl.id}',this.value)"></div></div>${ctrls}</div>`;
        vi++;
      } else if (t.type === 'wait') {
        html += tlRow('⏸', `${fromMin(t.from)}–${fromMin(t.to)}`, `<b>${escapeHtml(t.label)}</b>`, 'lunch');
      } else if (t.type === 'end') {
        const dep = t.depart != null ? `Sale ${fromMin(t.depart)} · ` : '';
        html += tlRow('🏁', fromMin(t.time), `<b>${escapeHtml(t.label)}</b><div class="tl-sub">${dep}Viaje ${fmtDur(t.travel)} (${(t.km||0).toFixed(1)} km)</div>`, 'end');
      }
    });
    html += `</div></div>`;
  });

  if (plan.removed && plan.removed.length) {
    html += `<div class="removed"><b>Quitados manualmente (${plan.removed.length}):</b><div class="removed-list">` +
      plan.removed.map(c => `<span class="rm-chip">${escapeHtml(c.nombre)} <button title="Reincorporar" onclick="restoreStop('${c.id}')">↩</button></span>`).join('') +
      `</div></div>`;
  }

  if (plan.notVisited.length) {
    const addBtns = (id) => plan.days.length > 1
      ? plan.days.map((d, di) => `<button title="Agregar a ${escapeHtml(d.label)}" onclick="addStop('${id}',${di})">+D${di + 1}</button>`).join('')
      : `<button onclick="addStop('${id}',0)">+ Agregar</button>`;
    html += `<div class="notvisited"><div class="nv-head"><b>No alcanzan (${plan.notVisited.length})</b>` +
      `<button class="nv-plan-btn" onclick="planLeftovers()">🗺️ Crear ruta con estos (${plan.notVisited.length})</button></div>` +
      `<div class="hint" style="margin-top:2px">Clic en “+ Agregar” para meter uno al itinerario actual, o crea una ruta nueva (p. ej. día 2) con todos los que no alcanzan.</div><div class="nv-list">` +
      plan.notVisited.slice(0, 60).map(c => `<span class="nv-chip"><span class="nv-name"><b>${escapeHtml(c.id)}</b> · ${escapeHtml(c.nombre)}${c.venta2026 != null ? ' · ' + fmtMoney(c.venta2026) : ''}</span>${addBtns(c.id)}</span>`).join('') +
      (plan.notVisited.length > 60 ? `<div class="hint">…y ${plan.notVisited.length - 60} más (filtra o reduce la selección)</div>` : '') +
      `<div class="hint">Al agregar se incluye aunque exceda la hora de salida (el día se marca ⚠).</div></div></div>`;
  }

  html += `<div class="export-row">
    <button class="btn-export" onclick="exportPlanPDF()">⬇ Descargar PDF</button>
    <button class="btn-export alt" onclick="exportPlan()">⬇ CSV</button>
  </div>
  <button class="btn-export" style="background:#7c3aed;width:100%;margin-top:8px" onclick="savePlan()">💾 Guardar plan en el historial</button>`;
  box.innerHTML = html;
  $('#resultsPanel').classList.add('open');
}

function tlRow(icon, time, body, cls) {
  return `<div class="tl-row ${cls}"><div class="tl-ico">${icon}</div><div class="tl-time">${time}</div><div class="tl-body">${body}</div></div>`;
}

/* Dibuja la ruta en el mapa. Si useGeometry, traza el recorrido real por calles (OSRM). */
async function drawRouteOnMap(plan, useGeometry) {
  if (STATE.routeLayer) { STATE.map.removeLayer(STATE.routeLayer); STATE.routeLayer = null; }
  if (!plan) return;
  const group = L.featureGroup();
  const colors = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
  const geomJobs = [];
  plan.days.forEach((d, di) => {
    const seq = [];   // puntos ordenados: inicio, visitas, fin
    d.timeline.forEach(t => {
      if (t.type === 'start' && t.pos) seq.push({ lat: t.pos.lat, lon: t.pos.lon });
      if (t.type === 'visit') seq.push({ lat: t.client.lat, lon: t.client.lon });
      if (t.type === 'end' && t.pos) seq.push({ lat: t.pos.lat, lon: t.pos.lon });
    });
    const color = colors[di % colors.length];
    if (seq.length > 1) {
      const straight = seq.map(p => [p.lat, p.lon]);
      const line = L.polyline(straight, { color, weight: 3, opacity: 0.85, dashArray: d.isReturn ? '6 6' : null });
      group.addLayer(line);
      if (useGeometry) geomJobs.push({ seq, line });
      // números de orden
      let order = 0;
      d.timeline.filter(t => t.type === 'visit').forEach(t => {
        order++;
        const ic = L.divIcon({ className: 'order-ic', html: `<div style="background:${color};color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff">${order}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        group.addLayer(L.marker([t.client.lat, t.client.lon], { icon: ic }));
      });
    }
  });
  group.addTo(STATE.map);
  STATE.routeLayer = group;
  try { STATE.map.fitBounds(group.getBounds().pad(0.2)); } catch (e) {}

  // Reemplaza las líneas rectas por la geometría real de las calles (best-effort)
  for (const job of geomJobs) {
    try {
      const latlngs = await fetchRoadGeometry(job.seq);
      if (STATE.routeLayer === group) job.line.setLatLngs(latlngs);
    } catch (e) { /* mantiene la línea recta si falla */ }
  }
}

/* ===================== Historial de planes (localStorage) ================= */
const PLAN_STORE_KEY = 'demaco_planes_v1';
function loadPlanStore() {
  try { return JSON.parse(localStorage.getItem(PLAN_STORE_KEY) || '[]'); } catch (e) { return []; }
}
function savePlanStore(arr) {
  try { localStorage.setItem(PLAN_STORE_KEY, JSON.stringify(arr)); }
  catch (e) { alert('No se pudo guardar (almacenamiento lleno o bloqueado).'); }
}
function ptKey(p) {
  if (p === STATE.startPoint) return 'start';
  if (p === STATE.endPoint) return 'end';
  if (STATE.hotel && p === STATE.hotel) return 'hotel';
  return p ? { lat: p.lat, lon: p.lon } : null;
}

window.savePlan = function () {
  const plan = STATE.lastPlan;
  if (!plan) { alert('Primero calcula una ruta.'); return; }
  const name = prompt('Nombre del plan:', 'Plan ' + new Date().toLocaleDateString('es-EC'));
  if (!name) return;
  const cfg = {
    entry: $('#entry').value, exit: $('#exit').value, lunchOn: $('#lunchOn').checked,
    lunchStart: $('#lunchStart').value, lunchDur: $('#lunchDur').value, defEstadia: $('#defEstadia').value,
    tipo: $('input[name="tipo"]:checked').value, days: $('#days').value, returnStart: $('#returnStart').value,
    useOSRM: $('#useOSRM').checked, traffic: $('#traffic').value, speed: $('#speed').value, roadFactor: $('#roadFactor').value,
    minStop: $('#minStop').value,
    start: STATE.startPoint, end: STATE.endPoint, hotel: STATE.hotel,
  };
  const filters = { ...STATE.filter, colorByVend: STATE.colorByVend, ordenarMonto: STATE.ordenarMonto };
  const days = plan.days.map(d => ({
    label: d.label, isReturn: !!d.isReturn, orderIds: d.order.map(c => c.id),
    sim: {
      originKey: ptKey(d.simOpts.origin), destKey: ptKey(d.simOpts.mustEndAt),
      originLabel: d.simOpts.originLabel, endLabel: d.simOpts.endLabel,
      startTime: d.simOpts.startTime, dayEnd: d.simOpts.dayEnd, defEstadia: d.simOpts.defEstadia,
      lunch: d.simOpts.lunch, reserveReturnTravel: d.simOpts.reserveReturnTravel, closeDepartAt: d.simOpts.closeDepartAt,
    },
  }));
  const notas = {};
  STATE.clients.forEach(c => { if (c.nota) notas[c.id] = c.nota; });
  const rec = {
    id: 'p' + Date.now(), name, date: new Date().toISOString(), tipo: plan.tipo, cfg, filters,
    selectedIds: [...STATE.selectedIds], days,
    notVisitedIds: plan.notVisited.map(c => c.id), removedIds: (plan.removed || []).map(c => c.id), notas,
  };
  const all = loadPlanStore(); all.unshift(rec); savePlanStore(all);
  alert('✅ Plan guardado: ' + name);
  renderHistory();
};

window.deletePlan = function (id) {
  if (!confirm('¿Eliminar este plan guardado?')) return;
  savePlanStore(loadPlanStore().filter(r => r.id !== id));
  renderHistory();
};

window.loadPlan = function (id) {
  const rec = loadPlanStore().find(r => r.id === id);
  if (!rec) return;
  const cfg = rec.cfg;
  // restaurar formulario
  $('#entry').value = cfg.entry; $('#exit').value = cfg.exit; $('#lunchOn').checked = cfg.lunchOn;
  $('#lunchStart').value = cfg.lunchStart; $('#lunchDur').value = cfg.lunchDur; $('#defEstadia').value = cfg.defEstadia;
  const tr = document.querySelector(`input[name="tipo"][value="${cfg.tipo}"]`); if (tr) tr.checked = true;
  $('#multiDayFields').style.display = cfg.tipo === 'multi' ? 'block' : 'none';
  $('#days').value = cfg.days; $('#returnStart').value = cfg.returnStart;
  $('#useOSRM').checked = cfg.useOSRM; $('#traffic').value = cfg.traffic;
  $('#trafficVal').textContent = Number(cfg.traffic).toFixed(1) + '×';
  $('#speed').value = cfg.speed; $('#roadFactor').value = cfg.roadFactor;
  if (cfg.minStop != null) $('#minStop').value = cfg.minStop;
  STATE.startPoint = cfg.start; STATE.endPoint = cfg.end; STATE.hotel = cfg.hotel;
  if (cfg.start) $('#startLabel').textContent = coordLabel(cfg.start);
  if (cfg.end) $('#endLabel').textContent = coordLabel(cfg.end);
  if (cfg.hotel) $('#hotelLabel').textContent = coordLabel(cfg.hotel);
  renderSpecialMarkers();
  // filtros
  const f = rec.filters || {};
  $('#cityFilter').value = f.ciudad || ''; $('#vendFilter').value = f.vend || '';
  $('#tipoFilter').value = f.tipo || ''; $('#atenFilter').value = f.aten || '';
  $('#montoMin').value = f.montoMin != null ? f.montoMin : ''; $('#montoMax').value = f.montoMax != null ? f.montoMax : '';
  $('#clientSearch').value = f.q || ''; $('#colorByVend').checked = !!f.colorByVend; $('#ordenarMonto').checked = !!f.ordenarMonto;
  // selección y notas
  STATE.selectedIds = new Set(rec.selectedIds || []);
  STATE.showOnlySelected = false;
  if (rec.notas) STATE.clients.forEach(c => { if (rec.notas[c.id]) c.nota = rec.notas[c.id]; });
  // reconstruir plan
  STATE.distCache.clear(); STATE.roadKm.clear(); STATE.roadMode = false;
  const byId = new Map(STATE.clients.map(c => [c.id, c]));
  const resolve = (k) => k === 'start' ? STATE.startPoint : k === 'end' ? STATE.endPoint : k === 'hotel' ? STATE.hotel : k;
  const days = rec.days.map(d => {
    const simOpts = {
      origin: resolve(d.sim.originKey), originLabel: d.sim.originLabel,
      mustEndAt: resolve(d.sim.destKey), endLabel: d.sim.endLabel,
      startTime: d.sim.startTime, dayEnd: d.sim.dayEnd, defEstadia: d.sim.defEstadia,
      lunch: d.sim.lunch, reserveReturnTravel: d.sim.reserveReturnTravel, closeDepartAt: d.sim.closeDepartAt,
    };
    const order = d.orderIds.map(id => byId.get(id)).filter(Boolean);
    const s = simulateFixedOrder({ ...simOpts, order, forceAll: true });
    return { label: d.label, isReturn: d.isReturn, timeline: s.timeline, visited: s.visited, endTime: s.endTime, order: order.slice(), simOpts };
  });
  applyFilters(); // aplica filtros y re-dibuja marcadores/lista con la selección
  const plan = {
    tipo: rec.tipo, days,
    notVisited: (rec.notVisitedIds || []).map(id => byId.get(id)).filter(Boolean),
    removed: (rec.removedIds || []).map(id => byId.get(id)).filter(Boolean),
    cfg: readConfig(),
  };
  STATE.planNote = '📂 Plan cargado: ' + rec.name;
  STATE.lastPlan = plan;
  renderPlan(plan, plan.cfg);
  drawRouteOnMap(plan, false);
  // ir a la pestaña Planificador
  $$('.tab-btn').forEach(x => x.classList.remove('active'));
  $$('.tab-panel').forEach(x => x.classList.remove('active'));
  $('.tab-btn[data-tab="tab-plan"]').classList.add('active');
  $('#tab-plan').classList.add('active');
  setTimeout(() => STATE.map.invalidateSize(), 60);
};

function renderHistory() {
  const box = $('#historyList');
  if (!box) return;
  const all = loadPlanStore();
  if (!all.length) { box.innerHTML = '<div class="empty">Aún no has guardado ningún plan. Calcula una ruta y pulsa “💾 Guardar plan”.</div>'; return; }
  box.innerHTML = all.map(r => {
    const nDays = r.days ? r.days.length : 0;
    const nVis = r.days ? r.days.reduce((a, d) => a + (d.orderIds ? d.orderIds.length : 0), 0) : 0;
    const fecha = new Date(r.date).toLocaleString('es-EC');
    return `<div class="hist-card">
      <div class="hist-main">
        <div class="hist-name">${escapeHtml(r.name)}</div>
        <div class="hist-meta">${fecha} · ${escapeHtml(r.tipo)} · ${nDays} jornada(s) · ${nVis} en ruta · ${(r.selectedIds || []).length} seleccionados · ${(r.notVisitedIds || []).length} sin alcanzar · ${(r.removedIds || []).length} excluidos</div>
      </div>
      <div class="hist-actions">
        <button class="btn" onclick="loadPlan('${r.id}')">📂 Cargar</button>
        <button class="btn del" onclick="deletePlan('${r.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

/* Exportar itinerario a PDF (abre vista imprimible → Guardar como PDF).
   Incluye número de parada, horarios, datos del cliente, venta y link "Ir" a Google Maps. */
window.exportPlanPDF = function () {
  const plan = STATE.lastPlan;
  if (!plan) { alert('Primero calcula una ruta.'); return; }
  const dayColors = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
  const cfg = plan.cfg || {};
  const fecha = new Date().toLocaleDateString('es-EC');
  let body = `<h1>Itinerario de ruta de venta</h1>
    <div class="meta">Generado: ${fecha} · Ingreso ${fromMin(cfg.entry)} · Salida ${fromMin(cfg.exit)}${cfg.lunchDur ? ' · Almuerzo ' + fromMin(cfg.lunchStart) + ' (' + cfg.lunchDur + ' min)' : ''}${STATE.roadMode ? ' · Rutas reales (tráfico ×' + trafficFactor().toFixed(1) + ')' : ''}</div>`;

  plan.days.forEach((d, di) => {
    const col = dayColors[di % dayColors.length];
    body += `<div class="day"><h2 style="border-color:${col}">${escapeHtml(d.label)} · ${d.visited.length} paradas · termina ${fromMin(d.endTime)}</h2>
      <table><thead><tr><th>Parada</th><th>Hora</th><th>Código / RUC</th><th>Cliente</th><th>Tipo</th><th>Venta 2026</th><th>Nota</th><th>Ubicación</th></tr></thead><tbody>`;
    let n = 0;
    d.timeline.forEach(t => {
      if (t.type === 'start') {
        body += `<tr class="pt"><td>▶</td><td>${fromMin(t.time)}</td><td colspan="6"><b>${escapeHtml(t.label)}</b></td></tr>`;
      } else if (t.type === 'lunch') {
        body += `<tr class="pt"><td>🍽</td><td>${fromMin(t.time)}–${fromMin(t.endTime)}</td><td colspan="6">Almuerzo</td></tr>`;
      } else if (t.type === 'wait') {
        body += `<tr class="pt"><td>⏸</td><td>${fromMin(t.from)}–${fromMin(t.to)}</td><td colspan="6">${escapeHtml(t.label)}</td></tr>`;
      } else if (t.type === 'visit') {
        n++;
        const cl = t.client;
        body += `<tr><td><span class="num" style="background:${col}">${n}</span></td>` +
          `<td>${fromMin(t.arrive)}–${fromMin(t.depart)}</td>` +
          `<td><b>${escapeHtml(cl.id)}</b>${cl.ruc ? '<br><span class="sub">RUC ' + escapeHtml(cl.ruc) + '</span>' : ''}</td>` +
          `<td><b>${escapeHtml(cl.nombre)}</b>${cl.vend && cl.vend !== SIN_VEND ? '<br><span class="sub">' + escapeHtml(cl.vend) + '</span>' : ''}</td>` +
          `<td>${escapeHtml(cl.tipo)}${cl.abat1 ? ' (' + escapeHtml(cl.abat1) + ')' : ''}</td>` +
          `<td class="r">${fmtMoney(cl.venta2026)}</td>` +
          `<td class="nota">${escapeHtml(cl.nota || '')}</td>` +
          `<td><a href="${gmapsViewUrl(cl.lat, cl.lon)}">📍 Ver en Google</a></td></tr>`;
      } else if (t.type === 'end') {
        body += `<tr class="pt"><td>🏁</td><td>${fromMin(t.time)}</td><td colspan="6"><b>${escapeHtml(t.label)}</b> — viaje ${fmtDur(t.travel)} (${(t.km || 0).toFixed(1)} km)</td></tr>`;
      }
    });
    body += `</tbody></table></div>`;
  });

  // ---- Resumen consolidado por vendedor (clientes visitados) ----
  const byVend = new Map();
  plan.days.forEach((d, di) => {
    let n = 0;
    d.timeline.forEach(t => {
      if (t.type !== 'visit') return;
      n++;
      const cl = t.client; const v = cl.vend || SIN_VEND;
      if (!byVend.has(v)) byVend.set(v, { clients: [], total: 0 });
      const o = byVend.get(v);
      o.clients.push({ cl, day: d.label, stop: n });
      if (cl.venta2026 != null) o.total += cl.venta2026;
    });
  });
  if (byVend.size) {
    const vsorted = Array.from(byVend.entries()).sort((a, b) => b[1].clients.length - a[1].clients.length);
    const totVisit = vsorted.reduce((s, [, o]) => s + o.clients.length, 0);
    const totMoney = vsorted.reduce((s, [, o]) => s + o.total, 0);
    body += `<div class="day vsum-wrap"><h2>Resumen por vendedor · ${vsorted.length} vendedor(es) · ${totVisit} visitas · ${fmtMoney(totMoney)}</h2>`;
    vsorted.forEach(([v, o]) => {
      body += `<div class="vsum"><h3>${escapeHtml(v)} — ${o.clients.length} cliente(s) · ${fmtMoney(o.total)}</h3>
        <table><thead><tr><th>Jornada</th><th>Parada</th><th>Código</th><th>Cliente</th><th>Tipo</th><th>Venta 2026</th></tr></thead><tbody>`;
      o.clients.forEach(x => {
        body += `<tr><td>${escapeHtml(x.day)}</td><td>${x.stop}</td><td><b>${escapeHtml(x.cl.id)}</b></td>` +
          `<td>${escapeHtml(x.cl.nombre)}</td><td>${escapeHtml(x.cl.tipo)}</td><td class="r">${fmtMoney(x.cl.venta2026)}</td></tr>`;
      });
      body += `</tbody></table></div>`;
    });
    body += `</div>`;
  }

  if (plan.notVisited && plan.notVisited.length) {
    body += `<div class="nv"><b>No alcanzan (${plan.notVisited.length}):</b> ` +
      plan.notVisited.slice(0, 120).map(c => `[${escapeHtml(c.id)}] ${escapeHtml(c.nombre)}`).join(' · ') + '</div>';
  }

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Itinerario de ruta</title>
    <style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
      h1{font-size:20px;margin:0 0 4px} .meta{color:#64748b;font-size:12px;margin-bottom:16px}
      .day{margin-bottom:22px} h2{font-size:14px;border-left:5px solid #2563eb;padding-left:8px;margin:0 0 8px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #e2e8f0;padding:5px 7px;text-align:left;vertical-align:top}
      th{background:#f8fafc;font-size:11px} td.r{text-align:right;font-weight:bold} .sub{color:#64748b;font-size:10.5px}
      tr.pt td{background:#f8fafc;color:#334155} .num{display:inline-block;min-width:18px;text-align:center;color:#fff;border-radius:50%;padding:1px 5px;font-weight:bold}
      td.nota{min-width:120px;color:#334155;font-style:italic}
      .vsum-wrap h2{border-color:#7c3aed}
      .vsum{margin:8px 0 12px} .vsum h3{font-size:12.5px;margin:0 0 4px;background:#f5f3ff;border-left:4px solid #7c3aed;padding:4px 8px}
      a{color:#2563eb;text-decoration:none;font-weight:600;white-space:nowrap} .nv{margin-top:10px;color:#7f1d1d;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px;font-size:11px}
      @media print{ body{margin:10px} .day{page-break-inside:avoid} }
    </style></head><body>${body}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para descargar el PDF.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
};

/* Exportar CSV del itinerario */
window.exportPlan = function () {
  const plan = STATE.lastPlan;
  if (!plan) return;
  const rows = [['Día', 'Orden', 'Hora llegada', 'Hora salida', 'Cliente', 'Tipo', 'Vendedor', 'Atención', 'Compra 2026', 'Lat', 'Lon', 'Viaje (min)', 'km', 'Estadía (min)']];
  plan.days.forEach(d => {
    let order = 0;
    d.timeline.forEach(t => {
      if (t.type === 'visit') {
        order++;
        const cl = t.client;
        rows.push([d.label, order, fromMin(t.arrive), fromMin(t.depart), cl.nombre, cl.tipo,
          cl.vend || '', atenLabel(cl), cl.venta2026 != null ? cl.venta2026.toFixed(2) : '',
          cl.lat.toFixed(6), cl.lon.toFixed(6), Math.round(t.travel), t.km.toFixed(2), Math.round(t.stay)]);
      } else if (t.type === 'lunch') {
        rows.push([d.label, '', fromMin(t.time), fromMin(t.endTime), 'ALMUERZO', '', '', '', '', '', '', '', '', t.endTime - t.time]);
      } else if (t.type === 'end') {
        rows.push([d.label, '', '', fromMin(t.time), t.label, '', '', '', '', '', '', Math.round(t.travel || 0), (t.km || 0).toFixed(2), '']);
      }
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'itinerario_ruta.csv';
  a.click();
};

/* --------------------------------- UI wiring ------------------------------ */
function wireUI() {
  // Tabs
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
    $$('.tab-btn').forEach(x => x.classList.remove('active'));
    $$('.tab-panel').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('#' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'tab-plan' && STATE.map) setTimeout(() => STATE.map.invalidateSize(), 50);
    if (b.dataset.tab === 'tab-vendors') renderVendorSummary();
    if (b.dataset.tab === 'tab-history') renderHistory();
  }));

  // Resumen por vendedor: ordenar por columna, buscar, exportar
  $$('#vsTable thead th[data-sort]').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (key === 'color') return;
    VS_SORT.dir = (VS_SORT.key === key) ? -VS_SORT.dir : (key === 'vend' || key === 'top' ? 1 : -1);
    VS_SORT.key = key;
    renderVendorSummary();
  }));
  $('#vsSearch').addEventListener('input', renderVendorSummary);
  $('#vsExport').addEventListener('click', exportVendorSummary);

  // Tipo de ruta -> mostrar/ocultar campos multi-día
  $$('input[name="tipo"]').forEach(r => r.addEventListener('change', () => {
    $('#multiDayFields').style.display = $('input[name="tipo"]:checked').value === 'multi' ? 'block' : 'none';
  }));

  // Interruptor de almuerzo -> habilitar/deshabilitar campos
  const toggleLunch = () => {
    const on = $('#lunchOn').checked;
    $('#lunchFields').style.opacity = on ? '1' : '0.45';
    $('#lunchStart').disabled = !on;
    $('#lunchDur').disabled = !on;
  };
  $('#lunchOn').addEventListener('change', toggleLunch);
  toggleLunch();

  // Picks
  $$('.pick-btn').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.pick;
    setPickMode(STATE.pickMode === mode ? null : mode);
  }));

  // Datos
  $('#btnSample').addEventListener('click', () => {
    STATE.clients = makeSample();
    STATE.selectedIds = new Set(STATE.clients.map(c => c.id));
    afterClientsLoaded();
  });
  $('#csvFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => importCSV(rd.result);
    rd.readAsText(f, 'utf-8');
  });
  $('#btnPaste').addEventListener('click', () => {
    const t = $('#pasteArea').value.trim();
    if (t) importCSV(t);
  });
  $('#clientSearch').addEventListener('input', applyFilters);
  $('#cityFilter').addEventListener('change', applyFilters);
  $('#tipoFilter').addEventListener('change', applyFilters);
  $('#vendFilter').addEventListener('change', applyFilters);
  $('#atenFilter').addEventListener('change', applyFilters);
  $('#montoMin').addEventListener('input', applyFilters);
  $('#montoMax').addEventListener('input', applyFilters);
  $('#ordenarMonto').addEventListener('change', applyFilters);
  $('#colorByVend').addEventListener('change', applyFilters);
  const traffic = $('#traffic');
  if (traffic) {
    const upd = () => { $('#trafficVal').textContent = Number(traffic.value).toFixed(1) + '×'; };
    traffic.addEventListener('input', upd); upd();
  }
  $('#btnSelectAll').addEventListener('click', () => {
    // Selecciona solo los visibles según el filtro actual (sector/ciudad/tipo/búsqueda)
    visibleClients().forEach(c => STATE.selectedIds.add(c.id));
    renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
  });
  $('#btnSelectNone').addEventListener('click', () => {
    STATE.selectedIds = new Set();
    STATE.showOnlySelected = false;
    if (STATE.drawnArea) { STATE.layers.drawn.clearLayers(); STATE.drawnArea = null; }
    renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
  });
  $('#btnClearArea').addEventListener('click', () => {
    STATE.layers.drawn.clearLayers(); STATE.drawnArea = null; STATE.showOnlySelected = false;
    renderClientMarkers(); renderClientList(); renderVendLegend(); updateCounts();
  });

  $('#btnPlan').addEventListener('click', planRoute);
  $('#btnPlanAll').addEventListener('click', planAllDays);
  $('#btnCloseResults').addEventListener('click', () => $('#resultsPanel').classList.remove('open'));

  // Config de puntos por texto
  $('#startCoords').addEventListener('change', () => setPointFromText('start'));
  $('#endCoords').addEventListener('change', () => setPointFromText('end'));
  $('#hotelCoords').addEventListener('change', () => setPointFromText('hotel'));
}

function setPointFromText(which) {
  const el = $('#' + which + 'Coords');
  const parts = el.value.split(',').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && isFinite(parts[0]) && isFinite(parts[1])) {
    const p = { lat: parts[0], lon: parts[1], label: which };
    if (which === 'start') { STATE.startPoint = p; $('#startLabel').textContent = coordLabel(p); }
    if (which === 'end') { STATE.endPoint = p; $('#endLabel').textContent = coordLabel(p); }
    if (which === 'hotel') { STATE.hotel = p; $('#hotelLabel').textContent = coordLabel(p); }
    renderSpecialMarkers();
  }
}

/* --------------------------------- Init ----------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  wireUI();
  initMap();
  // Carga los clientes reales geolocalizados (data/clientes.js). Si no existen, usa ejemplo.
  if (Array.isArray(window.CLIENTES) && window.CLIENTES.length) {
    STATE.vendInfo = window.VENDEDORES || {};
    STATE.clients = window.CLIENTES.map(c => ({
      id: String(c.id), nombre: c.nombre, lat: c.lat, lon: c.lon,
      tipo: c.tipo || 'Cliente', abat1: c.abat1 || '', dir: c.dir || '', ruc: c.ruc || '',
      ciudad: c.ciudad || '', vend: c.vend || SIN_VEND, codVend: c.codVend || '',
      venta2026: (typeof c.venta2026 === 'number') ? c.venta2026 : null,
      atendido: (typeof c.atendido === 'boolean') ? c.atendido : null, // null = sin dato
      estadia: null,
    }));
  } else {
    STATE.clients = makeSample();
  }
  STATE.selectedIds = new Set(); // arranca sin selección; el usuario elige sector/área
  afterClientsLoaded();
});
