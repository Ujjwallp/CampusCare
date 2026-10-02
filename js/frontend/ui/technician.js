const CATEGORY_DEPT = new Proxy({}, { get: (_, k) => teamForCategory(k) });

// Does this ticket belong to the given technician? Match on the internal id,
// and ALSO on the login email — so an assigned ticket still reaches them even if
// the technician record was recreated (new id) but the email is the same. This
// is what fixes "admin assigned it but the technician never saw it".
function ticketIsForTech(t, tech) {
  if (!tech) return false;
  if (t.assignedTo && t.assignedTo === tech.firebaseId) return true;
  const te = (tech.email || '').toLowerCase();
  if (te && t.assignedToEmail && String(t.assignedToEmail).toLowerCase() === te) return true;
  return false;
}

// Tickets for the signed-in technician: ONLY the ones assigned to them (by the
// auto-assigner or the admin). No free pick-up pool — assignment is automatic
// by default and the admin can change the technician when needed.
function getStaffTickets() {
  const tech = getCurrentTech();
  if (!tech) return [];
  return cachedTickets.filter(t => ticketIsForTech(t, tech));
}

function updateStaffStats() {
  const mine = getStaffTickets();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('staffStatPending', mine.filter(t => t.status === 'Pending').length);
  set('staffStatActive', mine.filter(t => t.status === 'In Progress').length);
  set('staffStatResolved', mine.filter(t => t.status === 'Resolved').length);
  renderStaffCompletedStats();
  if (typeof updateNavCounts === 'function') updateNavCounts();
}

