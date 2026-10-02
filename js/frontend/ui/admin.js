let chartTrend = null;
let chartCat = null;

// "Late" threshold comes from the admin Settings (Manage → Settings)
const OVERDUE_HOURS_DEFAULT = 48;
Object.defineProperty(window, 'OVERDUE_HOURS', { get: () => (typeof appSettings !== 'undefined' && appSettings.lateHours) || OVERDUE_HOURS_DEFAULT });

const ADMIN_PAGES = {
  Analytics: ['Dashboard', 'How many problems were reported and fixed.'],
  Triage: ['Tickets', 'Every open problem. Give each one to a technician.'],
  Workload: ['Technicians', 'Who is working, how much they have fixed, and how long it takes.'],
  Reports: ['Reports', 'Monthly summary, repeat problems, materials used. Download as Excel or PDF.'],
  Users: ['Manage', 'Staff accounts, campus notices and rules.'],
};

let triageFilter = 'all';

function switchAdminTab(tab, filter) {
  if (!ADMIN_PAGES[tab]) tab = 'Analytics';
  if (tab === 'Triage') triageFilter = filter || (adminCurrentTab === 'Triage' ? triageFilter : 'all');
  adminCurrentTab = tab;
  setActiveNav(tab);
  document.getElementById('adminPageTitle').textContent = ADMIN_PAGES[tab][0];
  document.getElementById('adminPageSub').textContent = ADMIN_PAGES[tab][1];
  const views = { Analytics: 'adminViewAnalytics', Triage: 'adminViewTriage', Workload: 'adminViewWorkload', Reports: 'adminViewReports', Users: 'adminViewUsers' };
  Object.values(views).forEach(id => hideEl(id));
  showEl(views[tab]);
  document.getElementById('adminKpis').classList.toggle('hidden', tab === 'Workload' || tab === 'Reports');

  renderAdminStats();
  if (tab === 'Analytics') initAdminCharts();
  if (tab === 'Triage') renderAdminTriage();
  if (tab === 'Workload') renderAdminWorkload();
  if (tab === 'Users') renderAdminUsers();
  if (tab === 'Reports') renderReports();
  if (window.lucide) lucide.createIcons();
}

function ticketCreatedMs(t) {
  if (t.createdAt && typeof t.createdAt.seconds === 'number') return t.createdAt.seconds * 1000;
  return null;
}

function isUnassigned(t) { return (t.status === 'Pending' || t.status === 'In Progress') && !t.assignedTo; }

function isOverdue(t) {
  if (t.status === 'Resolved') return false;
  const ms = ticketCreatedMs(t);
  return ms !== null && (Date.now() - ms) > OVERDUE_HOURS * 3600 * 1000;
}

function renderAdminStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('adminStatUnassigned', cachedTickets.filter(isUnassigned).length);
  set('adminStatOverdue', cachedTickets.filter(isOverdue).length);
  set('adminStatOnDuty', cachedTechnicians.filter(t => t.status === 'On Duty').length);
}

// ─── WORK REPORT (day / week / month / year) ───
let reportPeriod = 'week';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) { const x = startOfDay(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; } // Monday
function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }
function startOfYear(d) { const x = startOfMonth(d); x.setMonth(0); return x; }

// When a ticket was completed. Older tickets (resolved before this was tracked)
// fall back to their filing time.
function ticketResolvedMs(t) {
  if (t.status !== 'Resolved') return null;
  if (typeof t.resolvedAtMs === 'number') return t.resolvedAtMs;
  if (t.resolvedAt && typeof t.resolvedAt.seconds === 'number') return t.resolvedAt.seconds * 1000;
  if (t.resolvedAt && typeof t.resolvedAt === 'number') return t.resolvedAt;
  return ticketCreatedMs(t);
}

const PERIODS = {
  day:   { label: 'Today',      start: startOfDay,   chartTitle: 'Last 14 days',  buckets: 14, step: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; }, fmt: d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
  week:  { label: 'This week',  start: startOfWeek,  chartTitle: 'Last 8 weeks',  buckets: 8,  step: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + 7 * n); return x; }, fmt: d => 'Wk ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
  month: { label: 'This month', start: startOfMonth, chartTitle: 'Last 12 months', buckets: 12, step: (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }, fmt: d => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) },
  year:  { label: 'This year',  start: startOfYear,  chartTitle: 'Last 5 years',  buckets: 5,  step: (d, n) => { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }, fmt: d => String(d.getFullYear()) },
};

function setReportPeriod(p) {
  reportPeriod = p;
  initAdminCharts();
}

function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return '–';
  const h = ms / 3600000;
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + 'm';
  if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + 'h';
  return (h / 24).toFixed(1) + 'd';
}

