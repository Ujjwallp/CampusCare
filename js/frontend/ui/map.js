// ─── IIIT GUWAHATI CAMPUS MAP (Leaflet + free Esri satellite imagery) ───
// Campus: Bongora, Guwahati: 26.0813° N, 91.5620° E
const CAMPUS = {
  center: [26.0813, 91.5620],
  bounds: [[26.0785, 91.5588], [26.0842, 91.5652]],   // approx. outline of the 67-acre campus (edit if needed)
};

function makeCampusMap(el, { zoom = 17, interactive = true } = {}) {
  if (typeof L === 'undefined') return null;
  const map = L.map(el, {
    center: CAMPUS.center, zoom, minZoom: 15, maxZoom: 19,
    maxBounds: L.latLngBounds(CAMPUS.bounds).pad(0.8), maxBoundsViscosity: 1.0,   // the map stays on campus
    zoomControl: interactive, attributionControl: true, scrollWheelZoom: interactive, dragging: interactive,
  });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagery © Esri',
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 18, opacity: 0.9,
  }).addTo(map);
  // Campus outline so people can see whether a spot is on campus
  L.rectangle(CAMPUS.bounds, { color: '#d4af37', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(map)
    .bindTooltip('IIIT Guwahati campus', { permanent: false, direction: 'top' });
  return map;
}

function pinIcon(color, label = '') {
  return L.divIcon({
    className: 'cc-pin',
    html: `<div style="--c:${color}"><span>${label}</span></div>`,
    iconSize: [28, 36], iconAnchor: [14, 34], popupAnchor: [0, -30],
  });
}

function inCampus(lat, lng) {
  return L.latLngBounds(CAMPUS.bounds).contains([lat, lng]);
}

function directionsUrl(lat, lng) { return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; }

// ── Report form: pick the exact spot ──
let reportMap = null, reportMarker = null, reportPin = null;

function toggleReportMap(force) {
  const wrap = document.getElementById('reportMapWrap');
  const show = force !== undefined ? force : wrap.classList.contains('hidden');
  wrap.classList.toggle('hidden', !show);
  document.getElementById('reportMapToggle').setAttribute('aria-expanded', show);
  if (!show) return;
  if (typeof L === 'undefined') { ensureLeaflet().then(() => toggleReportMap(true)).catch(() => {}); return; }
  if (!reportMap) {
    reportMap = makeCampusMap(document.getElementById('reportMap'));
    if (!reportMap) { document.getElementById('reportMap').innerHTML = '<p class="p-4 text-xs text-slate-500">Map could not load. Check your internet connection.</p>'; return; }
    reportMap.on('click', (e) => setReportPin(e.latlng.lat, e.latlng.lng, 'map'));
  }
  setTimeout(() => reportMap.invalidateSize(), 60);
}

function showOffCampus(msg) {
  const status = document.getElementById('reportPinStatus');
  status.innerHTML = `<i data-lucide="ban" class="w-3.5 h-3.5"></i> ${msg}`;
  status.className = 'text-[11px] font-semibold text-rose-700 flex items-center gap-1 flex-wrap p-2 rounded-lg bg-rose-50 border border-rose-200';
  if (window.lucide) lucide.createIcons();
}

// Pins are only allowed inside the IIITG campus outline
function setReportPin(lat, lng, source) {
  if (!inCampus(lat, lng)) {
    showOffCampus(source === 'gps'
      ? 'You are not on the IIITG campus, so your location can\'t be used. Tap the problem spot on the campus map instead.'
      : 'That spot is outside the IIITG campus. CampusCare only handles problems inside the campus (dashed line).');
    if (reportMarker && reportPin) reportMarker.setLatLng([reportPin.lat, reportPin.lng]);   // dragged out: snap back
    return false;
  }
  reportPin = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), source };
  if (reportMarker) reportMarker.setLatLng([lat, lng]);
  else {
    reportMarker = L.marker([lat, lng], { icon: pinIcon('#e11d48'), draggable: true }).addTo(reportMap);
    reportMarker.on('dragend', () => { const p = reportMarker.getLatLng(); setReportPin(p.lat, p.lng, 'map'); });
  }
  reportMap.panTo([lat, lng]);
  const status = document.getElementById('reportPinStatus');
  status.innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 text-rose-600"></i> Spot pinned${source === 'gps' ? ' from your location' : ''}. Drag the pin to adjust. <button type="button" onclick="clearReportPin()" class="underline ml-1">Remove</button>`;
  status.className = 'text-[11px] font-semibold text-emerald-700 flex items-center gap-1 flex-wrap';
  if (typeof saveReportDraft === 'function') saveReportDraft();
  if (typeof checkSimilarSoon === 'function') checkSimilarSoon();
  if (window.lucide) lucide.createIcons();
}

function clearReportPin() {
  reportPin = null;
  if (reportMarker && reportMap) { reportMap.removeLayer(reportMarker); reportMarker = null; }
  const status = document.getElementById('reportPinStatus');
  status.textContent = 'Tap the map where the problem is. The dashed line is the IIITG campus.';
  status.className = 'text-[11px] text-slate-500';
  if (typeof saveReportDraft === 'function') saveReportDraft();
}

