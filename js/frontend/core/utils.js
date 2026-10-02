function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
function showModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.classList.add('animate-fade-in'); document.body.style.overflow = 'hidden'; if (window.lucide) lucide.createIcons(); }
}
function hideModal(id) { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; } }
function showEl(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function hideEl(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
// Emergency contacts directory (header siren button). These were referenced by
// inline onclick handlers but lost in the modular refactor — restored here.
function openEmergencyModal() { showModal('emergencyModal'); }
function closeEmergencyModal() { hideModal('emergencyModal'); }

// ── On-demand asset loader ──────────────────────────────────────────────
// Heavy libs (Leaflet for maps, Chart.js for admin analytics) load only when
// a view that needs them actually opens — not on every page load. Each URL is
// fetched at most once (idempotent).
const _ccAssets = {};
function loadExternal(kind, url) {
  if (_ccAssets[url]) return _ccAssets[url];
  _ccAssets[url] = new Promise((resolve, reject) => {
    let el;
    if (kind === 'css') { el = document.createElement('link'); el.rel = 'stylesheet'; el.href = url; }
    else { el = document.createElement('script'); el.src = url; el.async = false; }
    el.onload = () => resolve(true);
    el.onerror = () => { delete _ccAssets[url]; reject(new Error('Failed to load ' + url)); };
    document.head.appendChild(el);
  });
  return _ccAssets[url];
}
let _leafletPromise = null, _chartPromise = null;
function ensureLeaflet() {
  if (typeof L !== 'undefined' && L.map) return Promise.resolve();
  if (!_leafletPromise) {
    loadExternal('css', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
    _leafletPromise = loadExternal('js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js')
      .then(() => loadExternal('js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js').catch(() => {}));
  }
  return _leafletPromise;
}
function ensureChart() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
  if (!_chartPromise) _chartPromise = loadExternal('js', 'https://cdn.jsdelivr.net/npm/chart.js');
  return _chartPromise;
}

// Reconcile live HTML in place so Firestore snapshots don't flash entire
// ticket lists, reset focus, or restart entrance animations. Add
// data-live-key to repeated rows/cards to keep the same DOM node as items move.
function patchHtml(container, markup) {
  if (!container || container.innerHTML === markup) return;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const previousActive = document.activeElement;
  const focusedInside = previousActive && container.contains(previousActive);
  const activeValue = focusedInside && 'value' in previousActive ? previousActive.value : undefined;

  const sameLucideIcon = (a, b) => a && b && a.nodeType === Node.ELEMENT_NODE
    && a.tagName === 'svg' && b.tagName === 'I' && b.dataset.lucide
    && a.classList.contains(`lucide-${b.dataset.lucide}`);
  const sameKind = (a, b) => a && b && ((a.nodeType === Node.ELEMENT_NODE && b.nodeType === Node.ELEMENT_NODE && a.tagName === b.tagName)
    || sameLucideIcon(a, b)
    || (a.nodeType !== Node.ELEMENT_NODE && a.nodeType === b.nodeType));
  const keyOf = (node) => node.nodeType === Node.ELEMENT_NODE ? node.getAttribute('data-live-key') : null;
  const sync = (current, next) => {
    if (sameLucideIcon(current, next)) return;
    if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);

    const preserveValue = current === previousActive && focusedInside;
    const oldValue = 'value' in current ? current.value : undefined;
    const oldChecked = 'checked' in current ? current.checked : undefined;
    syncChildren(current, next);
    if ('value' in current) current.value = preserveValue ? activeValue : next.value;
    if ('checked' in current) current.checked = preserveValue ? oldChecked : next.checked;
    if ('value' in current && preserveValue && current.value !== oldValue) current.value = oldValue;
  };
  const syncChildren = (currentParent, nextParent) => {
    const oldNodes = [...currentParent.childNodes];
    const used = new Set();
    let cursor = currentParent.firstChild;
    for (const next of [...nextParent.childNodes]) {
      const key = keyOf(next);
      let current = null;
      if (key) current = oldNodes.find(n => !used.has(n) && keyOf(n) === key && sameKind(n, next)) || null;
      if (!current && !key) {
        if (cursor && !used.has(cursor) && !keyOf(cursor) && sameKind(cursor, next)) current = cursor;
        else current = oldNodes.find(n => !used.has(n) && !keyOf(n) && sameKind(n, next)) || null;
      }
      if (!current) current = next.cloneNode(true);
      else sync(current, next);
      used.add(current);
      if (current !== cursor) currentParent.insertBefore(current, cursor);
      cursor = current.nextSibling;
    }
    for (const old of oldNodes) if (!used.has(old) && old.parentNode === currentParent) old.remove();
  };

  syncChildren(container, template.content);
  if (focusedInside && previousActive.isConnected) {
    previousActive.focus({ preventScroll: true });
    if (activeValue !== undefined && previousActive.value !== activeValue) previousActive.value = activeValue;
  }
}

// Plain-language status names shown to people (database values stay the same)
function statusLabel(t) {
  const s = typeof t === 'string' ? t : (t && t.status);
  if (s === 'Pending') return (t && t.assignedTo) ? 'Assigned' : 'Waiting';
  if (s === 'In Progress') return 'Being fixed';
  if (s === 'Resolved') return 'Fixed';
  return s || 'Waiting';
}

// ─── PLACES TYPED BY REAL USERS ───
// No place names are built in. Names people have typed in earlier tickets
// are suggested, so everyone ends up spelling the same place the same way.
const normalizePlace = (s) => String(s || '').toLowerCase().replace(/hostel|block|room|no\.?|number/g, ' ').replace(/[^a-z0-9]+/g, '');

function knownPlaces(typeKey) {
  const counts = new Map();
  (typeof cachedTickets !== 'undefined' ? cachedTickets : []).forEach(t => {
    if (t.confidential || (typeKey && t.placeType !== typeKey)) return;
    const name = String(t.location || '').split(' — ')[0].trim();
    if (!name || name.length > 60) return;
    const key = normalizePlace(name);
    const cur = counts.get(key);
    counts.set(key, { name: cur ? cur.name : name, n: (cur ? cur.n : 0) + 1 });
  });
  return [...counts.values()].sort((a, b) => b.n - a.n).map(x => x.name).slice(0, 30);
}

function fillDatalist(id, names) {
  const dl = document.getElementById(id);
  if (dl) dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

// A lost-&-found report (public board visible to everyone)
function isLostFound(t) { return /lost\s*&?\s*found/i.test((t && t.subCategory) || ''); }

// "Faculty · CSE", "Student · B.Tech CSE", "Non-teaching staff · Library"
function reporterLabel(t) {
  const types = { student: 'Student', faculty: 'Faculty', staff: 'Non-teaching staff' };
  const type = types[t && t.reporterType] || 'Campus user';
  return t && t.reporterDept ? `${type} · ${t.reporterDept}` : type;
}

function getStatusConfig(status) {
  return {
    'Pending': 'bg-slate-50 text-slate-700 border-slate-200',
    'In Progress': 'bg-blue-50 text-blue-700 border-blue-200 status-in-progress',
    'Resolved': 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }[status] || 'bg-slate-50 text-slate-700 border-slate-200';
}

function showToast(message, type = 'info') {
  document.querySelectorAll('.toast-notification').forEach(t => t.remove());
  const colors = { success: 'bg-emerald-600', error: 'bg-rose-600', warning: 'bg-amber-600', info: 'bg-iiitg-800' };
  const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };

  const toast = document.createElement('div');
  toast.className = `toast-notification fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl ${colors[type]} text-white text-sm font-semibold shadow-2xl animate-slide-down`;
  // Escape the message — it can carry ticket/chat content via live notifications,
  // so unescaped HTML here would be a stored-XSS path into staff/Admin sessions.
  toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-5 h-5 shrink-0"></i><span>${escapeHtml(String(message))}</span>`;
  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s ease'; setTimeout(() => toast.remove(), 400); }, 3500);
}
function handleFileUpload(input, labelId) {
  const label = document.getElementById(labelId);
  if (!label) return;
  if (input.files && input.files.length > 0) {
    label.textContent = input.files[0].name;
    label.classList.add('font-bold', 'text-emerald-600');
    label.classList.remove('text-slate-500');
  } else {
    const DEFAULTS = {
      complaintPhotoName: 'Add a photo',
      newStaffPhotoName: 'Add a profile photo',
      updateProfilePhotoName: 'Choose a new photo',
      resolvePhotoName: 'Attach post-repair photo',
    };
    label.textContent = DEFAULTS[labelId] || 'Attach a photo';
    label.classList.remove('font-bold', 'text-emerald-600');
    label.classList.add('text-slate-500');
  }
}



function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (input && icon) {
    if (input.type === 'password') {
      input.type = 'text';
      icon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      icon.setAttribute('data-lucide', 'eye');
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

// Show a person's photo (e.g. their Google account picture) as a round avatar,
// falling back to their initials. referrerpolicy lets Google photos load.
function setAvatar(el, photoURL, name) {
  if (!el) return;
  const initials = String(name || '').split(/[.\s]+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || String(name || '?').substring(0, 2).toUpperCase();
  if (photoURL) {
    el.style.overflow = 'hidden';
    el.innerHTML = `<img src="${escapeHtml(photoURL)}" alt="" referrerpolicy="no-referrer" class="w-full h-full object-cover rounded-full" onerror="this.parentNode.textContent='${initials}'">`;
  } else {
    el.textContent = initials;
  }
}

// ─── SAFETY & DISPLAY HELPERS ───
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Category names come from js/catalog.js
const CATEGORY_LABELS = new Proxy({}, { get: (_, k) => (typeof CATALOG !== 'undefined' && CATALOG[k]) ? CATALOG[k].label : undefined });
function ticketCategoryLabel(t) {
  if (!t) return '';
  if (t.categoryDisplay) return t.categoryDisplay;
  return CATEGORY_LABELS[t.category] || t.category || 'General';
}

// Data-URL images can't be opened with a plain link in Chrome, so open them via a Blob
function openAttachment(url) {
  if (!url) return;
  // Only open safe schemes. Attachment URLs can come from other users' chat
  // messages, so block javascript:/vbscript:/etc. to prevent script injection.
  if (!/^(https?:|data:(image|video)\/)/i.test(url)) return;
  if (!url.startsWith('data:')) { window.open(url, '_blank', 'noopener'); return; }
  fetch(url).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank')).catch(() => {});
}

function attachmentHtml(url, name, light) {
  const safeUrl = escapeHtml(url);
  const isImage = url.startsWith('data:image') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);
  const isVideo = url.startsWith('data:video') || /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
  if (isVideo) {
    return `<video src="${safeUrl}" controls preload="metadata" class="max-w-[260px] max-h-[220px] rounded-lg border border-slate-200 mt-1"></video>`;
  }
  if (isImage) {
    return `<img src="${safeUrl}" alt="${escapeHtml(name || 'attachment')}" class="max-w-[220px] max-h-[220px] rounded-lg border border-slate-200 cursor-pointer mt-1" data-attachment>`;
  }
  return `<a href="#" data-url="${safeUrl}" data-attachment class="${light ? 'text-white' : 'text-blue-600'} underline break-all inline-flex items-center gap-1"><i data-lucide="file" class="w-3 h-3"></i> ${escapeHtml(name || 'Attached file')}</a>`;
}

// One delegated click handler for every attachment rendered anywhere
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-attachment]');
  if (!el) return;
  e.preventDefault();
  openAttachment(el.getAttribute('data-url') || el.getAttribute('src'));
});