function initAdminCharts() {
  renderAdminStats();
  const P = PERIODS[reportPeriod];
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === reportPeriod));

  // Current period figures
  const now = new Date();
  const from = P.start(now).getTime();
  const filed = cachedTickets.filter(t => (ticketCreatedMs(t) ?? Date.now()) >= from);
  const completed = cachedTickets.filter(t => { const r = ticketResolvedMs(t); return r !== null && r >= from; });
  const fixTimes = completed.map(t => { const c = ticketCreatedMs(t), r = ticketResolvedMs(t); return c && r && r >= c ? r - c : null; }).filter(x => x !== null);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('repFiled', filed.length);
  set('repCompleted', completed.length);
  set('repRate', filed.length ? Math.round(100 * filed.filter(t => t.status === 'Resolved').length / filed.length) + '%' : '–');
  set('repAvg', fixTimes.length ? formatDuration(fixTimes.reduce((a, b) => a + b, 0) / fixTimes.length) : '–');
  const rangeTxt = reportPeriod === 'day'
    ? now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${new Date(from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – today`;
  set('repRangeLabel', `${P.label}: ${rangeTxt}`);
  set('repChartTitle', `Reported vs fixed: ${P.chartTitle.toLowerCase()}`);
  set('repTechSub', `${P.label}`);
  set('repCatSub', `${P.label}`);

  // Technician leaderboard
  const byTech = {};
  completed.forEach(t => {
    const key = t.assignedTo || '_none';
    byTech[key] = byTech[key] || { name: t.assignedToName || (t.assignedTo ? 'Former technician' : 'Unassigned'), n: 0 };
    byTech[key].n++;
  });
  const rows = Object.entries(byTech).sort((a, b) => b[1].n - a[1].n);
  const max = rows.length ? rows[0][1].n : 0;
  const techList = document.getElementById('repTechList');
  if (techList) {
    patchHtml(techList, rows.length ? rows.map(([id, r]) => {
      const tech = cachedTechnicians.find(x => x.firebaseId === id);
      const open = cachedTickets.filter(t => t.assignedTo === id && t.status === 'In Progress').length;
      return `<div data-live-key="report-tech-${escapeHtml(id)}">
        <div class="flex items-center justify-between text-sm mb-1"><span class="font-bold text-slate-800 truncate">${escapeHtml(tech ? tech.name : r.name)}</span><span class="text-xs text-slate-500 shrink-0 ml-2"><strong class="text-emerald-700 text-sm">${r.n}</strong> fixed · ${open} open</span></div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-emerald-500" style="width:${max ? Math.max(4, 100 * r.n / max) : 0}%"></div></div>
      </div>`;
    }).join('') : `<p data-live-key="report-tech-empty" class="text-sm text-slate-400 py-6 text-center">Nothing fixed ${P.label.toLowerCase()}.</p>`);
  }

  // Hot-spots: which places generate the most reports (confidential excluded)
  const places = {};
  filed.forEach(t => {
    if (t.confidential) return;
    const place = (String(t.location || '').split(' — ')[0].trim()) || 'Unspecified';
    places[place] = places[place] || { n: 0, cats: {} };
    places[place].n++;
    const c = ticketCategoryLabel(t);
    places[place].cats[c] = (places[place].cats[c] || 0) + 1;
  });
  const hot = Object.entries(places).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const hotMax = hot.length ? hot[0][1].n : 0;
  const hotBox = document.getElementById('repHotspots');
  if (hotBox) {
    patchHtml(hotBox, hot.length ? hot.map(([place, r]) => {
      const topCat = Object.entries(r.cats).sort((a, b) => b[1] - a[1])[0];
      return `<div data-live-key="hotspot-${escapeHtml(place)}">
        <div class="flex items-center justify-between text-sm mb-1"><span class="font-bold text-slate-800 truncate">${escapeHtml(place)}</span><span class="text-xs text-slate-500 shrink-0 ml-2"><strong class="text-rose-700 text-sm">${r.n}</strong> report${r.n > 1 ? 's' : ''}${topCat ? ' · mostly ' + escapeHtml(topCat[0]) : ''}</span></div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-rose-500" style="width:${hotMax ? Math.max(4, 100 * r.n / hotMax) : 0}%"></div></div>
      </div>`;
    }).join('') : `<p data-live-key="hotspot-empty" class="text-sm text-slate-400 py-6 text-center">No reports ${P.label.toLowerCase()}.</p>`);
  }
  const hotSub = document.getElementById('repHotspotsSub');
  if (hotSub && hot.length) hotSub.textContent = `${P.label}. Top place: ${hot[0][0]} (${hot[0][1].n}). Confidential reports are not shown.`;

  if (typeof Chart === 'undefined') { ensureChart().then(() => initAdminCharts()).catch(() => {}); return; }
  const ctxTrend = document.getElementById('trendChart');
  const ctxCat = document.getElementById('categoryChart');
  if (!ctxTrend || !ctxCat || ctxTrend.offsetParent === null) return; // not visible yet

  // History buckets
  const first = P.step(P.start(now), -(P.buckets - 1));
  const labels = [], filedData = [], doneData = [];
  for (let i = 0; i < P.buckets; i++) {
    const s = P.step(first, i).getTime(), e = P.step(first, i + 1).getTime();
    labels.push(P.fmt(new Date(s)));
    filedData.push(cachedTickets.filter(t => { const c = ticketCreatedMs(t) ?? Date.now(); return c >= s && c < e; }).length);
    doneData.push(cachedTickets.filter(t => { const r = ticketResolvedMs(t); return r !== null && r >= s && r < e; }).length);
  }

  if (chartTrend) {
    chartTrend.data.labels = labels;
    chartTrend.data.datasets[0].data = filedData;
    chartTrend.data.datasets[1].data = doneData;
    chartTrend.update('none');
  } else chartTrend = new Chart(ctxTrend, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Reported', data: filedData, backgroundColor: '#94a3b8', borderRadius: 5, maxBarThickness: 28 },
      { label: 'Fixed', data: doneData, backgroundColor: '#10b981', borderRadius: 5, maxBarThickness: 28 },
    ] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 11, weight: 'bold' } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } } } }
  });

  const allKeys = Object.keys(CATALOG);
  const counts = allKeys.map(k => [k, filed.filter(t => (t.category === k) || (k === 'Other' && !allKeys.includes(t.category))).length]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const catKeys = counts.length ? counts.map(c => c[0]) : ['Other'];
  const catData = counts.length ? counts.map(c => c[1]) : [0];
  if (chartCat) {
    chartCat.data.labels = catKeys.map(k => CATEGORY_LABELS[k] || k);
    chartCat.data.datasets[0].data = catData;
    chartCat.update('none');
  } else chartCat = new Chart(ctxCat, {
    type: 'doughnut',
    data: { labels: catKeys.map(k => CATEGORY_LABELS[k] || k), datasets: [{ data: catData, backgroundColor: ['#2563eb', '#f59e0b', '#0891b2', '#4f46e5', '#db2777', '#10b981', '#f97316', '#8b5cf6', '#14b8a6', '#e11d48', '#84cc16', '#64748b', '#0ea5e9', '#a855f7', '#eab308', '#94a3b8'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
  });
}

function renderAdminTriage() {
  const body = document.getElementById('adminTriageTableBody');
  if (!body) return;

  const open = cachedTickets.filter(t => t.status === 'Pending' || t.status === 'In Progress');
  const FILTERS = {
    all:        { label: 'All open',    test: () => true,                     empty: ['All clear', 'There are no open tickets.'] },
    unassigned: { label: 'Not assigned', test: t => !t.assignedTo,            empty: ['Every ticket has a technician', 'Nothing is waiting to be assigned.'] },
    overdue:    { label: `Late (${OVERDUE_HOURS >= 24 ? Math.round(OVERDUE_HOURS / 24) + '+ day' + (OVERDUE_HOURS >= 48 ? 's' : '') : OVERDUE_HOURS + '+ h'})`, test: isOverdue,                   empty: ['Nothing is late', `No ticket has been open longer than the late limit.`] },
    high:       { label: 'Urgent',      test: t => t.priority === 'High',     empty: ['Nothing urgent', 'No ticket is marked urgent.'] },
    awaiting:   { label: 'Not started', test: t => t.assignedTo && t.status === 'Pending', empty: ['Nothing waiting to start', 'Every technician has started their tickets.'] },
    progress:   { label: 'Being fixed', test: t => t.status === 'In Progress', empty: ['Nothing being fixed', 'No technician is working on a ticket right now.'] },
  };
  if (!FILTERS[triageFilter]) triageFilter = 'all';
  const bar = document.getElementById('triageFilterBar');
  if (bar) patchHtml(bar, Object.entries(FILTERS).map(([k, f]) =>
    `<button class="chip ${triageFilter === k ? 'active' : ''}" onclick="setTriageFilter('${k}')">${f.label}<span class="chip-n">${open.filter(f.test).length}</span></button>`).join(''));

  const waitingAuto = open.filter(t => !t.assignedTo && DEPT_FOR_CATEGORY[t.category]).length;
  const allBtn = document.getElementById('autoAssignAllBtn');
  if (allBtn) { allBtn.classList.toggle('hidden', !waitingAuto); allBtn.classList.toggle('inline-flex', !!waitingAuto); }

  window.__triageVisible = open.filter(FILTERS[triageFilter].test);
  if (typeof renderAdminMap === 'function') renderAdminMap(window.__triageVisible);
  const activeTickets = open.filter(FILTERS[triageFilter].test)
    .sort((a, b) => (isOverdue(b) - isOverdue(a)) || ((b.priority === 'High') - (a.priority === 'High')) || ((ticketCreatedMs(a) || 0) - (ticketCreatedMs(b) || 0)));
  if (activeTickets.length === 0) {
    const [title, sub] = FILTERS[triageFilter].empty;
    patchHtml(body, `<div data-live-key="triage-empty-${triageFilter}" class="px-6 py-14 text-center"><div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-3"><i data-lucide="check-circle-2" class="w-7 h-7 text-emerald-500"></i></div><p class="text-sm font-bold text-slate-700">${title}</p><p class="text-xs text-slate-400 mt-1">${sub}</p>${triageFilter !== 'all' && open.length ? `<button onclick="setTriageFilter('all')" class="mt-4 px-4 py-2 text-xs font-bold text-iiitg-700 bg-iiitg-50 border border-iiitg-100 rounded-lg">Show all ${open.length} open tickets</button>` : ''}</div>`);
    if (window.lucide) lucide.createIcons();
    return;
  }

  const onDutyTechs = cachedTechnicians.filter(tech => tech.status === 'On Duty');
  const depts = [...new Set(onDutyTechs.map(t => t.dept))];
  const liveLoad = (id) => cachedTickets.filter(x => x.assignedTo === id && x.status !== 'Resolved').length;
  const techOptions = (selectedId) => depts.map(dept =>
    `<optgroup label="${escapeHtml(dept)}">` +
    onDutyTechs.filter(t => t.dept === dept).map(tech =>
      `<option value="${tech.firebaseId}" ${tech.firebaseId === selectedId ? 'disabled' : ''}>${escapeHtml(tech.name)} (${liveLoad(tech.firebaseId)} active)</option>`).join('') +
    `</optgroup>`).join('');

  patchHtml(body, activeTickets.map(t => {
    const isHigh = t.priority === 'High';
    const overdue = isOverdue(t);
    return `<div data-live-key="ticket-${escapeHtml(t.id)}" class="p-4 md:px-5 md:py-4 grid grid-cols-1 md:grid-cols-[140px_1fr_170px_230px] gap-3 md:gap-4 md:items-center hover:bg-slate-50/60 transition-colors">
      <div class="flex md:block items-center gap-2">
        <span class="font-mono text-xs font-bold text-iiitg-700">${escapeHtml(t.id)}</span>
        <span class="md:block md:mt-1 text-[10px] font-bold ${overdue ? 'text-rose-600' : 'text-slate-400'}">${overdue ? 'LATE · ' : ''}open ${ageText(t).replace(' old', '')}</span>
        <span class="md:hidden ml-auto text-[11px] text-slate-400">${escapeHtml(t.date || '')}</span>
      </div>
      <div class="min-w-0">
        <div class="text-sm font-bold text-slate-900">${escapeHtml(ticketCategoryLabel(t))}${t.reopenCount ? ' <span class="ml-1 px-1.5 py-0.5 text-[9px] font-extrabold rounded bg-orange-50 text-orange-700 border border-orange-200 uppercase">Reopened</span>' : ''}${t.outsideCampus ? ' <span class="ml-1 px-1.5 py-0.5 text-[9px] font-extrabold rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase">Outside campus</span>' : ''}</div>
        <div class="text-xs text-slate-500 line-clamp-2 md:line-clamp-1">${escapeHtml(t.description)}</div>
        <div class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(reporterLabel(t))}${(t.upvotes || 0) > 1 ? ` · <strong class="text-blue-600">${t.upvotes} affected</strong>` : ''}</div>
        <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i>${escapeHtml(t.location || '')}</div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        ${isHigh ? '<span class="px-2.5 py-1 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wider">Urgent</span>' : ''}
        ${!t.assignedTo
          ? '<span class="px-2.5 py-1 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">Not assigned</span>'
          : `<span class="px-2.5 py-1 text-[10px] font-bold rounded-full ${t.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-violet-50 text-violet-700 border-violet-200'} border truncate max-w-[160px]" title="${escapeHtml((t.assignedBy === 'auto' ? 'Auto-assigned: ' : '') + (t.assignReason || '') + (t.status === 'In Progress' ? ' (working on it)' : ' (not started yet)'))}">${t.assignedBy === 'auto' ? '⚡ ' : ''}${escapeHtml(t.assignedToName || 'Assigned')}${t.status === 'In Progress' ? ' · working' : ' · not started'}</span>`}
      </div>
      <div class="flex items-center md:justify-end gap-1.5">
        <select onchange="assignTicket('${t.id}', this.value, this)" class="assign-select flex-1 md:flex-none md:w-[140px] ${t.assignedTo ? 'is-assigned' : ''}" aria-label="Assign technician" title="${t.assignedTo ? 'Change technician' : 'Assign a technician'}">
          <option value="">${t.assignedTo ? '↻ Change…' : 'Assign…'}</option>
          ${onDutyTechs.length ? techOptions(t.assignedTo) : '<option disabled>No technicians on duty</option>'}
        </select>
        ${isHigh ? '' : `<button onclick="escalateTicket('${t.id}')" class="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shrink-0" title="Mark as urgent" aria-label="Mark urgent"><i data-lucide="flame" class="w-3.5 h-3.5"></i></button>`}
        ${(t.upvotes || 0) >= 2 && !cachedNotices.some(n => n.title && n.title.includes(t.subCategory || '§')) ? `<button onclick="postNoticeForTicket('${t.id}')" class="p-2 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg shrink-0" title="Post a notice so people stop reporting this" aria-label="Post notice"><i data-lucide="megaphone" class="w-3.5 h-3.5"></i></button>` : ''}
        <button onclick="openTicketDetailModal('${t.id}')" class="px-3 py-2 text-xs font-bold text-iiitg-700 bg-iiitg-50 hover:bg-iiitg-100 border border-iiitg-100 rounded-lg whitespace-nowrap shrink-0">View</button>
      </div>
    </div>`;
  }).join(''));
  if (window.lucide) lucide.createIcons();
}