function useMyLocation(btn) {
  if (!navigator.geolocation) return showToast('Location is not available on this device.', 'warning');
  toggleReportMap(true);
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Finding you...';
  navigator.geolocation.getCurrentPosition((pos) => {
    btn.disabled = false; btn.innerHTML = orig;
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    if (!inCampus(lat, lng)) {
      setReportPin(lat, lng, 'gps');   // shows the "not on campus" message, no pin
      showToast('You are not on the IIITG campus. Pin the problem on the campus map instead.', 'warning');
      return;
    }
    setReportPin(lat, lng, 'gps');
    reportMap.setView([lat, lng], 18);
    if (accuracy > 60) showToast(`Location is approximate (±${Math.round(accuracy)} m). Drag the pin if needed.`, 'info');
  }, (err) => {
    btn.disabled = false; btn.innerHTML = orig;
    showToast(err.code === 1 ? 'Location permission denied. Tap the map instead.' : 'Could not get your location. Tap the map instead.', 'warning');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

// ── Admin: all open tickets on the map ──
let adminMap = null, adminMapLayer = null, adminHeatLayer = null, adminMarkers = new Map(), adminMapFramed = false, heatOn = true, ticketsViewMode = 'list';

// Toggle the hot-spot heat overlay on the admin map
function toggleHeatmap() {
  heatOn = !heatOn;
  const btn = document.getElementById('heatToggleBtn');
  if (btn) btn.classList.toggle('active', heatOn);
  renderAdminMap();
}

function setTicketsView(mode) {
  ticketsViewMode = mode;
  document.querySelectorAll('.tickets-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  document.getElementById('triageListPanel').classList.toggle('hidden', mode !== 'list');
  document.getElementById('triageMapPanel').classList.toggle('hidden', mode !== 'map');
  if (mode === 'map') {
    renderAdminMap();
    setTimeout(() => adminMap && adminMap.invalidateSize(), 60);
  }
}

function renderAdminMap(tickets) {
  const panel = document.getElementById('triageMapPanel');
  if (!panel || panel.classList.contains('hidden')) return;
  if (typeof L === 'undefined') { ensureLeaflet().then(() => renderAdminMap(tickets)).catch(() => {}); return; }
  if (!adminMap) {
    adminMap = makeCampusMap(document.getElementById('adminTicketMap'), { zoom: 16 });
    if (!adminMap) return;
    adminMapLayer = L.layerGroup().addTo(adminMap);
    setTimeout(() => adminMap && adminMap.invalidateSize(), 60);
  }
  const list = (tickets || window.__triageVisible || []).filter(t => typeof t.lat === 'number' && typeof t.lng === 'number');
  const missing = (tickets || window.__triageVisible || []).length - list.length;
  const visibleIds = new Set();
  list.forEach(t => {
    visibleIds.add(t.id);
    const color = t.priority === 'High' ? '#e11d48' : (t.status === 'In Progress' ? '#2563eb' : (t.assignedTo ? '#7c3aed' : '#f59e0b'));
    const popup = `
      <div style="min-width:190px;font-family:inherit">
        <div style="font:700 11px monospace;color:#143865">${escapeHtml(t.id)}</div>
        <div style="font-weight:700;margin:2px 0">${escapeHtml(ticketCategoryLabel(t))}</div>
        <div style="font-size:11px;color:#64748b">${escapeHtml(t.location || '')}</div>
        <div style="font-size:11px;margin-top:4px">${escapeHtml(statusLabel(t))}${t.assignedToName ? ' · ' + escapeHtml(t.assignedToName) : ''}${t.priority === 'High' ? ' · <b style="color:#e11d48">Urgent</b>' : ''}</div>
        <button onclick="openTicketDetailModal('${escapeHtml(t.id)}')" style="margin-top:6px;padding:4px 10px;border-radius:8px;background:#262262;color:#fff;font-size:11px;font-weight:700">Open ticket</button>
      </div>`;
    let marker = adminMarkers.get(t.id);
    if (marker) {
      marker.setLatLng([t.lat, t.lng]);
      marker.setIcon(pinIcon(color));
      if (marker.getPopup()) marker.getPopup().setContent(popup);
      else marker.bindPopup(popup);
    } else {
      marker = L.marker([t.lat, t.lng], { icon: pinIcon(color) }).addTo(adminMapLayer).bindPopup(popup);
      adminMarkers.set(t.id, marker);
    }
  });
  for (const [id, marker] of adminMarkers) {
    if (!visibleIds.has(id)) { adminMapLayer.removeLayer(marker); adminMarkers.delete(id); }
  }
  // Focus the map on the actual ticket pins so the admin can see them (without
  // this the map stays on the default campus centre and far-off pins are missed).
  if (list.length && !adminMapFramed) {
    try {
      const bounds = L.latLngBounds(list.map(t => [t.lat, t.lng]));
      if (list.length === 1) adminMap.setView([list[0].lat, list[0].lng], 17);
      else adminMap.fitBounds(bounds.pad(0.35), { maxZoom: 18 });
      adminMapFramed = true;
    } catch (e) {}
  }
  // Heat overlay — brighter where problems cluster. Optional: only if the
  // Leaflet.heat plugin is loaded (it is, from the CDN, when online).
  if (heatOn && typeof L.heatLayer === 'function' && list.length) {
    const points = list.map(t => [t.lat, t.lng, t.priority === 'High' ? 1 : 0.6]);
    if (adminHeatLayer) adminHeatLayer.setLatLngs(points);
    else adminHeatLayer = L.heatLayer(points, { radius: 28, blur: 20, maxZoom: 18 }).addTo(adminMap);
  } else if (adminHeatLayer) {
    adminMap.removeLayer(adminHeatLayer);
    adminHeatLayer = null;
  }
  const outsideCount = 0;
  const note = document.getElementById('adminMapNote');
  if (note) note.textContent = `${list.length} ticket${list.length === 1 ? '' : 's'} on the map${outsideCount ? ` · ${outsideCount} outside campus` : ''}${missing ? ` · ${missing} without a map pin` : ''}`;
}
