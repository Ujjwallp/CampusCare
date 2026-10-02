// ─── TOP NAV + MOBILE BOTTOM TABS ───
const NAV_CONFIG = {
  student: [
    { key: 'Mine', label: 'My Tickets', icon: 'clipboard-list', go: () => switchStudentTab('Mine') },
    { key: 'Community', label: 'Shared Issues', icon: 'users', go: () => switchStudentTab('Community') },
    { key: 'LostFound', label: 'Lost & Found', short: 'Lost', icon: 'search', go: () => switchStudentTab('LostFound') },
  ],
  staff: [
    { key: 'Pending', label: 'New', icon: 'inbox', go: () => switchStaffTab('Pending'), count: 'staffPending' },
    { key: 'In Progress', label: 'Working on', icon: 'wrench', go: () => switchStaffTab('In Progress'), count: 'staffActive' },
    { key: 'Resolved', label: 'Done', icon: 'check-circle-2', go: () => switchStaffTab('Resolved') },
  ],
  admin: [
    { key: 'Analytics', label: 'Dashboard', short: 'Home', icon: 'layout-dashboard', go: () => switchAdminTab('Analytics') },
    { key: 'Triage', label: 'Tickets', icon: 'ticket', go: () => switchAdminTab('Triage'), count: 'adminActive' },
    { key: 'Workload', label: 'Technicians', short: 'Techs', icon: 'hard-hat', go: () => switchAdminTab('Workload') },
    { key: 'Reports', label: 'Reports', icon: 'file-bar-chart', go: () => switchAdminTab('Reports') },
    { key: 'Users', label: 'Manage', short: 'Manage', icon: 'settings', go: () => switchAdminTab('Users') },
  ],
};
let activeNavKey = null;

function renderNav(role) {
  const items = NAV_CONFIG[role] || [];
  const top = document.getElementById('topNavLinks');
  const bottom = document.getElementById('bottomNavInner');
  top.innerHTML = items.map((it, i) =>
    `<button class="nav-link" data-nav="${it.key}" onclick="navGo(${i})"><i data-lucide="${it.icon}" class="w-4 h-4"></i>${it.label}${it.count ? `<span class="nav-count hidden" data-count="${it.count}"></span>` : ''}</button>`).join('');
  bottom.innerHTML = items.map((it, i) =>
    `<button class="bottom-tab" data-nav="${it.key}" onclick="navGo(${i})"><i data-lucide="${it.icon}"></i><span>${it.short || it.label}</span>${it.count ? `<span class="tab-badge hidden" data-count="${it.count}"></span>` : ''}</button>`).join('') +
    `<button class="bottom-tab" onclick="openMessagesDrawer()"><i data-lucide="message-square-text"></i><span>${items.length > 4 ? 'Chat' : 'Messages'}</span><span class="tab-badge hidden" id="bottomMsgBadge"></span></button>`;

  const isStudent = role === 'student';
  const newBtn = document.getElementById('navNewTicketBtn');
  newBtn.classList.toggle('hidden', !isStudent);
  newBtn.classList.toggle('md:inline-flex', isStudent);
  document.getElementById('mobileNewTicketFab').classList.toggle('hidden', !isStudent);
  document.getElementById('mobileNewTicketFab').classList.toggle('md:hidden', true);
  if (window.lucide) lucide.createIcons();
}