function setTriageFilter(f) { triageFilter = f; renderAdminTriage(); }

const DEPT_FOR_CATEGORY = new Proxy({}, { get: (_, k) => teamForCategory(k) });

async function autoAssignAll(btn) {
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Assigning...';
  if (window.lucide) lucide.createIcons();
  try {
    const r = await API.autoAssignWaiting();
    const left = r.waiting - r.assigned;
    showToast(r.assigned ? `${r.assigned} ticket${r.assigned > 1 ? 's' : ''} assigned.${left ? ` ${left} still waiting (no technician on duty in that department).` : ''}` : 'No technician is on duty in the needed departments.', r.assigned ? 'success' : 'warning');
  } catch (err) { console.error(err); showToast('Auto-assign failed: ' + err.message, 'error'); }
  finally { btn.innerHTML = orig; btn.disabled = false; if (window.lucide) lucide.createIcons(); }
}

function ageText(t) {
  const c = ticketCreatedMs(t);
  return c ? formatDuration(Date.now() - c) + ' old' : '';
}

async function escalateTicket(id) {
  try {
    await API.escalateTicket(id);
    showToast(`Ticket ${id} marked as urgent.`, 'warning');
  } catch (err) {
    console.error(err);
    showToast('Failed to escalate ticket: ' + err.message, 'error');
  }
}

