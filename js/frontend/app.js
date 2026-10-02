// ─── INITIALIZATION ───

// Live Firestore feeds. Started only after sign-in, because the security
// rules reject reads from signed-out visitors.
let dataUnsubs = [];
let liveRetryTimer = null;
let liveRetryDelay = 1000;
let ticketFeedSync = { public: false, confidential: false, error: null };
function setTicketFeedSync(feed, snapshot) {
  ticketFeedSync[feed] = !snapshot.fromCache;
  if (ticketFeedSync.public && ticketFeedSync.confidential) {
    ticketFeedSync.error = null;
    liveRetryDelay = 1000;
  }
}
function ticketFeedError(feed, err) {
  ticketFeedSync[feed] = false;
  restartLiveTicketFeeds(err, feed);
}
// Tickets arrive from two feeds: the public/normal collection and the
// confidential one (admin sees all; a reporter sees only their own). We keep
// them apart and merge into cachedTickets so the rest of the app is unchanged.
let _publicTickets = [], _confidentialTickets = [];
let waitingAssignmentTimer = null;
function scheduleWaitingAssignment(tickets = cachedTickets) {
  if (currentRole !== 'staff' || waitingAssignmentTimer) return;
  const tech = typeof getCurrentTech === 'function' ? getCurrentTech() : null;
  if (!tech || tech.status !== 'On Duty') return;
  const hasMatchingWork = tickets.some(t => t.status === 'Pending' && !t.assignedTo && !t.confidential
    && typeof teamForCategory === 'function' && teamForCategory(t.category) === tech.dept);
  if (!hasMatchingWork) return;
  // The technician who is best by workload claims the ticket. Other on-duty
  // technicians may run this check too, but the Firestore rule only accepts a
  // self-claim and the assignment service skips clients that aren't the pick.
  waitingAssignmentTimer = setTimeout(() => {
    waitingAssignmentTimer = null;
    API.autoAssignWaitingAsTechnician(tech.dept, tech.firebaseId)
      .catch(err => console.warn('Waiting-ticket auto-assignment failed:', err));
  }, 150);
}
function mergeTickets() {
  cachedTickets = _publicTickets.concat(_confidentialTickets);
  refreshAllViews();
  scheduleWaitingAssignment(cachedTickets);
}

// Firestore automatically reconnects after temporary network loss. A listener
// can still be closed for a terminal error (expired auth, a rules change, or a
// browser that resumed after a long sleep). Start a fresh feed in that case so
// dashboards never remain frozen on their last completed-work count.
function restartLiveTicketFeeds(err, feed = null) {
  if (!isLoggedIn || liveRetryTimer) return;
  const code = String(err && err.code || '');
  const feedName = feed === 'confidential' ? 'Confidential ticket updates' : 'Public ticket updates';
  ticketFeedSync.error = code === 'permission-denied'
    ? `${feedName} are blocked by Firestore permissions`
    : `${feedName} disconnected; reconnecting`;
  if (code === 'permission-denied') {
    console.warn('Live ticket feed stopped by Firestore rules. Refresh after the account or rules are corrected.');
    return;
  }
  const delay = liveRetryDelay;
  liveRetryDelay = Math.min(liveRetryDelay * 2, 30000);
  liveRetryTimer = setTimeout(() => {
    liveRetryTimer = null;
    dataUnsubs.forEach(u => { try { if (typeof u === 'function') u(); } catch (e) {} });
    dataUnsubs = [];
    _publicTickets = []; _confidentialTickets = [];
    startDataSubscriptions();
  }, delay);
}
function startDataSubscriptions() {
  if (dataUnsubs.length || !window.API) return;
  ticketFeedSync = { public: false, confidential: false, error: null };
  const meUser = API.getCurrentUser();
  // Scope what tickets this account can read: admin = all; everyone else = their
  // own + public + anything assigned to them (by email). Enforced by the rules.
  const ticketScope = { role: currentRole, uid: meUser && meUser.uid, email: (meUser && meUser.email ? meUser.email.toLowerCase() : null) };
  dataUnsubs.push(API.subscribeToTickets(ticketScope, (liveTickets) => { _publicTickets = liveTickets; mergeTickets(); }, (err) => ticketFeedError('public', err), (sync) => setTicketFeedSync('public', sync)));
  dataUnsubs.push(API.subscribeToConfidentialTickets(meUser && meUser.uid, currentRole === 'admin', (list) => { _confidentialTickets = list; mergeTickets(); }, (err) => ticketFeedError('confidential', err), (sync) => setTicketFeedSync('confidential', sync)));
  dataUnsubs.push(API.subscribeToTechnicians(ticketScope, (liveTechs) => { cachedTechnicians = liveTechs; refreshAllViews(); scheduleWaitingAssignment(); }));
  dataUnsubs.push(API.subscribeToNotices((list) => { cachedNotices = list; renderNoticeBanner(); renderAdminNotices(); }));
  dataUnsubs.push(API.subscribeToSettings((s) => { appSettings = s; refreshAllViews(); }));
  if (currentRole === 'admin') {
    dataUnsubs.push(API.subscribeToAdminMessages((msgs) => { cachedAdminMessages = msgs; refreshMessagesUI(); detectThreadChanges(); }));
    dataUnsubs.push(API.subscribeToProfileRequests((reqs) => {
      cachedProfileRequests = reqs;
      if (adminCurrentTab === 'Users') renderAdminApprovals();
    }));
    dataUnsubs.push(API.subscribeToCampusMembers((list) => {
      cachedCampusMembers = list;
      if (adminCurrentTab === 'Users' && typeof renderCampusMembers === 'function') renderCampusMembers();
    }));
    dataUnsubs.push(API.subscribeToAuditLog((entries) => {
      cachedAuditLog = entries;
      if (typeof renderAuditLog === 'function') renderAuditLog();
    }));
  } else {
    const me = API.getCurrentUser();
    if (me) dataUnsubs.push(API.subscribeToMyMessages(me.uid, (msgs) => { cachedAdminMessages = msgs; refreshMessagesUI(); detectThreadChanges(); }));
  }
}
function stopDataSubscriptions() {
  if (waitingAssignmentTimer) { clearTimeout(waitingAssignmentTimer); waitingAssignmentTimer = null; }
  if (liveRetryTimer) { clearTimeout(liveRetryTimer); liveRetryTimer = null; }
  liveRetryDelay = 1000;
  ticketFeedSync = { public: false, confidential: false, error: null };
  dataUnsubs.forEach(u => { try { if (typeof u === 'function') u(); } catch (e) {} });
  dataUnsubs = [];
  _publicTickets = []; _confidentialTickets = [];
  cachedTickets = []; cachedTechnicians = []; cachedAdminMessages = []; cachedProfileRequests = []; cachedNotices = []; cachedAuditLog = []; cachedCampusMembers = [];
  renderNoticeBanner();
  prevTicketState = null; prevThreadUnread = null; prevLostFound = null;
}