function navGo(i) {
  const it = (NAV_CONFIG[currentRole] || [])[i];
  if (it) { it.go(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

function setActiveNav(key) {
  activeNavKey = key;
  document.querySelectorAll('[data-nav]').forEach(el => {
    const on = el.getAttribute('data-nav') === key;
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
}

function setNavCount(name, n) {
  document.querySelectorAll(`[data-count="${name}"]`).forEach(el => {
    el.textContent = n > 99 ? '99+' : n;
    el.classList.toggle('hidden', !n);
  });
}

function updateNavCounts() {
  if (currentRole === 'staff' && typeof getStaffTickets === 'function') {
    const mine = getStaffTickets();
    setNavCount('staffPending', mine.filter(t => t.status === 'Pending').length);
    setNavCount('staffActive', mine.filter(t => t.status === 'In Progress').length);
  }
  if (currentRole === 'admin') {
    setNavCount('adminActive', cachedTickets.filter(isUnassigned).length);
  }
  updateMessagesBadge();
}

// ─── MESSAGES ───
// Two kinds of conversation live in the Messages panel:
//  • Ticket chats  – student ↔ technician on a ticket (admin can read & join)
//  • Admin threads – direct conversations with the Administrator
let msgSection = null;          // 'tickets' | 'admin' (users)  or 'student' | 'staff' | 'tickets' (admin)
let msgUnreadOnly = false;
let openThreadId = null;        // admin thread id
let openTicketChatId = null;    // ticket id
let lastUnreadTotal = null;

const isStudentThread = m => m.senderRole === 'student';
const myUid = () => (window.API && API.getCurrentUser() ? API.getCurrentUser().uid : 'anon');

// ---------- unread tracking for ticket chats (per user, per device) ----------
function seenKey(ticketId) { return `cc_seen_${myUid()}_${ticketId}`; }
function getSeen(ticketId) { try { const v = localStorage.getItem(seenKey(ticketId)); return v === null ? null : Number(v); } catch (e) { return null; } }
function setSeen(ticketId, n) { try { localStorage.setItem(seenKey(ticketId), String(n)); } catch (e) {} }
function markTicketSeen(t) { if (t) setSeen(t.id, (t.messages || []).length); }

function ticketUnread(t) {
  const msgs = t.messages || [];
  let seen = getSeen(t.id);
  if (seen === null) { setSeen(t.id, msgs.length); return 0; }   // first time we see this ticket: baseline
  const me = MY_SENDER();
  return msgs.slice(seen).filter(m => !m.isSystem && m.sender !== me).length;
}

function chatTickets() {
  let list;
  if (currentRole === 'student') list = getMyTickets();
  else if (currentRole === 'staff') { const tech = getCurrentTech(); list = (tech && typeof ticketIsForTech === 'function') ? cachedTickets.filter(t => ticketIsForTech(t, tech)) : []; }
  else list = cachedTickets.filter(t => (t.messages || []).some(m => !m.isSystem));
  return list;
}

function ticketPeople(t) {
  const tech = t.assignedTo ? cachedTechnicians.find(x => x.firebaseId === t.assignedTo) : null;
  return {
    studentName: t.userName || 'Reporter', studentEmail: t.userEmail || '', reporter: reporterLabel(t),
    techName: t.assignedToName || (tech && tech.name) || '', techEmail: t.assignedToEmail || (tech && tech.email) || '',
  };
}

function lastHumanMsg(t) { const h = (t.messages || []).filter(m => !m.isSystem); return h[h.length - 1] || null; }
function ticketActivity(t) {
  const last = (t.messages || [])[(t.messages || []).length - 1];
  return (last && last.at) || ticketCreatedMs(t) || 0;
}

// ---------- admin threads ----------
function threadUnread(m) { return currentRole === 'admin' ? !m.isRead : !!m.userUnread; }
function threadLastActivity(m) { return m.lastActivity || (m.createdAt && m.createdAt.seconds ? m.createdAt.seconds * 1000 : Date.now()); }

// ---------- badges & live notifications ----------
function unreadCounts() {
  const tickets = chatTickets().reduce((s, t) => s + ticketUnread(t), 0);
  const threads = cachedAdminMessages.filter(threadUnread);
  return {
    tickets,
    admin: threads.length,
    student: threads.filter(isStudentThread).length,
    staff: threads.filter(m => !isStudentThread(m)).length,
  };
}

function updateMessagesBadge() {
  if (!isLoggedIn) return;
  const c = unreadCounts();
  const n = c.tickets + c.admin;
  const txt = n > 99 ? '99+' : String(n);
  ['navMessagesBadge', 'bottomMsgBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    el.classList.toggle('hidden', n === 0);
  });
  if (lastUnreadTotal !== null && n > lastUnreadTotal) {
    const drawerOpen = !document.getElementById('messagesDrawer').classList.contains('hidden');
    // (notify.js shows who the message is from)
  }
  lastUnreadTotal = n;
}

// ---------- drawer ----------
function openMessagesDrawer(mode) {
  hideEl('clerkMenuDropdown');
  document.getElementById('messagesDrawer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const c = unreadCounts();
  if (!msgSection) msgSection = currentRole === 'admin' ? 'student' : 'tickets';
  // Jump to whichever section has something new
  if (currentRole === 'admin') {
    if (c.student) msgSection = 'student'; else if (c.staff) msgSection = 'staff'; else if (c.tickets) msgSection = 'tickets';
  } else {
    if (c.tickets && !c.admin) msgSection = 'tickets'; else if (c.admin && !c.tickets) msgSection = 'admin';
  }
  if (mode === 'compose') showCompose();
  else showThreadList();
}

function closeMessagesDrawer() {
  document.getElementById('messagesDrawer').classList.add('hidden');
  document.body.style.overflow = '';
  openThreadId = null; openTicketChatId = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('messagesDrawer').classList.contains('hidden')) closeMessagesDrawer();
});

function setDrawerHeader(title, sub, showBack, canCompose) {
  document.getElementById('msgDrawerTitle').textContent = title;
  document.getElementById('msgDrawerSub').textContent = sub || '';
  document.getElementById('msgBackBtn').classList.toggle('hidden', !showBack);
  const compose = document.getElementById('msgComposeBtn');
  compose.classList.toggle('hidden', !canCompose);
  compose.classList.toggle('inline-flex', !!canCompose);
}

function showView(id) {
  ['msgListView', 'msgThreadView', 'msgComposeView'].forEach(v => document.getElementById(v).classList.toggle('hidden', v !== id));
}

function showThreadList() {
  openThreadId = null; openTicketChatId = null;
  showView('msgListView');
  const canCompose = currentRole === 'admin' ? msgSection !== 'tickets' : msgSection === 'admin';
  document.getElementById('msgComposeLabel').textContent = currentRole === 'admin' ? 'Message' : 'New';
  setDrawerHeader('Messages', currentRole === 'admin' ? 'Students, staff and ticket chats' : (currentRole === 'student' ? 'Chat with your technician or the Administrator' : 'Chat with students or the Administrator'), false, canCompose);
  renderThreadList();
}

function setMsgSection(s) { msgSection = s; showThreadList(); }
function toggleMsgUnread() { msgUnreadOnly = !msgUnreadOnly; renderThreadList(); }

function sectionTabs() {
  const c = unreadCounts();
  const defs = currentRole === 'admin'
    ? [['student', 'users', 'Campus users', c.student, 'bg-blue-600'], ['staff', 'hard-hat', 'Staff', c.staff, 'bg-emerald-600'], ['tickets', 'messages-square', 'Ticket chats', c.tickets, 'bg-iiitg-800']]
    : [['tickets', 'messages-square', currentRole === 'student' ? 'Technician' : 'Students', c.tickets, 'bg-iiitg-800'], ['admin', 'shield', 'Admin', c.admin, 'bg-iiitg-800']];
  return `<div class="flex gap-1 p-1 bg-slate-100 rounded-2xl" role="tablist">` + defs.map(([key, icon, label, unread, color]) =>
    `<button role="tab" aria-selected="${msgSection === key}" onclick="setMsgSection('${key}')" class="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-[13px] font-bold transition-colors ${msgSection === key ? color + ' text-white shadow' : 'text-slate-600 hover:bg-white'}">
      <i data-lucide="${icon}" class="w-4 h-4 shrink-0"></i><span class="truncate">${label}</span>
      ${unread ? `<span class="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">${unread}</span>` : ''}
    </button>`).join('') + `</div>`;
}

const SECTION_HINT = {
  student: 'From students, faculty and non-teaching staff',
  staff: 'Requests from technicians',
  tickets: () => currentRole === 'admin' ? 'Live student ↔ technician chats on tickets' : (currentRole === 'student' ? 'Live chat with the technician on each of your tickets' : 'Live chat with students on your assigned tickets'),
  admin: 'Your conversations with the Administrator',
};

function renderThreadList() {
  const list = document.getElementById('msgThreadList');
  const filters = document.getElementById('msgFilters');
  if (!list) return;
  const hint = typeof SECTION_HINT[msgSection] === 'function' ? SECTION_HINT[msgSection]() : SECTION_HINT[msgSection];
  filters.classList.remove('hidden');
  filters.className = 'px-4 py-3 border-b border-slate-100 space-y-2.5 shrink-0';
  patchHtml(filters, sectionTabs() + `<label class="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 cursor-pointer select-none">
      <span class="truncate">${hint}</span>
      <span class="flex items-center gap-2 shrink-0">Unread only <input type="checkbox" class="w-4 h-4 accent-iiitg-800" ${msgUnreadOnly ? 'checked' : ''} onchange="toggleMsgUnread()"></span>
    </label>`);

  if (msgSection === 'tickets') renderTicketChatList(list);
  else renderAdminThreadList(list);
  if (window.lucide) lucide.createIcons();
}

function emptyState(title, sub, btn) {
  return `<div class="text-center px-8 py-16">
    <div class="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3"><i data-lucide="message-square" class="w-7 h-7 text-slate-300"></i></div>
    <p class="text-sm font-bold text-slate-800">${title}</p><p class="text-xs text-slate-500 mt-1">${sub}</p>${btn || ''}</div>`;
}

function renderTicketChatList(list) {
  let tickets = chatTickets().sort((a, b) => ticketActivity(b) - ticketActivity(a));
  if (msgUnreadOnly) tickets = tickets.filter(t => ticketUnread(t));
  if (!tickets.length) {
    patchHtml(list, msgUnreadOnly ? emptyState('No unread chats', 'You are all caught up.')
      : currentRole === 'student' ? emptyState('No tickets yet', 'Report an issue and you can chat with the technician here.', '<button onclick="closeMessagesDrawer(); openComplaintModal()" class="mt-4 px-4 py-2.5 text-sm font-bold text-white bg-iiitg-800 rounded-xl">Report an issue</button>')
      : currentRole === 'staff' ? emptyState('No assigned tickets', 'Chats appear here once a ticket is assigned to you.')
      : emptyState('No ticket chats yet', 'Conversations between students and technicians will appear here.'));
    return;
  }
  patchHtml(list, tickets.map(t => {
    const unread = ticketUnread(t);
    const last = lastHumanMsg(t);
    const p = ticketPeople(t);
    const other = currentRole === 'student' ? (p.techName || 'Awaiting technician')
      : currentRole === 'staff' ? p.studentName
      : `${p.studentName} ↔ ${p.techName || 'unassigned'}`;
    const emails = currentRole === 'student' ? p.techEmail
      : currentRole === 'staff' ? p.studentEmail
      : [p.studentEmail, p.techEmail].filter(Boolean).join('  ·  ');
    const preview = last ? `${last.senderName || last.sender}: ${last.fileUrl ? '📷 Photo' : last.text}` : 'No messages yet. Say hello 👋';
    return `<button data-live-key="ticket-chat-${escapeHtml(t.id)}" onclick="openTicketChat('${escapeHtml(t.id)}')" class="w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors flex gap-3 ${unread ? 'bg-blue-50/40' : ''}">
      <div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-iiitg-50 text-iiitg-700 border border-iiitg-100"><i data-lucide="ticket" class="w-4 h-4"></i></div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm truncate ${unread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-700'}">${escapeHtml(other)}</span>
          <span class="ml-auto text-[10px] text-slate-400 font-semibold shrink-0">${ticketActivity(t) ? escapeHtml(formatShortTime(ticketActivity(t))) : ''}</span>
        </div>
        ${emails ? `<div class="text-[10px] text-slate-500 truncate">${escapeHtml(emails)}</div>` : ''}
        <div class="text-[10px] font-mono font-bold text-iiitg-700 truncate">${escapeHtml(t.id)} · <span class="font-sans font-semibold text-slate-500">${escapeHtml(ticketCategoryLabel(t))}</span></div>
        <p class="text-xs truncate mt-0.5 ${unread ? 'text-slate-800 font-semibold' : 'text-slate-500'}">${escapeHtml(preview)}</p>
      </div>
      ${unread ? `<span class="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-1">${unread}</span>` : ''}
    </button>`;
  }).join(''));
}

function renderAdminThreadList(list) {
  let threads = [...cachedAdminMessages].sort((a, b) => threadLastActivity(b) - threadLastActivity(a));
  if (currentRole === 'admin') threads = threads.filter(m => msgSection === 'student' ? isStudentThread(m) : !isStudentThread(m));
  if (msgUnreadOnly) threads = threads.filter(threadUnread);
  if (!threads.length) {
    patchHtml(list, msgUnreadOnly ? emptyState('No unread messages', 'You are all caught up.')
      : currentRole === 'admin' ? emptyState(msgSection === 'student' ? 'No student messages' : 'No staff messages', 'Tap "Message" to start a conversation.')
      : emptyState('No messages with the Admin', 'Need to escalate something? Start a conversation.', '<button onclick="showCompose()" class="mt-4 px-4 py-2.5 text-sm font-bold text-white bg-iiitg-800 rounded-xl">Message the Admin</button>'));
    return;
  }
  patchHtml(list, threads.map(m => {
    const unread = threadUnread(m);
    const replies = Array.isArray(m.replies) ? m.replies : [];
    const last = replies.length ? replies[replies.length - 1] : null;
    const mineLabel = (fromAdmin) => fromAdmin ? (currentRole === 'admin' ? 'You' : 'Admin') : (currentRole === 'admin' ? (m.senderName || 'User') : 'You');
    const preview = last ? `${mineLabel(last.from === 'admin')}: ${last.text}` : m.text;
    const who = currentRole === 'admin' ? (m.senderName || m.senderEmail) : 'Administrator';
    return `<button data-live-key="admin-thread-${escapeHtml(m.firebaseId)}" onclick="openThread('${m.firebaseId}')" class="w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors flex gap-3 ${unread ? 'bg-blue-50/40' : ''}">
      <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm ${currentRole === 'admin' ? 'bg-slate-100 text-slate-600' : 'bg-iiitg-900 text-iiitg-gold'}">${currentRole === 'admin' ? escapeHtml((who || '?').charAt(0).toUpperCase()) : '<i data-lucide="shield" class="w-4 h-4"></i>'}</div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm truncate ${unread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-700'}">${escapeHtml(who)}</span>
          <span class="ml-auto text-[10px] text-slate-400 font-semibold shrink-0">${escapeHtml(formatShortTime(threadLastActivity(m)))}</span>
        </div>
        ${currentRole === 'admin' && m.senderEmail ? `<div class="text-[10px] text-slate-500 truncate">${escapeHtml(m.senderEmail)}</div>` : ''}
        ${m.relatedTicketId ? `<span class="text-[10px] font-mono font-bold text-iiitg-700">${escapeHtml(m.relatedTicketId)}</span>` : ''}
        <p class="text-xs truncate mt-0.5 ${unread ? 'text-slate-800 font-semibold' : 'text-slate-500'}">${escapeHtml(preview)}</p>
      </div>
      ${unread ? '<span class="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 mt-1.5"></span>' : ''}
    </button>`;
  }).join(''));
}

function formatShortTime(ms) {
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// ---------- ticket chat (student ↔ technician, admin can join) ----------
function openTicketChat(ticketId) {
  const t = cachedTickets.find(x => x.id === ticketId);
  if (!t) return;
  openTicketChatId = ticketId; openThreadId = null;
  showView('msgThreadView');
  setDrawerHeader(t.id, ticketCategoryLabel(t), true, false);
  document.getElementById('msgAttachBtn').classList.remove('hidden');
  document.getElementById('msgReplyInput').placeholder = currentRole === 'admin' ? 'Reply as Administrator...' : 'Type a message...';
  renderOpenChat();
  setTimeout(() => document.getElementById('msgReplyInput').focus(), 50);
}

function renderOpenChat() {
  const t = cachedTickets.find(x => x.id === openTicketChatId);
  const body = document.getElementById('msgThreadBody');
  if (!t || !body) return;
  const p = ticketPeople(t);
  const person = (icon, role, name, email, color) => `<div class="flex items-center gap-2.5 min-w-0">
      <span class="w-8 h-8 rounded-full ${color} flex items-center justify-center shrink-0"><i data-lucide="${icon}" class="w-4 h-4"></i></span>
      <div class="min-w-0"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${role}</div>
      <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(name)}</div>${email ? `<a href="mailto:${escapeHtml(email)}" class="block text-[11px] text-slate-500 truncate hover:underline">${escapeHtml(email)}</a>` : ''}</div></div>`;
  const people = `<div class="grid grid-cols-2 gap-3 p-3 mb-2 bg-white border border-slate-200 rounded-xl">
      ${person('user-round', 'Reported by · ' + p.reporter, p.studentName, p.studentEmail, 'bg-blue-50 text-blue-700')}
      ${p.techName ? person('hard-hat', 'Technician', p.techName, p.techEmail, 'bg-emerald-50 text-emerald-700') : person('hourglass', 'Technician', 'Not assigned yet', '', 'bg-amber-50 text-amber-700')}
    </div>`;
  body.innerHTML = people + `<button onclick="openTicketDetailModal('${escapeHtml(t.id)}')" class="w-full flex items-center gap-2 px-3 py-2.5 mb-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-iiitg-700 hover:bg-iiitg-50">
      <span class="px-2 py-0.5 text-[10px] rounded-full border ${getStatusConfig(t.status)}">${escapeHtml(statusLabel(t))}</span>
      <span class="truncate">${escapeHtml(t.location || '')}</span><span class="ml-auto shrink-0 flex items-center gap-1">Ticket details<i data-lucide="chevron-right" class="w-4 h-4"></i></span></button><div id="msgTicketMessages"></div>`;
  renderChatMessages(t.messages || [], 'msgTicketMessages');
  markTicketSeen(t);
  updateMessagesBadge();
  body.scrollTop = body.scrollHeight;
}

// ---------- admin threads ----------
function openThread(id) {
  const m = cachedAdminMessages.find(x => x.firebaseId === id);
  if (!m) return;
  openThreadId = id; openTicketChatId = null;
  showView('msgThreadView');
  const title = currentRole === 'admin' ? (m.senderName || m.senderEmail) : 'Administrator';
  const sub = currentRole === 'admin' ? `${m.senderEmail || ''} · ${isStudentThread(m) ? ({ faculty: 'Faculty', staff: 'Non-teaching staff' }[m.senderType] || 'Student') : 'Technician'}` : (m.relatedTicketId ? `About ${m.relatedTicketId}` : 'Direct message');
  setDrawerHeader(title, sub, true, false);
  document.getElementById('msgAttachBtn').classList.add('hidden');
  document.getElementById('msgReplyInput').placeholder = 'Write a reply...';
  renderThread();
  if (threadUnread(m)) {
    (currentRole === 'admin' ? API.markAdminMessageRead(id) : API.markThreadReadByUser(id)).catch(err => console.warn(err));
  }
  setTimeout(() => document.getElementById('msgReplyInput').focus(), 50);
}

function renderThread() {
  const m = cachedAdminMessages.find(x => x.firebaseId === openThreadId);
  const body = document.getElementById('msgThreadBody');
  if (!m || !body) return;
  const bubble = (fromAdmin, name, text, time) => {
    const mine = (currentRole === 'admin') === fromAdmin;
    return `<div class="flex flex-col ${mine ? 'items-end' : 'items-start'}">
      <span class="text-[10px] font-bold text-slate-400 mb-1 px-1">${escapeHtml(name)} · ${escapeHtml(time)}</span>
      <div class="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words shadow-sm ${mine ? 'bg-iiitg-800 text-white rounded-tr-md' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-md'}">${escapeHtml(text)}</div>
    </div>`;
  };
  const created = m.createdAt && m.createdAt.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now';
  const userName = currentRole === 'admin' ? (m.senderName || 'User') : 'You';
  const adminName = currentRole === 'admin' ? 'You' : 'Administrator';
  let html = '';
  if (m.relatedTicketId) {
    html += `<button onclick="openTicketDetailModal('${escapeHtml(m.relatedTicketId)}')" class="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-iiitg-700 hover:bg-iiitg-50"><i data-lucide="ticket" class="w-4 h-4"></i> Ticket ${escapeHtml(m.relatedTicketId)}<i data-lucide="chevron-right" class="w-4 h-4 ml-auto"></i></button>`;
  }
  if (m.text) html += bubble(false, userName, m.text, created);
  (m.replies || []).forEach(r => { html += bubble(r.from === 'admin', r.from === 'admin' ? adminName : userName, r.text, r.time || ''); });
  const wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 64;
  patchHtml(body, html);
  if (window.lucide) lucide.createIcons();
  if (wasAtBottom) body.scrollTop = body.scrollHeight;
}

// ---------- send ----------
async function sendThreadReply(e) {
  e.preventDefault();
  const input = document.getElementById('msgReplyInput');
  const text = input.value.trim();
  if (!text) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    if (openTicketChatId) await API.addTicketMessage(openTicketChatId, buildMessage({ text }));
    else if (openThreadId) await API.replyToAdminMessage(openThreadId, text, currentRole === 'admin');
    input.value = '';
  } catch (err) {
    console.error(err);
    showToast('Failed to send: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

async function sendThreadFile(e) {
  const file = e.target.files[0];
  if (!file || !openTicketChatId) return;
  const btn = document.getElementById('msgAttachBtn');
  btn.disabled = true;
  try {
    const url = await API.uploadFile(file, 'chat_attachments');
    await API.addTicketMessage(openTicketChatId, buildMessage({ text: file.name, fileUrl: url, fileName: file.name }));
  } catch (err) {
    showToast('Failed to attach: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    e.target.value = '';
  }
}

// ---------- compose ----------
function showCompose() {
  openThreadId = null; openTicketChatId = null;
  showView('msgComposeView');
  const isAdmin = currentRole === 'admin';
  setDrawerHeader('New message', isAdmin ? 'Start a conversation' : 'To: Administrator', true, false);
  document.getElementById('composeHelp').textContent = isAdmin
    ? 'Send a direct message to a technician or a student. They will see it in their Messages.'
    : 'Message the Administrator to escalate an unresolved issue, report a problem with service, or ask for help. To talk to your technician, use the ticket chat instead.';
  document.getElementById('composeSendLabel').textContent = isAdmin ? 'Send message' : 'Send to Admin';

  const recWrap = document.getElementById('composeRecipientContainer');
  const rec = document.getElementById('composeRecipient');
  const tWrap = document.getElementById('contactAdminTicketContainer');
  const tSel = document.getElementById('adminMessageTicketId');

  if (isAdmin) {
    recWrap.classList.remove('hidden');
    tWrap.classList.add('hidden'); tSel.innerHTML = '';
    const techs = cachedTechnicians.filter(t => t.uid).map(t => ({ uid: t.uid, name: t.name, email: t.email, role: 'staff', label: `${t.name} (${t.dept})` }));
    const seen = new Set();
    const students = cachedTickets.filter(t => t.userId && !seen.has(t.userId) && seen.add(t.userId))
      .map(t => ({ uid: t.userId, name: t.userName || t.userEmail, email: t.userEmail, role: 'student', label: `${t.userName || t.userEmail} (${t.userEmail})` }));
    window.__composeRecipients = [...techs, ...students];
    rec.innerHTML = '<option value="">Choose a recipient...</option>' +
      (techs.length ? `<optgroup label="Technicians">${techs.map((r, i) => `<option value="${i}">${escapeHtml(r.label)}</option>`).join('')}</optgroup>` : '') +
      (students.length ? `<optgroup label="Campus users">${students.map((r, i) => `<option value="${techs.length + i}">${escapeHtml(r.label)}</option>`).join('')}</optgroup>` : '');
    rec.value = msgSection === 'staff' && techs.length === 1 ? '0' : '';
  } else {
    recWrap.classList.add('hidden');
    if (currentRole === 'student') {
      tWrap.classList.remove('hidden');
      const mine = getMyTickets();
      tSel.innerHTML = mine.length
        ? '<option value="">Select the ticket this is about...</option>' + mine.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.id)} — ${escapeHtml(ticketCategoryLabel(t))}</option>`).join('')
        : '<option value="">You have no tickets yet</option>';
    } else {
      tWrap.classList.add('hidden'); tSel.innerHTML = '';
    }
  }
  setTimeout(() => document.getElementById('adminMessageInput').focus(), 50);
  if (window.lucide) lucide.createIcons();
}

// Admin shortcut from other screens (e.g. Manage Staff)
function messageTechnician(techId) {
  openMessagesDrawer('compose');
  const i = (window.__composeRecipients || []).findIndex(r => r.role === 'staff' && cachedTechnicians.find(t => t.firebaseId === techId && t.uid === r.uid));
  if (i >= 0) document.getElementById('composeRecipient').value = String(i);
}

// Called whenever ticket or message data changes
function refreshMessagesUI() {
  updateMessagesBadge();
  if (document.getElementById('messagesDrawer').classList.contains('hidden')) return;
  if (openTicketChatId) renderOpenChat();
  else if (openThreadId) renderThread();
  else if (!document.getElementById('msgListView').classList.contains('hidden')) renderThreadList();
}