async function assignTicket(ticketId, techId, selectEl) {
  if (!techId) return;
  const tech = cachedTechnicians.find(x => x.firebaseId === techId);
  if (!tech) return;
  if (selectEl) selectEl.disabled = true;
  try {
    await API.assignTicket(ticketId, techId, tech.name);
    showToast(`Assigned ${ticketId} to ${tech.name}.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to assign ticket: ' + err.message, 'error');
    if (selectEl) { selectEl.disabled = false; selectEl.value = ''; }
  }
}

function techAvatar(tech, size, extra = '') {
  if (tech.photoUrl) return `<img src="${escapeHtml(tech.photoUrl)}" alt="" class="${size} rounded-full object-cover shrink-0 ${extra}">`;
  return `<div class="${size} rounded-full flex items-center justify-center font-bold shrink-0 ${extra}">${escapeHtml((tech.name || '?').charAt(0))}</div>`;
}

// ─── TECHNICIAN PERFORMANCE ───
let techPeriod = 'month';
const expandedTechs = new Set();

function setTechPeriod(p) { techPeriod = p; renderAdminWorkload(); }
function toggleTechTasks(id) { expandedTechs.has(id) ? expandedTechs.delete(id) : expandedTechs.add(id); renderAdminWorkload(); }

function techPeriodStart() {
  const now = new Date();
  if (techPeriod === 'week') return startOfWeek(now).getTime();
  if (techPeriod === 'month') return startOfMonth(now).getTime();
  if (techPeriod === 'year') return startOfYear(now).getTime();
  return 0;
}

// Work time on a ticket: from acknowledgement (start of work) to completion
function workStartMs(t) { return t.acknowledgedAt || t.assignedAt || ticketCreatedMs(t); }
function workMs(t) {
  const end = t.status === 'Resolved' ? ticketResolvedMs(t) : Date.now();
  const start = workStartMs(t);
  return start && end && end >= start ? end - start : null;
}
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const sum = arr => arr.reduce((a, b) => a + b, 0);
function formatHours(ms) { if (ms == null) return '–'; const h = ms / 3600000; return h < 10 ? h.toFixed(1) + 'h' : Math.round(h) + 'h'; }

function techStats(techId) {
  const from = techPeriodStart();
  const mine = cachedTickets.filter(t => (t.resolvedBy || t.assignedTo) === techId || t.assignedTo === techId);
  const assigned = mine.filter(t => (t.assignedAt || ticketCreatedMs(t) || 0) >= from);
  const completed = mine.filter(t => t.status === 'Resolved' && (ticketResolvedMs(t) || 0) >= from);
  const open = mine.filter(t => t.status !== 'Resolved' && t.assignedTo === techId);
  const awaiting = open.filter(t => t.status === 'Pending');
  const working = open.filter(t => t.status === 'In Progress');
  const overdue = open.filter(isOverdue);
  const fix = completed.map(t => { const c = ticketCreatedMs(t), r = ticketResolvedMs(t); return c && r && r >= c ? r - c : null; }).filter(x => x !== null);
  const work = completed.map(workMs).filter(x => x !== null);
  const resp = mine.filter(t => t.acknowledgedAt && t.assignedAt && t.acknowledgedAt >= t.assignedAt && t.acknowledgedAt >= from).map(t => t.acknowledgedAt - t.assignedAt);
  const ratings = completed.map(t => t.rating).filter(Boolean);
  return { mine, assigned, completed, open, awaiting, working, overdue,
    avgFix: avg(fix), avgWork: avg(work), totalWork: work.length ? sum(work) : null, avgResp: avg(resp), avgRating: avg(ratings) };
}

function renderAdminWorkload() {
  const cards = document.getElementById('techCards');
  const bar = document.getElementById('techSummaryBar');
  if (!cards || !bar) return;
  document.querySelectorAll('.tech-period').forEach(b => b.classList.toggle('active', b.dataset.period === techPeriod));
  const labels = { week: 'This week', month: 'This month', year: 'This year', all: 'All time' };
  const lbl = document.getElementById('techRangeLabel');
  if (lbl) lbl.textContent = `${labels[techPeriod]}: tickets given and fixed, and hours worked. Open and late counts are right now.`;

  if (cachedTechnicians.length === 0) {
    patchHtml(bar, '');
    patchHtml(cards, `<div data-live-key="workload-empty" class="col-span-full text-center py-14 bg-white rounded-2xl border border-slate-200 border-dashed"><p class="text-sm text-slate-500 font-semibold">No technicians yet. Add staff from <strong>Manage Staff</strong>.</p></div>`);
    return;
  }

  const all = cachedTechnicians.map(tech => ({ tech, s: techStats(tech.firebaseId) }));
  const teamWork = all.flatMap(x => x.s.completed.map(workMs).filter(v => v !== null));
  const tile = (label, value, cls, sub) => `<div class="stat-card"><span class="stat-label ${cls}">${label}</span><span class="stat-value text-slate-800 !text-xl sm:!text-2xl">${value}</span>${sub ? `<span class="text-[10px] text-slate-400 font-semibold">${sub}</span>` : ''}</div>`;
  patchHtml(bar,
    tile('Technicians', `${cachedTechnicians.filter(t => t.status === 'On Duty').length}<span class="text-sm text-slate-400">/${cachedTechnicians.length}</span>`, 'text-emerald-600', 'on duty') +
    tile('Given', sum(all.map(x => x.s.assigned.length)), 'text-slate-500', labels[techPeriod].toLowerCase()) +
    tile('Fixed', sum(all.map(x => x.s.completed.length)), 'text-emerald-600', labels[techPeriod].toLowerCase()) +
    tile('Open now', sum(all.map(x => x.s.open.length)), 'text-blue-600', `${sum(all.map(x => x.s.awaiting.length))} not started`) +
    tile('Late', sum(all.map(x => x.s.overdue.length)), 'text-rose-600', `open 2+ days`) +
    tile('Work hours', formatHours(teamWork.length ? sum(teamWork) : null), 'text-amber-600', `avg ${formatDuration(avg(teamWork))} per task`));

  all.sort((a, b) => (b.tech.status === 'On Duty') - (a.tech.status === 'On Duty') || b.s.completed.length - a.s.completed.length);
  patchHtml(cards, all.map(({ tech, s }) => {
    const on = tech.status === 'On Duty';
    const rate = s.assigned.length ? Math.round(100 * s.assigned.filter(t => t.status === 'Resolved').length / s.assigned.length) : null;
    const metric = (label, value, cls = 'text-slate-800') => `<div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${label}</div><div class="text-lg font-extrabold ${cls}">${value}</div></div>`;
    const expanded = expandedTechs.has(tech.firebaseId);
    const tasks = [...s.mine].sort((a, b) => (workStartMs(b) || 0) - (workStartMs(a) || 0)).slice(0, 12);
    return `<article data-live-key="workload-${escapeHtml(tech.firebaseId)}" class="panel p-4 sm:p-5 flex flex-col gap-4">
      <div class="flex items-start gap-3">
        ${techAvatar(tech, 'w-12 h-12 text-lg', on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}
        <div class="min-w-0 flex-1">
          <h4 class="text-[15px] font-bold text-slate-900 truncate">${escapeHtml(tech.name)}</h4>
          <p class="text-[11px] text-slate-500 font-bold uppercase tracking-wider truncate">${escapeHtml(tech.dept)}</p>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span class="inline-flex items-center gap-1 font-semibold ${on ? 'text-emerald-700' : 'text-slate-400'}"><span class="w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}"></span>${on ? 'On Duty' : 'Off Duty'}</span>
            <span class="font-mono text-slate-500 truncate">${escapeHtml(tech.email || '')}</span>
            ${tech.phone && tech.phone !== 'Not provided' ? `<a href="tel:${escapeHtml(tech.phone)}" class="text-emerald-600 font-semibold hover:underline">${escapeHtml(tech.phone)}</a>` : ''}
          </div>
        </div>
        <button onclick="messageTechnician('${tech.firebaseId}')" class="shrink-0 p-2.5 rounded-xl text-iiitg-700 bg-iiitg-50 hover:bg-iiitg-100 border border-iiitg-100" title="Message ${escapeHtml(tech.name)}" aria-label="Message"><i data-lucide="message-square" class="w-4 h-4"></i></button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        ${metric('Given', s.assigned.length)}
        ${metric('Fixed', s.completed.length, 'text-emerald-700')}
        ${metric('Open', `${s.open.length}${s.awaiting.length ? `<span class="text-[11px] font-bold text-amber-600"> · ${s.awaiting.length} new</span>` : ''}`, 'text-blue-700')}
        ${metric('Late', s.overdue.length, s.overdue.length ? 'text-rose-600' : 'text-slate-800')}
        ${metric('Avg. time to fix', formatDuration(s.avgFix), 'text-slate-800')}
        ${metric('Work hours', formatHours(s.totalWork), 'text-amber-700')}
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 font-semibold">
        <span title="Average time from pressing Start to marking it fixed">Avg. work per ticket: <strong class="text-slate-700">${formatDuration(s.avgWork)}</strong></span>
        <span title="Average time from being given a ticket to pressing Start">Avg. time to start: <strong class="text-slate-700">${formatDuration(s.avgResp)}</strong></span>
        <span>Fixed %: <strong class="text-slate-700">${rate === null ? '–' : rate + '%'}</strong></span>
        ${s.avgRating ? `<span>Rating: <strong class="text-amber-600">★ ${s.avgRating.toFixed(1)}</strong></span>` : ''}
      </div>

      <div class="border-t border-slate-100 pt-3">
        <button onclick="toggleTechTasks('${tech.firebaseId}')" class="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900">
          <span>Ticket history (${s.mine.length})</span><i data-lucide="${expanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4"></i>
        </button>
        ${expanded ? `<div class="mt-2 divide-y divide-slate-100">${tasks.length ? tasks.map(t => {
          const w = workMs(t);
          const st = statusLabel(t);
          return `<button onclick="openTicketDetailModal('${escapeHtml(t.id)}')" class="w-full text-left py-2 flex items-center gap-2 text-xs hover:bg-slate-50 rounded-lg px-1">
            <span class="font-mono font-bold text-iiitg-700 shrink-0">${escapeHtml(t.id)}</span>
            <span class="truncate text-slate-600 flex-1">${escapeHtml(ticketCategoryLabel(t))}</span>
            <span class="shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-bold ${getStatusConfig(t.status)}">${st}</span>
            <span class="shrink-0 w-14 text-right font-semibold ${isOverdue(t) ? 'text-rose-600' : 'text-slate-500'}" title="${t.status === 'Resolved' ? 'Work time' : 'Time so far'}">${t.status === 'Pending' ? '–' : formatDuration(w)}</span>
          </button>`;
        }).join('') : '<p class="text-xs text-slate-400 py-2">No tasks yet.</p>'}</div>` : ''}
      </div>
    </article>`;
  }).join(''));
  if (window.lucide) lucide.createIcons();
}

// ─── STAFF MANAGEMENT (USERS TAB) ───
// Which staff list the admin is viewing: 'technicians' or 'members'.
let staffView = 'technicians';
function setStaffView(kind) {
  staffView = (kind === 'members') ? 'members' : 'technicians';
  const sel = document.getElementById('staffViewSelect');
  if (sel && sel.value !== staffView) sel.value = staffView;
  const t = document.getElementById('staffView-technicians');
  const m = document.getElementById('staffView-members');
  if (t) t.classList.toggle('hidden', staffView !== 'technicians');
  if (m) m.classList.toggle('hidden', staffView !== 'members');
  updateStaffViewCount();
}
function updateStaffViewCount() {
  const el = document.getElementById('staffViewCount');
  if (!el) return;
  const members = (typeof cachedCampusMembers !== 'undefined') ? cachedCampusMembers.length : 0;
  const n = staffView === 'members' ? members : cachedTechnicians.length;
  el.textContent = n === 1 ? '1 account' : `${n} accounts`;
}

// Make sure existing staff (created before phone sign-in existed) can log in by
// phone. Runs once automatically per admin session; also triggerable by button.
async function syncStaffPhoneLogins(btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await API.rebuildStaffPhoneIndex();
    showToast(`Phone sign-in is ready for ${r.count} staff account${r.count === 1 ? '' : 's'}.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Could not sync phone logins: ' + err.message, 'error');
  } finally { if (btn) btn.disabled = false; }
}

function renderAdminUsers() {
  renderAdminApprovals();
  renderCampusMembers();
  setStaffView(staffView);
  if (!window.__phoneIndexSynced) {
    window.__phoneIndexSynced = true;
    if (window.API && API.rebuildStaffPhoneIndex) API.rebuildStaffPhoneIndex().catch(() => {});
  }
  const body = document.getElementById('adminUsersTableBody');
  if (!body) return;

  if (cachedTechnicians.length === 0) {
    patchHtml(body, `<div data-live-key="technicians-empty" class="px-6 py-14 text-center text-slate-500 text-sm font-semibold">No staff yet. Click <strong>Add Staff</strong> to create the first technician.</div>`);
    return;
  }

  patchHtml(body, cachedTechnicians.map(tech => {
    const on = tech.status === 'On Duty';
    return `<div data-live-key="technician-${escapeHtml(tech.firebaseId)}" class="p-4 lg:px-5 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1.4fr_auto] gap-3 lg:gap-4 lg:items-center">
      <div class="flex items-center gap-3 min-w-0">
        ${techAvatar(tech, 'w-10 h-10 text-sm', 'bg-slate-100 text-slate-500')}
        <div class="min-w-0">
          <span class="text-sm font-bold text-slate-900 block truncate">${escapeHtml(tech.name)}</span>
          <span class="inline-flex items-center gap-1 text-[10px] font-bold ${on ? 'text-emerald-700' : 'text-slate-400'}"><span class="w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}"></span>${on ? 'On Duty' : 'Off Duty'}</span>
        </div>
        <span class="lg:hidden ml-auto text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200 shrink-0">${escapeHtml(tech.dept)}</span>
      </div>
      <div class="hidden lg:block"><span class="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">${escapeHtml(tech.dept)}</span></div>
      <div class="min-w-0 text-xs space-y-0.5">
        <div class="font-mono font-bold text-slate-700 truncate">${escapeHtml(tech.email || '-')}</div>
        ${tech.phone && tech.phone !== 'Not provided' ? `<a href="tel:${escapeHtml(tech.phone)}" class="inline-flex items-center gap-1 text-emerald-600 font-semibold hover:underline"><i data-lucide="phone" class="w-3 h-3"></i>${escapeHtml(tech.phone)}</a>` : ''}
        ${tech.personalEmail && tech.personalEmail !== 'None' ? `<div class="text-slate-400 truncate">${escapeHtml(tech.personalEmail)}</div>` : ''}
      </div>
      <div class="grid grid-cols-3 lg:flex gap-2 lg:justify-end lg:w-[300px]">
        <button onclick="messageTechnician('${tech.firebaseId}')" class="px-2.5 py-2 text-xs font-bold text-iiitg-700 bg-iiitg-50 hover:bg-iiitg-100 rounded-lg border border-iiitg-100 inline-flex items-center justify-center gap-1" title="Message"><i data-lucide="message-square" class="w-3.5 h-3.5"></i><span class="lg:hidden">Chat</span></button>
        <button onclick="resetStaffPassword('${tech.firebaseId}', this)" class="px-2.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 inline-flex items-center justify-center gap-1"><i data-lucide="key" class="w-3.5 h-3.5"></i>Reset link</button>
        <button onclick="openDeleteStaffModal('${tech.firebaseId}')" class="px-2.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 inline-flex items-center justify-center gap-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Delete</button>
      </div>
    </div>`;
  }).join(''));
  if (window.lucide) lucide.createIcons();
}

// Non-teaching staff / campus members — report-only accounts, listed separately.
function renderCampusMembers() {
  const body = document.getElementById('adminMembersTableBody');
  if (!body) return;
  const members = (typeof cachedCampusMembers !== 'undefined') ? cachedCampusMembers : [];
  if (!members.length) {
    patchHtml(body, `<div data-live-key="members-empty" class="px-6 py-8 text-center text-slate-400 text-xs font-semibold">No non-teaching staff yet. Use <strong>Add Staff</strong> → "Non-teaching staff". Their campus-user access is created automatically.</div>`);
    return;
  }
  patchHtml(body, members.map(m => {
    const initials = (m.name || '?').split(/[.\s]+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
    return `<div data-live-key="member-${escapeHtml(m.uid || m.firebaseId)}" class="p-4 lg:px-5 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1.4fr_auto] gap-3 lg:gap-4 lg:items-center">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-sm shrink-0">${escapeHtml(initials)}</div>
        <span class="text-sm font-bold text-slate-900 truncate">${escapeHtml(m.name || '')}</span>
      </div>
      <div class="space-y-1"><span class="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">${escapeHtml(m.section || 'Non-teaching staff')}</span><div class="text-[10px] font-semibold text-emerald-700">Campus user · can report issues</div></div>
      <div class="min-w-0 text-xs space-y-0.5">
        <div class="font-mono font-bold text-slate-700 truncate">${escapeHtml(m.email || '-')}</div>
        ${m.phone && m.phone !== 'Not provided' ? `<a href="tel:${escapeHtml(m.phone)}" class="inline-flex items-center gap-1 text-emerald-600 font-semibold hover:underline"><i data-lucide="phone" class="w-3 h-3"></i>${escapeHtml(m.phone)}</a>` : ''}
      </div>
      <div class="grid grid-cols-2 lg:flex gap-2 lg:justify-end lg:w-[220px]">
        <button onclick="resetStaffPassword('${m.uid}', this)" class="px-2.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 inline-flex items-center justify-center gap-1"><i data-lucide="key" class="w-3.5 h-3.5"></i>Reset link</button>
        <button onclick="deleteCampusMember('${m.uid}', '${escapeHtml(m.name || '')}')" class="px-2.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 inline-flex items-center justify-center gap-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Delete</button>
      </div>
    </div>`;
  }).join(''));
  if (window.lucide) lucide.createIcons();
}

async function deleteCampusMember(uid, name) {
  if (!confirm(`Remove ${name || 'this staff member'}? Their login will stop working (the account stays reserved in Firebase).`)) return;
  try { await API.deleteCampusMember(uid); showToast(`${name || 'Staff member'} removed.`, 'success'); }
  catch (err) { showToast('Could not remove: ' + err.message, 'error'); }
}

// Which kind of account the admin is registering: a technician (fixes issues)
// or a non-teaching staff member (reports only). They are kept fully separate.
let staffKind = 'technician';
function setStaffKind(kind) {
  staffKind = kind;
  document.querySelectorAll('.staff-kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === kind));
  const isTech = kind === 'technician';
  document.getElementById('newStaffDept').classList.toggle('hidden', !isTech);
  document.getElementById('newStaffSection').classList.toggle('hidden', isTech);
  document.getElementById('newStaffDeptLabel').textContent = isTech ? 'Team' : 'Section / Office';
  const submitBtn = document.querySelector('#addStaffForm button[type="submit"]');
  if (submitBtn) submitBtn.textContent = isTech ? 'Create Technician' : 'Create Staff Account';
  const title = document.getElementById('addStaffTitle');
  if (title) title.textContent = isTech ? 'Register Technician' : 'Register Non-teaching Staff';
}

function openAddStaffModal() {
  const deptSel = document.getElementById('newStaffDept');
  deptSel.innerHTML = '<option value="">Select team...</option>' + TEAMS.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  document.getElementById('addStaffForm').reset();
  document.getElementById('generatedStaffEmail').textContent = '-';
  document.getElementById('generatedStaffPass').textContent = '-';
  setStaffKind(staffView === 'members' ? 'member' : 'technician');
  handleFileUpload(document.getElementById('newStaffPhotoInput'), 'newStaffPhotoName');
  showModal('addStaffModal');
}
function closeAddStaffModal() { hideModal('addStaffModal'); }

// The technician logs in with their own (personal) email, so password-reset
// links can reach them. We just show that email back and generate a one-time
// temporary password for the admin to hand over.
function generateStaffCredentials() {
  const email = document.getElementById('newStaffEmail').value.trim().toLowerCase();
  document.getElementById('generatedStaffEmail').textContent = email && email.includes('@') ? email : '-';
  if (email && email.includes('@') && document.getElementById('generatedStaffPass').textContent === '-') {
    document.getElementById('generatedStaffPass').textContent = `Temp@${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const addForm = document.getElementById('addStaffForm');
  if (!addForm) return;
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isMember = staffKind === 'member';
    const name = document.getElementById('newStaffName').value.trim();
    const dept = document.getElementById('newStaffDept').value;
    const section = document.getElementById('newStaffSection').value.trim();
    const email = document.getElementById('newStaffEmail').value.trim().toLowerCase();
    generateStaffCredentials();
    const password = document.getElementById('generatedStaffPass').textContent.trim();
    const personalEmail = email;
    const phone = document.getElementById('newStaffPhone').value.trim();

    if (!name) { showToast('Enter the full name.', 'warning'); return; }
    if (!email || !email.includes('@')) {
      showToast("Enter their email — they'll use it to log in and reset their password.", 'warning');
      return;
    }
    if (!isMember && !dept) { showToast('Choose a team for the technician.', 'warning'); return; }
    if (!password || password === '-') {
      showToast('Could not generate a temporary password. Try again.', 'warning');
      return;
    }
    const exists = cachedTechnicians.some(t => (t.email || '').toLowerCase() === email) || cachedCampusMembers.some(m => (m.email || '').toLowerCase() === email);
    if (exists) { showToast(`An account with email ${email} already exists.`, 'error'); return; }
    // Phone numbers must be unique so phone sign-in is unambiguous.
    const phoneDigits = (phone || '').replace(/\D/g, '').slice(-10);
    if (phoneDigits.length >= 10) {
      const last10 = s => (s || '').replace(/\D/g, '').slice(-10);
      const dupPhone = cachedTechnicians.some(t => last10(t.phone) === phoneDigits) || cachedCampusMembers.some(m => last10(m.phone) === phoneDigits);
      if (dupPhone) { showToast(`Another staff member already uses phone ${phone}. Phone numbers must be unique so they can sign in by phone.`, 'error'); return; }
    } else {
      showToast('Enter a valid 10-digit phone number — staff use it to sign in.', 'warning'); return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Creating...`;
    btn.disabled = true;

    try {
      let photoUrl = null;
      const photoInput = document.getElementById('newStaffPhotoInput');
      if (photoInput.files && photoInput.files.length > 0) {
        try { photoUrl = await API.uploadFile(photoInput.files[0], 'profile_photos'); }
        catch (upErr) { showToast('Photo skipped: ' + upErr.message, 'warning'); }
      }
      if (isMember) {
        await API.createCampusMember({ name, email, password, phone, section, photoUrl });
      } else {
        await API.createTechnician({ name, dept, email, password, personalEmail, phone, photoUrl });
      }
      closeAddStaffModal();
      // Show the credentials so the admin can hand them over
      document.getElementById('adminCredTitle').textContent = isMember ? 'Staff Account Created' : 'Technician Account Created';
      document.getElementById('adminCredNote').textContent = 'Login details created for';
      document.getElementById('adminCredHint').classList.remove('hidden');
      document.getElementById('resetStaffNameDisplay').textContent = name;
      document.getElementById('resetStaffNewPassDisplay').textContent = password;
      document.getElementById('resetStaffPhoneDisplay').textContent = phone || 'Not provided';
      document.getElementById('resetStaffEmailDisplay').textContent = personalEmail || 'None';
      const loginNote = document.getElementById('adminCredLoginNote');
      if (loginNote) loginNote.classList.remove('hidden');
      showModal('adminResetPasswordModal');
      showToast(`Staff member ${name} created.`, 'success');
    } catch (err) {
      console.error(err);
      const msg = (err.code || '').includes('email-already-in-use') ? 'That login email already has an account.' : err.message;
      showToast('Failed: ' + msg, 'error');
    } finally {
      btn.innerHTML = orig;
      btn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }
  });
});

let pendingResetTechId = null;
async function resetStaffPassword(techId, btn) {
  const tech = cachedTechnicians.find(t => t.firebaseId === techId);
  if (btn) btn.disabled = true;
  try {
    const result = await API.resetTechnicianPassword(techId);
    showPasswordResetSent(result.name, result.email);
    showToast(`Reset link sent to ${result.email}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Could not send reset link: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Confirmation shown after a reset link is e-mailed (no password is revealed)
function showPasswordResetSent(name, email) {
  document.getElementById('adminCredTitle').textContent = 'Reset Link Sent';
  document.getElementById('adminCredNote').textContent = 'A password-reset link was e-mailed to';
  document.getElementById('resetStaffNameDisplay').textContent = name;
  document.getElementById('resetStaffNewPassDisplay').textContent = email;
  document.getElementById('resetStaffPhoneDisplay').textContent = '—';
  document.getElementById('resetStaffEmailDisplay').textContent = 'They click the link and choose their own new password.';
  const hint = document.getElementById('adminCredHint');
  if (hint) { hint.textContent = 'For security, the password is never shown to or stored by the admin.'; hint.classList.remove('hidden'); }
  showModal('adminResetPasswordModal');
}

// ─── DELETE TECHNICIAN ───
let pendingDeleteTechId = null;
function openDeleteStaffModal(techId) {
  const tech = cachedTechnicians.find(t => t.firebaseId === techId);
  if (!tech) return;
  pendingDeleteTechId = techId;
  const open = cachedTickets.filter(t => t.assignedTo === techId && t.status !== 'Resolved').length;
  document.getElementById('deleteStaffName').textContent = tech.name;
  document.getElementById('deleteStaffEmail').textContent = tech.email || '';
  document.getElementById('deleteStaffTickets').textContent = open
    ? `${open} open ticket${open > 1 ? 's' : ''} assigned to them will go back to the Unassigned queue.`
    : 'They have no open tickets.';
  showModal('deleteStaffModal');
}

async function confirmDeleteStaff(btn) {
  if (!pendingDeleteTechId) return;
  const orig = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline-block"></i> Deleting...`;
  btn.disabled = true;
  if (window.lucide) lucide.createIcons();
  try {
    const res = await API.deleteTechnician(pendingDeleteTechId);
    API.autoAssignWaiting().catch(e => console.warn(e));
    hideModal('deleteStaffModal');
    pendingDeleteTechId = null;
    showToast(res.loginDeleted
      ? `${res.name} has been deleted.`
      : `${res.name} removed from staff and can no longer sign in. (Their old login email stays reserved in Firebase.)`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to delete: ' + err.message, 'error');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
  }
}

// ─── PROFILE PHOTO APPROVALS ───
function renderAdminApprovals() {
  const container = document.getElementById('adminApprovalsContainer');
  const list = document.getElementById('adminApprovalsList');
  if (!container || !list) return;
  if (cachedProfileRequests.length === 0) { container.classList.add('hidden'); return; }

  container.classList.remove('hidden');
  list.innerHTML = '';
  cachedProfileRequests.forEach(req => {
    const div = document.createElement('div');
    div.className = "flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200 shadow-sm";
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="${escapeHtml(req.photoUrl)}" alt="" class="w-10 h-10 rounded-lg object-cover border border-amber-200 cursor-pointer" data-attachment>
        <div>
          <h4 class="text-xs font-bold text-slate-900">${escapeHtml(req.techName)}</h4>
          <p class="text-[10px] text-slate-500">Requested to update profile picture</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="resolveProfileRequest('${req.id}', true, this)" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded border border-emerald-200 transition-colors">Approve</button>
        <button onclick="resolveProfileRequest('${req.id}', false, this)" class="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded border border-rose-200 transition-colors">Reject</button>
      </div>
    `;
    list.appendChild(div);
  });
  if (window.lucide) lucide.createIcons();
}

async function resolveProfileRequest(id, approve, btn) {
  if (btn) btn.disabled = true;
  try {
    await API.resolveProfileRequest(id, approve);
    showToast(approve ? 'Profile picture change approved.' : 'Profile picture change rejected.', approve ? 'success' : 'warning');
  } catch (err) {
    console.error(err);
    showToast('Failed: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}
// Old names kept for compatibility

// Inbox moved to the Messages drawer in the top navigation (js/nav.js)
