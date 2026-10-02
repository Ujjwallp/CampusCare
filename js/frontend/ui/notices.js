// ─── CAMPUS NOTICES + ADMIN SETTINGS (UI) ───
let cachedNotices = [];
let appSettings = { meTooThreshold: 5, lateHours: 48, autoAssign: true };

// ---------- notice banner (everyone) ----------
const dismissedKey = () => `cc_dismissed_notices_${window.API && API.getCurrentUser() ? API.getCurrentUser().uid : 'anon'}`;
function getDismissed() { try { return JSON.parse(localStorage.getItem(dismissedKey()) || '[]'); } catch (e) { return []; } }
function dismissNotice(id) {
  try { localStorage.setItem(dismissedKey(), JSON.stringify([...getDismissed(), id].slice(-50))); } catch (e) {}
  renderNoticeBanner();
}

function noticeStyle(level) {
  return level === 'outage' ? { cls: 'bg-rose-50 border-rose-200 text-rose-900', icon: 'triangle-alert', tag: 'Known problem' }
    : level === 'warning' ? { cls: 'bg-amber-50 border-amber-200 text-amber-900', icon: 'construction', tag: 'Planned work' }
    : { cls: 'bg-blue-50 border-blue-200 text-blue-900', icon: 'info', tag: 'Notice' };
}

function renderNoticeBanner() {
  const box = document.getElementById('noticeBanner');
  if (!box) return;
  const dismissed = getDismissed();
  const list = cachedNotices.filter(n => !dismissed.includes(n.id));
  box.classList.toggle('hidden', !list.length);
  patchHtml(box, list.slice(0, 3).map(n => {
    const st = noticeStyle(n.level);
    const where = [n.category && CATEGORY_LABELS[n.category], n.zone].filter(Boolean).join(' · ');
    return `<div data-live-key="notice-${escapeHtml(n.id)}" class="flex items-start gap-3 p-3 sm:p-4 rounded-2xl border ${st.cls}">
      <i data-lucide="${st.icon}" class="w-5 h-5 shrink-0 mt-0.5"></i>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-extrabold uppercase tracking-wider opacity-70">${st.tag}${where ? ' · ' + escapeHtml(where) : ''}</div>
        <div class="text-sm font-extrabold">${escapeHtml(n.title)}</div>
        ${n.body ? `<p class="text-xs mt-0.5 leading-relaxed">${escapeHtml(n.body)}</p>` : ''}
      </div>
      <button onclick="dismissNotice('${n.id}')" class="p-1 opacity-60 hover:opacity-100" aria-label="Hide notice"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>`;
  }).join(''));
  if (window.lucide) lucide.createIcons();
}

// ---------- admin: Manage → Notices / Settings ----------
function setManagePanel(panel) {
  document.querySelectorAll('.manage-tab').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
  ['staff', 'notices', 'settings', 'activity'].forEach(p => document.getElementById('managePanel-' + p).classList.toggle('hidden', p !== panel));
  if (panel === 'notices') prepareNoticeForm();
  if (panel === 'settings') fillSettingsForm();
  if (panel === 'activity') renderAuditLog();
}

function prepareNoticeForm(prefill) {
  const cat = document.getElementById('noticeCategory'), zone = document.getElementById('noticeZone');
  if (!cat.options.length) {
    cat.innerHTML = '<option value="">Any</option>' + Object.entries(CATALOG).filter(([k]) => k !== 'Other').map(([k, c]) => `<option value="${k}">${escapeHtml(c.label)}</option>`).join('');
  }
  fillDatalist('noticePlaceSuggestions', knownPlaces(''));
  if (prefill) {
    document.getElementById('noticeTitle').value = prefill.title || '';
    document.getElementById('noticeBody').value = prefill.body || '';
    cat.value = prefill.category || '';
    zone.value = prefill.zone || '';
    document.getElementById('noticeLevel').value = 'outage';
  }
  renderAdminNotices();
}

