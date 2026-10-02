// ─── REPORTS (admin): monthly / custom range, Excel + PDF export ───
let reportRange = null;   // { from, to, label }

function monthRange(offset = 0) {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + offset);
  const end = new Date(d); end.setMonth(end.getMonth() + 1);
  return { from: d.getTime(), to: end.getTime(), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
}

function dayRange(dateObj) {
  const s = new Date(dateObj); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(e.getDate() + 1);
  return { from: s.getTime(), to: e.getTime(), label: s.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
}

function setReportRange(kind) {
  const now = new Date();
  if (kind === 'today') reportRange = dayRange(now);
  else if (kind === 'date') {
    const v = document.getElementById('repDate').value;  // YYYY-MM-DD
    if (!v) return;
    const [y, m, d] = v.split('-').map(Number);
    reportRange = dayRange(new Date(y, m - 1, d));
  }
  else if (kind === 'this') reportRange = monthRange(0);
  else if (kind === 'last') reportRange = monthRange(-1);
  else if (kind === 'year') { const s = new Date(now.getFullYear(), 0, 1); reportRange = { from: s.getTime(), to: Date.now() + 1, label: `Year ${now.getFullYear()}` }; }
  else if (kind === 'month') {
    const v = document.getElementById('repMonth').value;   // YYYY-MM
    if (!v) return;
    const [y, m] = v.split('-').map(Number);
    const s = new Date(y, m - 1, 1), e = new Date(y, m, 1);
    reportRange = { from: s.getTime(), to: e.getTime(), label: s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  }
  document.querySelectorAll('.rep-range-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === kind));
  renderReports();
}

const placeOf = t => (t.location || 'Unknown').split(' — ')[0].trim() || 'Unknown';
const spotOf = t => (t.location || 'Unknown').trim().toLowerCase().replace(/\s+/g, ' ');
const fmtDate = ms => ms ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function buildReport() {
  if (!reportRange) reportRange = monthRange(0);
  const { from, to } = reportRange;
  const inRange = ms => ms != null && ms >= from && ms < to;
  const reported = cachedTickets.filter(t => inRange(ticketCreatedMs(t) ?? Date.now()));
  const fixed = cachedTickets.filter(t => inRange(ticketResolvedMs(t)));
  const fixTimes = fixed.map(t => { const c = ticketCreatedMs(t), r = ticketResolvedMs(t); return c && r && r >= c ? r - c : null; }).filter(v => v != null);
  const workTimes = fixed.map(workMs).filter(v => v != null);
  const ratings = fixed.map(t => t.rating).filter(Boolean);

  // by category
  const byCat = {};
  reported.forEach(t => { const k = t.category || 'Other'; byCat[k] = byCat[k] || { reported: 0, fixed: 0, urgent: 0 }; byCat[k].reported++; if (t.priority === 'High') byCat[k].urgent++; });
  fixed.forEach(t => { const k = t.category || 'Other'; byCat[k] = byCat[k] || { reported: 0, fixed: 0, urgent: 0 }; byCat[k].fixed++; });

  // by building / place
  const byPlace = {};
  reported.forEach(t => { const p = placeOf(t); byPlace[p] = (byPlace[p] || 0) + 1; });

  // repeat problems: same spot + same type, 2+ times (all time, so patterns show)
  const repeatMap = {};
  cachedTickets.forEach(t => {
    const key = spotOf(t) + '|' + (t.category || '') + '|' + (t.subCategory || '');
    (repeatMap[key] = repeatMap[key] || []).push(t);
  });
  const repeats = Object.values(repeatMap).filter(arr => arr.length >= 2 && arr.some(t => inRange(ticketCreatedMs(t) ?? Date.now())))
    .map(arr => ({ location: arr[0].location, type: ticketCategoryLabel(arr[0]), count: arr.length, reopened: arr.reduce((s, t) => s + (t.reopenCount || 0), 0), ids: arr.map(t => t.id) }))
    .sort((a, b) => b.count - a.count);
  // also tickets reopened in range
  const reopened = cachedTickets.filter(t => t.reopenCount && inRange(t.reopenedAt));

  // materials
  // Every fix attempt is logged (a reopened ticket keeps the parts used the first time)
  const mats = {};
  const usage = [];
  cachedTickets.forEach(t => {
    if (Array.isArray(t.materialsLog) && t.materialsLog.length) t.materialsLog.forEach(l => { if (inRange(l.at)) usage.push(...(l.items || [])); });
    else if (inRange(ticketResolvedMs(t))) usage.push(...(t.materialsUsed || []));
  });
  usage.forEach(m => {
    const k = m.item + '|' + (m.unit || '');
    mats[k] = mats[k] || { item: m.item, unit: m.unit || '', qty: 0, jobs: 0 };
    mats[k].qty += Number(m.qty) || 0; mats[k].jobs++;
  });
  const materials = Object.values(mats).sort((a, b) => b.jobs - a.jobs);

  // technicians
  const techRows = cachedTechnicians.map(tech => {
    const mine = fixed.filter(t => (t.resolvedBy || t.assignedTo) === tech.firebaseId);
    const given = reported.filter(t => t.assignedTo === tech.firebaseId || t.resolvedBy === tech.firebaseId);
    const w = mine.map(workMs).filter(v => v != null);
    const r = mine.map(t => t.rating).filter(Boolean);
    return { name: tech.name, team: tech.dept, given: given.length, fixed: mine.length,
      hours: w.length ? w.reduce((a, b) => a + b, 0) : null, avgWork: avg(w), rating: avg(r),
      reopened: cachedTickets.filter(t => t.reopenCount && (t.reopenHistory || []).some(h => h.fixedBy === tech.name && inRange(h.at))).length };
  }).sort((a, b) => b.fixed - a.fixed);

  return { reported, fixed, fixTimes, workTimes, ratings, byCat, byPlace, repeats, reopened, materials, techRows,
    stillOpen: cachedTickets.filter(t => t.status !== 'Resolved').length };
}

function renderReports() {
  const root = document.getElementById('reportBody');
  if (!root) return;
  const R = buildReport();
  document.getElementById('reportTitle').textContent = `CampusCare report: ${reportRange.label}`;
  const card = (label, value, cls = 'text-slate-800') => `<div class="rounded-xl bg-slate-50 border border-slate-200 p-3"><div class="stat-label text-slate-500">${label}</div><div class="text-2xl font-extrabold ${cls}">${value}</div></div>`;
  const table = (heads, rows, empty) => rows.length ? `<div class="overflow-x-auto"><table class="w-full text-left text-xs report-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="text-xs text-slate-400 py-3">${empty}</p>`;
  const section = (title, sub, inner) => `<section class="panel p-4 sm:p-5 report-section"><h3 class="text-sm font-extrabold text-slate-900">${title}</h3>${sub ? `<p class="text-[11px] text-slate-500 mb-3">${sub}</p>` : '<div class="mb-3"></div>'}${inner}</section>`;

  patchHtml(root, `
    <section class="panel p-4 sm:p-5 report-section">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        ${card('Reported', R.reported.length)}
        ${card('Fixed', R.fixed.length, 'text-emerald-700')}
        ${card('Still open (now)', R.stillOpen, 'text-blue-700')}
        ${card('Avg. time to fix', formatDuration(avg(R.fixTimes)), 'text-amber-700')}
        ${card('Work hours', formatHours(R.workTimes.length ? R.workTimes.reduce((a, b) => a + b, 0) : null))}
        ${card('Avg. rating', R.ratings.length ? '★ ' + avg(R.ratings).toFixed(1) : '–', 'text-amber-600')}
      </div>
    </section>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${section('By problem type', '', table(['Type', 'Reported', 'Fixed', 'Urgent'],
        Object.entries(R.byCat).sort((a, b) => b[1].reported - a[1].reported).map(([k, v]) => [escapeHtml(CATEGORY_LABELS[k] || k), v.reported, v.fixed, v.urgent]), 'No tickets in this period.'))}
      ${section('By building / place', 'Where problems were reported', table(['Place', 'Tickets'],
        Object.entries(R.byPlace).sort((a, b) => b[1] - a[1]).map(([p, n]) => [escapeHtml(p), n]), 'No tickets in this period.'))}
    </div>
    ${section('Repeat problems', 'The same problem at the same spot 2 or more times. These may need a permanent fix.', table(['Spot', 'Problem', 'Times', 'Reopened', 'Tickets'],
      R.repeats.map(r => [escapeHtml(r.location || ''), escapeHtml(r.type), `<strong class="text-rose-600">${r.count}</strong>`, r.reopened || '–', `<span class="font-mono text-[10px]">${r.ids.map(escapeHtml).join(', ')}</span>`]), 'No repeat problems. 👍'))}
    ${section('Materials used', 'Recorded by technicians when marking jobs fixed', table(['Item', 'Total quantity', 'Used in jobs'],
      R.materials.map(m => [escapeHtml(m.item), `${+m.qty.toFixed(2)} ${escapeHtml(m.unit)}`, m.jobs]), 'No materials recorded in this period.'))}
    ${section('Technicians', '', table(['Technician', 'Team', 'Given', 'Fixed', 'Work hours', 'Avg. per job', 'Rating', 'Reopened'],
      R.techRows.map(r => [escapeHtml(r.name), escapeHtml(r.team || ''), r.given, r.fixed, formatHours(r.hours), formatDuration(r.avgWork), r.rating ? '★ ' + r.rating.toFixed(1) : '–', r.reopened || '–']), 'No technicians yet.'))}
    ${section('All tickets reported in this period', `${R.reported.length} tickets`, table(['Ticket', 'Reported', 'Type', 'Problem', 'Place', 'Status', 'Technician', 'Fixed on'],
      R.reported.map(t => [`<span class="font-mono">${escapeHtml(t.id)}</span>`, fmtDate(ticketCreatedMs(t)), escapeHtml(CATEGORY_LABELS[t.category] || t.category || ''), escapeHtml(t.subCategory || ''), escapeHtml(t.location || ''), escapeHtml(statusLabel(t)), escapeHtml(t.assignedToName || ''), fmtDate(ticketResolvedMs(t))]), 'No tickets in this period.'))}
  `);
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
}

async function downloadReportExcel(btn) {
  const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Preparing...';
  try {
    if (typeof XLSX === 'undefined') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const R = buildReport();
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    add('Summary', [['CampusCare report', reportRange.label], [], ['Reported', R.reported.length], ['Fixed', R.fixed.length], ['Still open (now)', R.stillOpen],
      ['Avg. time to fix (hours)', avg(R.fixTimes) ? +(avg(R.fixTimes) / 3600000).toFixed(2) : ''], ['Total work hours', R.workTimes.length ? +(R.workTimes.reduce((a, b) => a + b, 0) / 3600000).toFixed(2) : ''],
      ['Avg. rating', R.ratings.length ? +avg(R.ratings).toFixed(2) : '']]);
    add('Tickets', [['Ticket', 'Reported', 'Type', 'Problem', 'Place', 'Description', 'Urgent', 'Status', 'Technician', 'Started', 'Fixed on', 'Work hours', 'Materials used', 'Rating', 'Reopened', 'Reported by', 'Email'],
      ...R.reported.map(t => [t.id, fmtDate(ticketCreatedMs(t)), CATEGORY_LABELS[t.category] || t.category, t.subCategory || '', t.location || '', t.description || '', t.priority === 'High' ? 'Yes' : '',
        statusLabel(t), t.assignedToName || '', fmtDate(t.acknowledgedAt), fmtDate(ticketResolvedMs(t)), t.status === 'Resolved' && workMs(t) ? +(workMs(t) / 3600000).toFixed(2) : '',
        (t.materialsUsed || []).map(m => `${m.item} x${m.qty}${m.unit ? ' ' + m.unit : ''}`).join('; '), t.rating || '', t.reopenCount || '', t.confidential ? '(confidential)' : (t.userName || ''), t.confidential ? '' : (t.userEmail || '')])]);
    add('By type', [['Type', 'Reported', 'Fixed', 'Urgent'], ...Object.entries(R.byCat).map(([k, v]) => [CATEGORY_LABELS[k] || k, v.reported, v.fixed, v.urgent])]);
    add('By place', [['Place', 'Tickets'], ...Object.entries(R.byPlace).sort((a, b) => b[1] - a[1])]);
    add('Repeat problems', [['Spot', 'Problem', 'Times', 'Reopened', 'Tickets'], ...R.repeats.map(r => [r.location, r.type, r.count, r.reopened, r.ids.join(', ')])]);
    add('Materials', [['Item', 'Unit', 'Total quantity', 'Used in jobs'], ...R.materials.map(m => [m.item, m.unit, +m.qty.toFixed(2), m.jobs])]);
    add('Technicians', [['Technician', 'Team', 'Given', 'Fixed', 'Work hours', 'Avg. hours per job', 'Avg. rating', 'Reopened'],
      ...R.techRows.map(r => [r.name, r.team, r.given, r.fixed, r.hours ? +(r.hours / 3600000).toFixed(2) : '', r.avgWork ? +(r.avgWork / 3600000).toFixed(2) : '', r.rating ? +r.rating.toFixed(2) : '', r.reopened])]);
    XLSX.writeFile(wb, `CampusCare-report-${reportRange.label.replace(/\s+/g, '-')}.xlsx`);
  } catch (err) { console.error(err); showToast('Excel export failed: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = orig; if (window.lucide) lucide.createIcons(); }
}

function printReport() {
  document.body.classList.add('printing-report');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-report'), 500);
}
