// ─── NOTIFICATIONS + INSTALL AS APP ───
// Shows a phone/desktop notification for things that matter to each person:
//   reporter / issue follower → assignment, work started, ticket fixed or reopened
//   reporter → appointment proposal; reporter and assigned technician → response
//   technician → new ticket given to you, ticket reopened, new message
//   admin → new ticket (urgent highlighted), new message
// Chat messages are limited to the reporter and assigned staff so issue followers
// receive status and resolution changes without unrelated conversation alerts.
// Notifications appear while CampusCare is open or installed and running in the background.
let swReg = null, deferredInstall = null, prevTicketState = null;
let didReloadForSwUpdate = false;

const CC_IS_LOCALHOST = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

if ('serviceWorker' in navigator && CC_IS_LOCALHOST) {
  // Local development: do NOT run a service worker, so HTML/CSS/JS changes
  // always load straight from the dev server (no stale cached assets). Also
  // tear down any worker + caches left behind by a previous run.
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
  if (window.caches && caches.keys) caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
} else if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(r => {
    swReg = r;
    // Long-lived tabs otherwise keep running old UI code after a deployment.
    // Check periodically and reload once when the new worker takes control.
    r.update().catch(() => {});
    setInterval(() => r.update().catch(() => {}), 5 * 60 * 1000);
  }).catch(err => console.warn('Service worker not registered', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (didReloadForSwUpdate) return;
    didReloadForSwUpdate = true;
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open' && e.data.data && e.data.data.ticketId) openTicketChatFromNotification(e.data.data.ticketId);
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  document.getElementById('menuInstallApp')?.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => { deferredInstall = null; document.getElementById('menuInstallApp')?.classList.add('hidden'); showToast('CampusCare installed!', 'success'); });

async function installApp() {
  hideEl('clerkMenuDropdown');
  if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; return; }
  showToast(/iphone|ipad/i.test(navigator.userAgent) ? 'On iPhone: tap Share, then "Add to Home Screen".' : 'Use your browser menu → "Install app" / "Add to Home screen".', 'info');
}

function notificationsOn() { return 'Notification' in window && Notification.permission === 'granted'; }

function updateNotifyMenu() {
  const item = document.getElementById('menuNotifications');
  if (!item) return;
  const label = item.querySelector('span');
  if (!('Notification' in window)) { item.classList.add('hidden'); return; }
  item.classList.remove('hidden');
  label.textContent = Notification.permission === 'granted' ? 'Notifications are on' : Notification.permission === 'denied' ? 'Notifications blocked (browser settings)' : 'Turn on notifications';
}

async function enableNotifications() {
  hideEl('clerkMenuDropdown');
  if (!('Notification' in window)) return showToast('This browser does not support notifications.', 'warning');
  if (Notification.permission === 'denied') return showToast('Notifications are blocked. Allow them in your browser\'s site settings.', 'warning');
  const p = await Notification.requestPermission();
  updateNotifyMenu();
  if (p === 'granted') { showToast('Notifications turned on.', 'success'); notify('CampusCare', 'You will be notified about your tickets and messages.', 'welcome'); }
}