function renderAdminNotices() {
  const box = document.getElementById('adminNoticeList');
  if (!box) return;
  patchHtml(box, cachedNotices.length ? cachedNotices.map(n => {
    const st = noticeStyle(n.level);
    const left = n.expiresAt ? Math.max(0, n.expiresAt - Date.now()) : null;
    return `<div data-live-key="admin-notice-${escapeHtml(n.id)}" class="p-3 rounded-xl border ${st.cls}">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-extrabold">${escapeHtml(n.title)}</div>
          ${n.body ? `<p class="text-xs mt-0.5">${escapeHtml(n.body)}</p>` : ''}
          <p class="text-[10px] mt-1 opacity-70">${st.tag}${n.zone ? ' · ' + escapeHtml(n.zone) : ''}${left != null ? ` · ends in ${formatDuration(left)}` : ''}</p>
        </div>
        <button onclick="endNotice('${n.id}', this)" class="shrink-0 px-2.5 py-1.5 text-[11px] font-bold bg-white/70 hover:bg-white rounded-lg border border-current/20">End now</button>
      </div>
    </div>`;
  }).join('') : '<p data-live-key="notices-empty" class="text-xs text-slate-400 py-4 text-center">No active notices.</p>');
}

async function submitNotice(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await API.postNotice({
      title: document.getElementById('noticeTitle').value, body: document.getElementById('noticeBody').value,
      level: document.getElementById('noticeLevel').value, hours: Number(document.getElementById('noticeHours').value),
      category: document.getElementById('noticeCategory').value, zone: document.getElementById('noticeZone').value.trim(),
    });
    e.target.reset();
    showToast('Notice posted. Everyone on CampusCare can see it now.', 'success');
  } catch (err) { showToast('Could not post: ' + err.message, 'error'); }
  finally { btn.disabled = false; }
}

async function endNotice(id, btn) {
  btn.disabled = true;
  try { await API.endNotice(id); showToast('Notice ended.', 'success'); }
  catch (err) { showToast('Failed: ' + err.message, 'error'); btn.disabled = false; }
}

// From the Tickets page: a shared problem many people face → tell everyone
function postNoticeForTicket(ticketId) {
  const t = cachedTickets.find(x => x.id === ticketId);
  if (!t) return;
  switchAdminTab('Users');
  setManagePanel('notices');
  const zone = (t.location || '').split(' — ')[0];
  prepareNoticeForm({
    title: `${t.subCategory || ticketCategoryLabel(t)}${zone ? ' – ' + zone : ''}`,
    body: `We know about this (ticket ${t.id}) and it is being fixed. No need to report it again. Press "Me too" on the ticket to get updates.`,
    category: t.category, zone,
  });
  document.getElementById('noticeTitle').focus();
}

function fillSettingsForm() {
  document.getElementById('setMeToo').value = appSettings.meTooThreshold;
  document.getElementById('setLate').value = String(appSettings.lateHours);
  document.getElementById('setAutoAssign').checked = !!appSettings.autoAssign;
}

async function submitSettings(e) {
  e.preventDefault();
  try {
    appSettings = await API.saveSettings({
      meTooThreshold: Number(document.getElementById('setMeToo').value),
      lateHours: Number(document.getElementById('setLate').value),
      autoAssign: document.getElementById('setAutoAssign').checked,
    });
    showToast('Rules saved.', 'success');
    refreshAllViews();
  } catch (err) { showToast('Could not save: ' + err.message, 'error'); }
}

// ---------- admin: Activity log ----------
const AUDIT_ICON = {
  'ticket.created': 'file-plus', 'ticket.assigned': 'user-check', 'ticket.resolved': 'check-circle',
  'ticket.reopened': 'rotate-ccw', 'ticket.escalated': 'alert-triangle', 'technician.created': 'user-plus',
  'technician.removed': 'user-minus', 'password.reset': 'key', 'notice.posted': 'megaphone', 'settings.changed': 'sliders-horizontal',
};
function auditTime(e) {
  const ms = e.ts || (e.at && e.at.seconds ? e.at.seconds * 1000 : Date.now());
  const d = new Date(ms), now = new Date();
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? `Today ${t}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${t}`;
}
function renderAuditLog() {
  const box = document.getElementById('auditLogList');
  if (!box) return;
  if (!cachedAuditLog.length) { box.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">No activity recorded yet.</p>'; return; }
  box.innerHTML = cachedAuditLog.map(e => `
    <div class="flex items-start gap-3 py-2.5">
      <div class="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><i data-lucide="${AUDIT_ICON[e.action] || 'activity'}" class="w-3.5 h-3.5"></i></div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold text-slate-800">${escapeHtml(e.summary || e.action)}</p>
        <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(e.actorName || 'System')} · ${escapeHtml(e.actorEmail || '')} · ${auditTime(e)}</p>
      </div>
    </div>`).join('');
  if (window.lucide) lucide.createIcons();
}