// How many tickets this technician has FIXED, broken down by time window.
function renderStaffCompletedStats() {
  const panel = document.getElementById('staffCompletedPanel');
  const box = document.getElementById('staffCompletedStats');
  if (!panel || !box) return;
  const tech = getCurrentTech();
  if (!tech) { panel.classList.add('hidden'); return; }

  // Tickets I personally resolved (fall back to assignee / email for older records).
  const doneByMe = cachedTickets.filter(t => t.status === 'Resolved' && (t.resolvedBy === tech.firebaseId || ticketIsForTech(t, tech)));
  const resolvedMs = (typeof ticketResolvedMs === 'function')
    ? ticketResolvedMs
    : (t) => (t.resolvedAtMs || (t.resolvedAt && t.resolvedAt.seconds ? t.resolvedAt.seconds * 1000 : null));
  const now = new Date();
  const periods = [
    ['Today',      (typeof startOfDay   === 'function' ? startOfDay(now)   : now).getTime()],
    ['This week',  (typeof startOfWeek  === 'function' ? startOfWeek(now)  : now).getTime()],
    ['This month', (typeof startOfMonth === 'function' ? startOfMonth(now) : now).getTime()],
    ['This year',  (typeof startOfYear  === 'function' ? startOfYear(now)  : now).getTime()],
  ];
  panel.classList.remove('hidden');
  box.innerHTML = periods.map(([label, from]) => {
    const n = doneByMe.filter(t => (resolvedMs(t) || 0) >= from).length;
    return `<div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
      <div class="text-2xl font-extrabold text-emerald-700 leading-none">${n}</div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1.5">${label}</div>
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

const STAFF_TAB_SUB = {
  'Pending': 'New tickets for you. Press Start Work when you begin.',
  'In Progress': "Tickets you're working on. Mark them fixed when done.",
  'Resolved': "Tickets you've fixed.",
};

function switchStaffTab(tab) {
  staffCurrentTab = tab;
  setActiveNav(tab);
  const sub = document.getElementById('staffPageSub');
  if (sub) sub.textContent = STAFF_TAB_SUB[tab] || '';
  renderStaffTickets();
  updateStaffStats();
}

function renderStaffTickets() {
  const container = document.getElementById('staffTicketsContainer');
  if (!container) return;
  const filtered = getStaffTickets().filter(t => t.status === staffCurrentTab);

  if (filtered.length === 0) {
    patchHtml(container, `<div data-live-key="staff-empty-${staffCurrentTab}" class="col-span-full text-center py-14 bg-white rounded-2xl border border-slate-200 border-dashed"><div class="w-14 h-14 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center mb-3"><i data-lucide="coffee" class="w-7 h-7 text-slate-300"></i></div><p class="text-sm text-slate-600 font-bold">Nothing here right now</p><p class="text-xs text-slate-400 mt-1">New tickets appear automatically.</p></div>`);
    if (window.lucide) lucide.createIcons();
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach(t => {
    let actions = '';
    if (t.status === 'Pending') {
      actions = `<button onclick="acknowledgeTicket('${t.id}', this)" class="flex-1 py-2.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors">Start Work</button>`;
    } else if (t.status === 'In Progress') {
      actions = `<button onclick="openResolveModal('${t.id}')" class="flex-1 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors"><i data-lucide="check-circle" class="w-3.5 h-3.5 inline mr-1"></i> Mark as fixed</button>`;
    }
    const isHigh = t.priority === 'High';

    const card = document.createElement('div');
    card.dataset.liveKey = `ticket-${t.id}`;
    card.className = "panel p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow";
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3">
          <button onclick="openTicketDetailModal('${t.id}')" class="font-mono text-xs font-bold text-iiitg-700 bg-iiitg-50 px-2 py-0.5 rounded-lg border border-iiitg-100 hover:bg-iiitg-100 transition-colors" title="Open full details">${escapeHtml(t.id)}</button>
          <span class="text-[10px] font-bold text-slate-400">${escapeHtml(t.date)}</span>
        </div>
        ${t.reopenCount ? '<span class="inline-block mb-2 mr-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-orange-50 text-orange-700 border border-orange-200 uppercase">Reopened by student</span>' : ''}
        ${t.status === 'Pending' ? (t.assignedTo ? '<span class="inline-block mb-2 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-violet-50 text-violet-700 border border-violet-200 uppercase">Given to you</span>' : '<span class="inline-block mb-2 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">Free to pick up</span>') : ''}
        <h4 class="text-sm font-bold text-slate-900 mb-1 leading-snug"><button onclick="openTicketDetailModal('${t.id}')" class="text-left hover:text-iiitg-700 hover:underline transition-colors">${escapeHtml(ticketCategoryLabel(t))}</button> ${isHigh ? '<span class="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-100 text-rose-700 border border-rose-200 uppercase">Urgent</span>' : ''}</h4>
        <p class="text-xs text-slate-600 line-clamp-2 mb-1">${escapeHtml(t.description)}</p>
        <p class="text-[10px] text-slate-400 mb-2">${escapeHtml(reporterLabel(t))}${(t.upvotes || 0) > 1 ? ` · <strong class="text-blue-600">${t.upvotes} people affected</strong>` : ''}</p>
        <p class="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mb-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHtml(t.location)}</p>
        ${t.outsideCampus ? '<span class="inline-block mb-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase">Outside campus · use directions</span>' : ''}
        ${typeof t.lat === 'number' ? `<a href="${directionsUrl(t.lat, t.lng)}" target="_blank" rel="noopener" class="text-[10px] font-semibold text-blue-600 flex items-center gap-1 mb-1 hover:underline"><i data-lucide="navigation" class="w-3 h-3"></i> Directions to exact spot</a>` : ''}
        ${t.phone && t.phone !== 'Not provided' ? `<a href="tel:${escapeHtml(t.phone)}" class="text-[10px] font-semibold text-emerald-600 flex items-center gap-1 mb-4 hover:underline"><i data-lucide="phone" class="w-3 h-3"></i> ${escapeHtml(t.phone)}</a>` : '<div class="mb-4"></div>'}
      </div>
      <div class="flex items-center gap-2 mt-auto">
        <button onclick="openTicketDetailModal('${t.id}')" class="px-3 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 flex items-center gap-1.5" title="Open full details & chat" aria-label="Details and chat"><i data-lucide="message-square" class="w-3.5 h-3.5"></i><span>Details</span></button>
        ${actions}
      </div>
    `;
    frag.appendChild(card);
  });
  patchHtml(container, [...frag.children].map(card => card.outerHTML).join(''));
  if (window.lucide) lucide.createIcons();
}

async function acknowledgeTicket(id, btn) {
  const tech = getCurrentTech();
  if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
  try {
    await API.acknowledgeTicket(id, tech ? tech.firebaseId : null, tech ? tech.name : null);
    showToast(`Started work on ${id}.`, 'success');
    switchStaffTab('In Progress');
  } catch (err) {
    console.error(err);
    showToast('Failed to acknowledge ticket: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Start Work'; }
  }
}

let extraMaterials = [];
function openResolveModal(id) {
  activeTicketId = id;
  document.getElementById('resolveTicketId').textContent = id;
  const t = cachedTickets.find(x => x.id === id);
  extraMaterials = [];
  document.getElementById('resolveNoMaterials').checked = false;
  renderMaterialPicker(t ? t.category : null);
  showModal('resolveModal');
}