window.addEventListener('online', () => {
  if (isLoggedIn && ticketFeedSync.error) restartLiveTicketFeeds({ code: 'network-restored' });
});

// Re-render whichever dashboard is visible after any data change.
// Firestore often fires several snapshots at once (tickets, techs, notices…);
// we coalesce them into ONE render on the next animation frame instead of
// re-rendering the whole UI several times in a row.
let _refreshScheduled = false;
function refreshAllViews() {
  if (_refreshScheduled) return;
  _refreshScheduled = true;
  requestAnimationFrame(() => { _refreshScheduled = false; applyAllViews(); });
}
function applyAllViews() {
  if (!isLoggedIn) return;
  if (currentRole === 'student') {
    filterStudentTickets();
  } else if (currentRole === 'staff') {
    syncStaffProfile();
    renderStaffTickets();
    updateStaffStats();
  } else if (currentRole === 'admin') {
    renderAdminStats();
    if (adminCurrentTab === 'Analytics') initAdminCharts();
    if (adminCurrentTab === 'Triage') renderAdminTriage();
    if (adminCurrentTab === 'Workload') renderAdminWorkload();
    if (adminCurrentTab === 'Users') renderAdminUsers();
    if (adminCurrentTab === 'Reports') renderReports();
  }
  updateNavCounts();
  if (typeof refreshMessagesUI === 'function') refreshMessagesUI();
  if (typeof detectTicketChanges === 'function') detectTicketChanges();
  // Keep an open ticket chat in sync
  if (activeTicketId && !document.getElementById('ticketDetailModal').classList.contains('hidden')) {
    const t = cachedTickets.find(x => x.id === activeTicketId);
    if (t) {
      renderChatMessages(t.messages || []);
      if (typeof renderTicketProgress === 'function') renderTicketProgress(t);
      if (typeof markTicketSeen === 'function') { markTicketSeen(t); updateMessagesBadge(); }
      const st = document.getElementById('detailTicketStatus');
      st.textContent = statusLabel(t);
      st.className = `px-2.5 py-0.5 text-xs font-bold rounded-full border ${getStatusConfig(t.status || 'Pending')}`;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  setRole("student");

  requestAnimationFrame(() => {
    document.querySelector('.hero-content-left')?.classList.add('animate-fade-in-up');
    document.querySelector('.hero-content-right')?.classList.add('animate-fade-in-up', 'animate-delay-200');
  });

  try {
    await waitForAPI();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
    return;
  }

  restoreSession();
});
