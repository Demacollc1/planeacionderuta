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
  canvas: null,         // renderer canvas para rendimiento
  filter: { ciudad: '', tipo: '', q: '', vend: '' },
  colorByVend: false,
  vendInfo: {},         // nombre -> {n, i}
};

const LIST_CAP = 400; // máximo de filas dibujadas en la lista (rendimiento)
const SIN_VEND = '(Sin vendedor)';

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

/* Tiempo de viaje en minutos entre dos puntos (haversine + factor vía + velocidad) */
function travelMin(a, b) {
  if (!a || !b) return 0;
  const key = `${a.lat.toFixed(5)},${a.lon.toFixed(5)}|${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
  if (STATE.distCache.has(key)) return STATE.distCache.get(key);
  const speed = Number($('#speed').value) || 30;       // km/h
  const factor = Number($('#roadFactor').value) || 1.3; // factor de vía
  const km = haversineKm(a, b) * factor;
  const min = (km / speed) * 60;
  STATE.distCache.set(key, min);
  return min;
}
function travelKm(a, b) {
  const factor = Number($('#roadFactor').value) || 1.3;
  return haversineKm(a, b) * factor;
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
  map.on(L.Draw.Event.DELETED, () => { STATE.drawnArea = null; });
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
  renderClientMarkers();
  renderClientList();
  updateCounts();
}

/* Clientes visibles según filtros de sector/ciudad, tipo y búsqueda */
function visibleClients() {
  const f = STATE.filter;
  const q = (f.q || '').toLowerCase();
  return STATE.clients.filter(c => {
    if (f.ciudad && (c.ciudad || '') !== f.ciudad) return false;
    if (f.tipo && (c.tipo || '') !== f.tipo) return false;
    if (f.vend && (c.vend || SIN_VEND) !== f.vend) return false;
    if (q && !(`${c.nombre} ${c.dir} ${c.tipo} ${c.ruc || ''} ${c.ciudad || ''} ${c.vend || ''}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

/* Marcadores de clientes (circleMarker sobre canvas = fluido con miles de puntos) */
function renderClientMarkers() {
  STATE.markers.forEach(m => STATE.map.removeLayer(m));
  STATE.markers.clear();
  const vis = visibleClients();
  vis.forEach(c => {
    const selected = STATE.selectedIds.has(c.id);
    let fill;
    if (STATE.colorByVend) fill = vendorColor(c.vend);
    else fill = selected ? '#16a34a' : (c.tipo === 'Proveedor' ? '#f59e0b' : '#3b82f6');
    const m = L.circleMarker([c.lat, c.lon], {
      renderer: STATE.canvas,
      radius: selected ? 6 : 4,
      color: selected ? '#0f172a' : '#fff',
      weight: selected ? 2 : 0.5,
      fillColor: fill,
      fillOpacity: selected ? 0.95 : 0.75,
    });
    m.bindPopup(() => `<b>${escapeHtml(c.nombre)}</b><br>` +
      `<span style="color:#64748b">${escapeHtml(c.tipo)}${c.ruc ? ' · RUC ' + escapeHtml(c.ruc) : ''}</span><br>` +
      `${escapeHtml(c.dir)}${c.ciudad ? '<br>' + escapeHtml(c.ciudad) : ''}<br>` +
      `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:50%;background:${vendorColor(c.vend)};display:inline-block"></span><b>${escapeHtml(c.vend || SIN_VEND)}</b></span><br>` +
      `<button onclick="toggleClient('${c.id}')">${STATE.selectedIds.has(c.id) ? '➖ Quitar de la ruta' : '➕ Agregar a la ruta'}</button>`);
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
  const list = visibleClients();
  const shown = list.slice(0, LIST_CAP);
  let html = shown.map(c => {
    const sel = STATE.selectedIds.has(c.id);
    return `<div class="client-row ${sel ? 'sel' : ''}">
      <input type="checkbox" ${sel ? 'checked' : ''} onchange="toggleClient('${c.id}')">
      <div class="client-meta" onclick="flyTo('${c.id}')">
        <div class="cn">${escapeHtml(c.nombre)}</div>
        <div class="cd"><span style="color:${vendorColor(c.vend)}">●</span> ${escapeHtml(c.vend || SIN_VEND)}${c.ciudad ? ' · ' + escapeHtml(c.ciudad) : ''}</div>
      </div>
      <input class="estadia-in" type="number" min="0" step="5" placeholder="def"
        value="${c.estadia ?? ''}" title="Tiempo de estadía (min) para este cliente"
        onchange="setEstadia('${c.id}', this.value)">
    </div>`;
  }).join('');
  if (!shown.length) html = '<div class="empty">No hay clientes con estos filtros.</div>';
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
  if (!STATE.colorByVend) { box.style.display = 'none'; return; }
  const counts = new Map();
  visibleClients().forEach(c => { const v = c.vend || SIN_VEND; counts.set(v, (counts.get(v) || 0) + 1); });
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  box.style.display = 'block';
  box.innerHTML = `<div style="font-size:11px;color:#64748b;padding:2px 4px 5px">${rows.length} vendedor(es) · clic para filtrar</div>` +
    rows.map(([v, n]) => `<div class="lg-row ${STATE.filter.vend === v ? 'on' : ''}" onclick="filterVend('${v.replace(/'/g, "\\'")}')">
      <span class="sw" style="background:${vendorColor(v)}"></span>
      <span class="lg-name">${escapeHtml(v)}</span><span class="lg-n">${n}</span></div>`).join('');
}

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
    let travel = travelMin(pos, cand);
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
function planRoute() {
  const cfg = readConfig();
  if (!cfg) return;

  const pool = STATE.clients.filter(c => STATE.selectedIds.has(c.id));
  if (!pool.length) { alert('Selecciona al menos un cliente (dibuja un área o marca clientes).'); return; }
  if (!cfg.start) { alert('Define el punto de inicio.'); return; }
  if (!cfg.end) { alert('Define el punto final.'); return; }

  STATE.distCache.clear();

  let plan;
  if (cfg.tipo === 'local') plan = planLocal(cfg, pool);
  else plan = planMultiDay(cfg, pool);

  STATE.lastPlan = plan;
  renderPlan(plan, cfg);
  drawRouteOnMap(plan);
}

function readConfig() {
  const cfg = {
    tipo: $('input[name="tipo"]:checked').value,
    entry: toMin($('#entry').value),
    exit: toMin($('#exit').value),
    lunchStart: toMin($('#lunchStart').value),
    lunchDur: Number($('#lunchDur').value) || 0,
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
  const seg2 = simulateFixedOrder({
    origin: cfg.start, originLabel: 'Punto de inicio',
    mustEndAt: cfg.end, endLabel: 'Punto final',
    startTime: cfg.entry, dayEnd: cfg.exit,
    order: refinedOrder, defEstadia: cfg.defEstadia,
    lunch: cfg.lunchDur ? { start: cfg.lunchStart, dur: cfg.lunchDur, taken: false } : null,
  });
  const notVisited = pool.filter(c => !seg2.visited.includes(c));
  return { tipo: 'local', days: [{ label: 'Día 1', timeline: seg2.timeline, visited: seg2.visited, endTime: seg2.endTime }], notVisited, cfg };
}

/* Simula un orden fijo respetando presupuesto (recorta lo que no alcanza) */
function simulateFixedOrder(opts) {
  let time = opts.startTime, pos = opts.origin;
  const visited = [], timeline = [];
  let lunchTaken = opts.lunch ? false : true;
  timeline.push({ type: 'start', time, label: opts.originLabel, pos });
  for (const cand of opts.order) {
    const travel = travelMin(pos, cand);
    let arrival = time + travel;
    let lunchInsert = null;
    if (!lunchTaken && opts.lunch && arrival >= opts.lunch.start) lunchInsert = Math.max(opts.lunch.start, time);
    const effArrival = lunchInsert != null ? arrival + opts.lunch.dur : arrival;
    const stay = (cand.estadia != null ? cand.estadia : opts.defEstadia);
    const serviceEnd = effArrival + stay;
    const backT = opts.reserveReturnTravel === false ? 0 : travelMin(cand, opts.mustEndAt);
    const reserve = opts.forceReserveReturn || 0;
    if (serviceEnd + backT + reserve > opts.dayEnd) continue; // no alcanza -> saltar
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

  // Día 1: desde punto de inicio -> zona -> hotel. Reservamos viaje ida (implícito en travel).
  {
    const seg = buildDaySegment({
      origin: cfg.start, originLabel: 'Punto de inicio (salida)',
      mustEndAt: cfg.hotel, endLabel: 'Hotel',
      startTime: cfg.entry, dayEnd: cfg.exit,
      pool: remaining, defEstadia: cfg.defEstadia, lunch: lunchDef(),
    });
    const refined = twoOpt(seg.visited, cfg.start, cfg.hotel);
    const s = simulateFixedOrder({
      origin: cfg.start, originLabel: 'Punto de inicio (salida)',
      mustEndAt: cfg.hotel, endLabel: 'Hotel', startTime: cfg.entry, dayEnd: cfg.exit,
      order: refined, defEstadia: cfg.defEstadia, lunch: lunchDef(),
    });
    days.push({ label: 'Día 1 (salida)', timeline: s.timeline, visited: s.visited, endTime: s.endTime });
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
    const s = simulateFixedOrder({
      origin: cfg.hotel, originLabel: 'Hotel', mustEndAt: cfg.hotel, endLabel: 'Hotel',
      startTime: cfg.entry, dayEnd: cfg.exit, order: refined, defEstadia: cfg.defEstadia, lunch: lunchDef(),
    });
    if (!s.visited.length) break;
    days.push({ label: `Día ${dayNum}`, timeline: s.timeline, visited: s.visited, endTime: s.endTime });
    remaining = remaining.filter(c => !s.visited.includes(c));
    dayNum++;
  }

  // Último día (retorno): hotel -> zona -> punto final.
  // Se visita hasta la hora de inicio de retorno; a esa hora arranca el viaje de vuelta.
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
    const s = simulateFixedOrder({
      origin: cfg.hotel, originLabel: 'Hotel', mustEndAt: cfg.end, endLabel: 'Punto final (retorno)',
      startTime: cfg.entry, dayEnd: retStart,
      order: refined, defEstadia: cfg.defEstadia, lunch: lunchDef(),
      reserveReturnTravel: false, closeDepartAt: retStart,
    });
    // El tramo de retorno agrega el viaje hotel/última visita -> punto final (ya incluido en 'end')
    days.push({
      label: `Día ${dayNum} (retorno${retStart != null ? ', inicia ' + fromMin(retStart) : ''})`,
      timeline: s.timeline, visited: s.visited, endTime: s.endTime, isReturn: true,
    });
    remaining = remaining.filter(c => !s.visited.includes(c));
  }

  return { tipo: 'multi', days, notVisited: remaining, cfg };
}

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
  plan.days.forEach(d => d.timeline.forEach(t => { if (t.km && (t.type === 'visit' || t.type === 'end')) totalKm += t.km; }));

  let html = `<div class="summary">
    <div class="stat"><div class="num">${totalVisits}</div><div class="lbl">Clientes en ruta</div></div>
    <div class="stat"><div class="num">${plan.days.length}</div><div class="lbl">${plan.tipo === 'local' ? 'Día' : 'Días'}</div></div>
    <div class="stat"><div class="num">${totalKm.toFixed(1)}</div><div class="lbl">km aprox.</div></div>
    <div class="stat"><div class="num">${plan.notVisited.length}</div><div class="lbl">Sin alcanzar</div></div>
  </div>`;

  plan.days.forEach((d, di) => {
    html += `<div class="day"><div class="day-head">${escapeHtml(d.label)} <span class="day-sub">${d.visited.length} visitas · termina ${fromMin(d.endTime)}</span></div><div class="timeline">`;
    d.timeline.forEach(t => {
      if (t.type === 'start') {
        html += tlRow('▶', fromMin(t.time), `<b>${escapeHtml(t.label)}</b>`, 'start');
      } else if (t.type === 'lunch') {
        html += tlRow('🍽', `${fromMin(t.time)}–${fromMin(t.endTime)}`, `<b>Almuerzo</b> (${fmtDur(t.endTime - t.time)})`, 'lunch');
      } else if (t.type === 'visit') {
        html += tlRow('📍', `${fromMin(t.arrive)}–${fromMin(t.depart)}`,
          `<b>${escapeHtml(t.client.nombre)}</b> <span class="tag">${escapeHtml(t.client.tipo)}</span>` +
          `<div class="tl-sub">Viaje ${fmtDur(t.travel)} (${t.km.toFixed(1)} km) · Estadía ${fmtDur(t.stay)}</div>`, 'visit');
      } else if (t.type === 'wait') {
        html += tlRow('⏸', `${fromMin(t.from)}–${fromMin(t.to)}`, `<b>${escapeHtml(t.label)}</b>`, 'lunch');
      } else if (t.type === 'end') {
        const dep = t.depart != null ? `Sale ${fromMin(t.depart)} · ` : '';
        html += tlRow('🏁', fromMin(t.time), `<b>${escapeHtml(t.label)}</b><div class="tl-sub">${dep}Viaje ${fmtDur(t.travel)} (${(t.km||0).toFixed(1)} km)</div>`, 'end');
      }
    });
    html += `</div></div>`;
  });

  if (plan.notVisited.length) {
    html += `<div class="notvisited"><b>No alcanzan (${plan.notVisited.length}):</b> ` +
      plan.notVisited.map(c => escapeHtml(c.nombre)).join(', ') +
      `<div class="hint">Sugerencia: amplía horario, reduce estadía, o agrega días.</div></div>`;
  }

  html += `<button class="btn-export" onclick="exportPlan()">⬇ Exportar itinerario (CSV)</button>`;
  box.innerHTML = html;
  $('#resultsPanel').classList.add('open');
}

function tlRow(icon, time, body, cls) {
  return `<div class="tl-row ${cls}"><div class="tl-ico">${icon}</div><div class="tl-time">${time}</div><div class="tl-body">${body}</div></div>`;
}

/* Dibuja la ruta en el mapa */
function drawRouteOnMap(plan) {
  if (STATE.routeLayer) { STATE.map.removeLayer(STATE.routeLayer); STATE.routeLayer = null; }
  if (!plan) return;
  const group = L.featureGroup();
  const colors = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
  plan.days.forEach((d, di) => {
    const pts = [];
    d.timeline.forEach(t => {
      if (t.type === 'start' && t.pos) pts.push([t.pos.lat, t.pos.lon]);
      if (t.type === 'visit') pts.push([t.client.lat, t.client.lon]);
      if (t.type === 'end' && t.pos) pts.push([t.pos.lat, t.pos.lon]);
    });
    if (pts.length > 1) {
      const line = L.polyline(pts, { color: colors[di % colors.length], weight: 3, opacity: 0.8, dashArray: d.isReturn ? '6 6' : null });
      group.addLayer(line);
      // números de orden
      let order = 0;
      d.timeline.filter(t => t.type === 'visit').forEach(t => {
        order++;
        const ic = L.divIcon({ className: 'order-ic', html: `<div style="background:${colors[di % colors.length]};color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff">${order}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        group.addLayer(L.marker([t.client.lat, t.client.lon], { icon: ic }));
      });
    }
  });
  group.addTo(STATE.map);
  STATE.routeLayer = group;
  try { STATE.map.fitBounds(group.getBounds().pad(0.2)); } catch (e) {}
}

/* Exportar CSV del itinerario */
window.exportPlan = function () {
  const plan = STATE.lastPlan;
  if (!plan) return;
  const rows = [['Día', 'Orden', 'Hora llegada', 'Hora salida', 'Cliente', 'Tipo', 'Lat', 'Lon', 'Viaje (min)', 'km', 'Estadía (min)']];
  plan.days.forEach(d => {
    let order = 0;
    d.timeline.forEach(t => {
      if (t.type === 'visit') {
        order++;
        rows.push([d.label, order, fromMin(t.arrive), fromMin(t.depart), t.client.nombre, t.client.tipo,
          t.client.lat.toFixed(6), t.client.lon.toFixed(6), Math.round(t.travel), t.km.toFixed(2), Math.round(t.stay)]);
      } else if (t.type === 'lunch') {
        rows.push([d.label, '', fromMin(t.time), fromMin(t.endTime), 'ALMUERZO', '', '', '', '', '', t.endTime - t.time]);
      } else if (t.type === 'end') {
        rows.push([d.label, '', '', fromMin(t.time), t.label, '', '', '', Math.round(t.travel || 0), (t.km || 0).toFixed(2), '']);
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
  $('#colorByVend').addEventListener('change', applyFilters);
  $('#btnSelectAll').addEventListener('click', () => {
    // Selecciona solo los visibles según el filtro actual (sector/ciudad/tipo/búsqueda)
    visibleClients().forEach(c => STATE.selectedIds.add(c.id));
    renderClientMarkers(); renderClientList(); updateCounts();
  });
  $('#btnSelectNone').addEventListener('click', () => {
    STATE.selectedIds = new Set();
    if (STATE.drawnArea) { STATE.layers.drawn.clearLayers(); STATE.drawnArea = null; }
    renderClientMarkers(); renderClientList(); updateCounts();
  });
  $('#btnClearArea').addEventListener('click', () => {
    STATE.layers.drawn.clearLayers(); STATE.drawnArea = null;
  });

  $('#btnPlan').addEventListener('click', planRoute);
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
      tipo: c.tipo || 'Cliente', dir: c.dir || '', ruc: c.ruc || '',
      ciudad: c.ciudad || '', vend: c.vend || SIN_VEND, codVend: c.codVend || '',
      estadia: null,
    }));
  } else {
    STATE.clients = makeSample();
  }
  STATE.selectedIds = new Set(); // arranca sin selección; el usuario elige sector/área
  afterClientsLoaded();
});