function renderMaterialPicker(cat) {
  const box = document.getElementById('resolveMaterials');
  const list = materialsForCategory(cat);
  box.innerHTML = (list.map(([name, unit]) => `<label class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" class="mat-check accent-emerald-600 w-4 h-4" data-name="${escapeHtml(name)}" data-unit="${escapeHtml(unit)}" onchange="this.closest('label').querySelector('.mat-qty').disabled = !this.checked; if (this.checked) document.getElementById('resolveNoMaterials').checked = false;">
      <span class="flex-1 text-xs font-semibold text-slate-700">${escapeHtml(name)}</span>
      <input type="number" min="0.5" step="0.5" value="1" disabled class="mat-qty w-16 px-2 py-1 border border-slate-300 rounded-md text-xs disabled:bg-slate-50 disabled:text-slate-300" aria-label="Quantity of ${escapeHtml(name)}">
      <span class="w-8 text-[10px] text-slate-400 font-semibold">${escapeHtml(unit)}</span>
    </label>`).join('') || '<p class="text-xs text-slate-400 py-1">No standard parts for this type of job. Add anything you used below.</p>')
    + '<div id="resolveExtraList" class="space-y-1.5"></div>';
  renderExtraMaterials();
}

// "Other" items live in their own list so ticked parts above are never reset
function renderExtraMaterials() {
  const box = document.getElementById('resolveExtraList');
  if (!box) return;
  box.innerHTML = extraMaterials.map((m, i) => `<div class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs"><span class="flex-1 font-semibold text-emerald-800">${escapeHtml(m.item)}</span><span class="text-emerald-700">${m.qty}</span><button type="button" onclick="extraMaterials.splice(${i},1); renderExtraMaterials()" class="text-rose-500 font-bold px-1" aria-label="Remove ${escapeHtml(m.item)}">✕</button></div>`).join('');
}

function addOtherMaterial() {
  const item = document.getElementById('resolveOtherItem').value.trim();
  const qty = Number(document.getElementById('resolveOtherQty').value) || 1;
  if (!item) return;
  extraMaterials.push({ item, qty, unit: '' });
  document.getElementById('resolveOtherItem').value = '';
  document.getElementById('resolveOtherQty').value = 1;
  document.getElementById('resolveNoMaterials').checked = false;
  renderExtraMaterials();
}

function toggleNoMaterials() {
  if (!document.getElementById('resolveNoMaterials').checked) return;
  document.querySelectorAll('#resolveMaterials .mat-check').forEach(c => { c.checked = false; c.closest('label').querySelector('.mat-qty').disabled = true; });
  extraMaterials = [];
  renderExtraMaterials();
}

function collectMaterials() {
  const picked = [...document.querySelectorAll('#resolveMaterials .mat-check:checked')].map(c => ({
    item: c.dataset.name, unit: c.dataset.unit, qty: Number(c.closest('label').querySelector('.mat-qty').value) || 1 }));
  return [...picked, ...extraMaterials];
}
function closeResolveModal() { hideModal('resolveModal'); activeTicketId = null; }

async function handleResolveSubmit(e) {
  e.preventDefault();
  if (!activeTicketId) return;
  const ticketId = activeTicketId;
  const form = e.target;

  const remarks = document.getElementById('resolveRemarks').value.trim();
  const btn = form.querySelector('button[type="submit"]');
  const originalText = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Resolving...`;
  btn.disabled = true;

  try {
    let photoUrl = null;
    const input = document.getElementById("resolvePhotoInput");
    if (input && input.files && input.files.length > 0) {
      try { photoUrl = await API.uploadFile(input.files[0], 'resolution_proofs'); }
      catch (upErr) { showToast('Photo not attached: ' + upErr.message, 'warning'); }
    }
    const materials = collectMaterials();
    if (!materials.length && !document.getElementById('resolveNoMaterials').checked) {
      showToast('Tick the materials you used, or tick "Nothing used".', 'warning');
      return;
    }
    await API.resolveTicket(ticketId, remarks, photoUrl, materials);

    // Firestore's local snapshot normally arrives immediately. Update the
    // technician's visible queue as well, so "Work you've completed" changes
    // at once if a sleeping browser delays that callback for a moment.
    const completedAt = Date.now();
    const ticket = cachedTickets.find(t => t.id === ticketId);
    if (ticket) {
      Object.assign(ticket, {
        status: 'Resolved', resolvedAtMs: completedAt,
        resolvedBy: ticket.assignedTo || null, resolvedByName: ticket.assignedToName || null,
        resolutionRemarks: remarks, materialsUsed: materials,
      });
      if (typeof refreshAllViews === 'function') refreshAllViews();
    }

    showToast(`${ticketId} marked as fixed!`, 'success');
    closeResolveModal();
    form.reset();
    if (input) { input.value = ""; handleFileUpload(input, "resolvePhotoName"); }
    switchStaffTab('Resolved');
  } catch (err) {
    console.error(err);
    showToast('Failed to resolve ticket: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}