function notify(title, body, tag, ticketId) {
  // Always show something in the app; add a system notification when the app isn't in front
  if (!document.hidden) { showToast(`${title}: ${body}`, 'info'); }
  if (!notificationsOn() || !document.hidden) return;
  const opts = { body, tag, icon: 'assets/img/icon-192.png', badge: 'assets/img/icon-192.png', data: { ticketId, url: './index.html' }, renotify: true };
  try {
    if (swReg) swReg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (e) { console.warn(e); }
}

function openTicketChatFromNotification(ticketId) {
  if (!isLoggedIn) return;
  openMessagesDrawer(); setMsgSection('tickets'); openTicketChat(ticketId);
}

// Compare the new ticket list with the previous one and notify about changes
function detectTicketChanges() {
  if (!isLoggedIn) { prevTicketState = null; return; }
  const me = window.API ? API.getCurrentUser() : null;
  const tech = currentRole === 'staff' ? getCurrentTech() : null;
  const relevant = currentRole === 'student' ? [...getMyTickets(), ...getFollowedTickets()]
    : currentRole === 'staff' ? (tech ? cachedTickets.filter(t => t.assignedTo === tech.firebaseId) : [])
    : cachedTickets;
  const state = new Map(relevant.map(t => {
    const appointment = t.appointment || null;
    return [t.id, {
      status: t.status, assignedTo: t.assignedTo, n: (t.messages || []).length,
      reopen: t.reopenCount || 0,
      appointmentKey: appointment ? `${appointment.id}:${appointment.status}:${appointment.updatedAt || ''}` : '',
      appointment, t,
    }];
  }));
  if (prevTicketState === null) { prevTicketState = state; return; }   // first load: just remember

  state.forEach((cur, id) => {
    const prev = prevTicketState.get(id);
    const t = cur.t;
    if (!prev) {
      if (currentRole === 'staff') notify('New ticket for you', `${ticketCategoryLabel(t)} at ${t.location || 'campus'}${t.priority === 'High' ? ' (URGENT)' : ''}`, 'tk-' + id, id);
      if (currentRole === 'admin' && !(me && t.userId === me.uid)) notify(t.priority === 'High' ? 'New URGENT ticket' : 'New ticket', `${ticketCategoryLabel(t)} at ${t.location || 'campus'}`, 'tk-' + id, id);
      return;
    }
    if (currentRole === 'student') {
      if (cur.reopen > prev.reopen) notify('Issue reopened', `${t.id} needs attention again. Open it to see the latest update.`, 'reopen-' + id, id);
      else if (!prev.assignedTo && cur.assignedTo) notify('Technician assigned', `${t.assignedToName || 'A technician'} is handling ${t.id}.`, 'assign-' + id, id);
      else if (prev.status !== cur.status && cur.status === 'In Progress') notify('Work started', `Work has started on ${t.id}.`, 'start-' + id, id);
      else if (prev.status !== cur.status && cur.status === 'Resolved') notify('Issue marked fixed', `${t.id} is marked fixed. Open it to confirm or request more work.`, 'fixed-' + id, id);
      else if (cur.t.priority === 'High' && prev.t && prev.t.priority !== 'High' && (cur.t.upvotes || 0) > 1) notify('Issue marked urgent', `${id}: ${cur.t.upvotes} people are affected.`, 'urg-' + id, id);
    }
    if (cur.appointmentKey !== prev.appointmentKey && cur.appointment) {
      const appointment = cur.appointment;
      if (currentRole === 'student' && t.userId === (me && me.uid)
        && appointment.status === 'proposed' && appointment.updatedByUid !== (me && me.uid)) {
        notify('Visit time proposed', `A technician suggested a repair visit for ${t.id}. Open the ticket to confirm or decline.`, `visit-${id}`, id);
      } else if (currentRole === 'staff' && appointment.status !== 'proposed'
        && appointment.updatedByUid !== (me && me.uid)) {
        notify(appointment.status === 'confirmed' ? 'Visit confirmed' : 'Visit time declined', `The reporter responded to the visit proposal for ${t.id}.`, `visit-${id}`, id);
      }
    }
    if (currentRole === 'staff' && cur.reopen > prev.reopen) notify('Ticket reopened', `${id}: the student says it is not fixed yet.`, 'ro-' + id, id);
    // new chat messages from someone else
    if (cur.n > prev.n) {
      const fresh = (t.messages || []).slice(prev.n).filter(m => !m.isSystem && m.sender !== MY_SENDER());
      const isReporter = currentRole === 'student' && me && t.userId === me.uid;
      if (fresh.length && (currentRole === 'staff' || isReporter)) {
        const last = fresh[fresh.length - 1];
        notify(`Message from ${last.senderName || last.sender}`, last.fileUrl ? '📷 Photo' : String(last.text || '').slice(0, 120), 'msg-' + id, id);
      }
    }
  });
  if (currentRole === 'student') detectLostFound(me);
  prevTicketState = state;
}

// New Lost & Found items are announced to everyone on campus, not just the
// people following a ticket, so lost things get back to their owner quickly.
let prevLostFound = null;
function detectLostFound(me) {
  const items = cachedTickets.filter(t => t.isPublic && isLostFound(t) && t.status !== 'Resolved');
  const ids = new Set(items.map(t => t.id));
  if (prevLostFound === null) { prevLostFound = ids; return; }
  items.forEach(t => {
    if (prevLostFound.has(t.id) || (me && t.userId === me.uid)) return;
    notify('Lost & Found', `${String(t.description || 'An item').slice(0, 80)} · ${t.location || 'campus'}`, 'lf-' + t.id, t.id);
  });
  prevLostFound = ids;
}

// Admin direct messages
let prevThreadUnread = null;
function detectThreadChanges() {
  if (!isLoggedIn) { prevThreadUnread = null; return; }
  const unread = new Set(cachedAdminMessages.filter(threadUnread).map(m => m.firebaseId));
  if (prevThreadUnread !== null) {
    unread.forEach(id => {
      if (prevThreadUnread.has(id)) return;
      const m = cachedAdminMessages.find(x => x.firebaseId === id);
      const last = (m.replies || []).slice(-1)[0];
      notify(currentRole === 'admin' ? `Message from ${m.senderName || 'user'}` : 'Message from the Administrator', String(last ? last.text : m.text).slice(0, 120), 'dm-' + id);
    });
  }
  prevThreadUnread = unread;
}

document.addEventListener('DOMContentLoaded', updateNotifyMenu);
