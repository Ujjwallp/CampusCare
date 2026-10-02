// ─── AUDIT SERVICE ───
// An append-only record of who did what and when, for accountability.
// It subscribes to domain events on the bus and writes one entry per action to
// Firestore (audit_log). Nothing in the app calls it directly — it just listens
// — which keeps it decoupled (Service-Oriented Architecture).
// Firestore: audit_log/{id}
import { db, auth, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from '../infra/firebase.js';

const ADMIN = 'admin@iiitg.ac.in';

function actor() {
  const u = auth.currentUser;
  if (!u) return { actorEmail: 'system', actorName: 'System' };
  return { actorEmail: u.email, actorName: u.displayName || (u.email ? u.email.split('@')[0] : 'User') };
}

async function write(action, summary, extra = {}) {
  try {
    await addDoc(collection(db, 'audit_log'), {
      action, summary, ...actor(), ...extra,
      at: serverTimestamp(), ts: Date.now(),
    });
  } catch (e) { console.warn('[audit] could not record', action, e); }
}

// Map each event to a human-readable line. Keep it short and factual.
const RECORDERS = {
  'ticket.created':    (p) => write('ticket.created',   `Reported ticket ${p.ticketId}${p.confidential ? ' (confidential)' : ''}`, { ticketId: p.ticketId }),
  'ticket.assigned':   (p) => write('ticket.assigned',  `${p.auto ? 'Auto-assigned' : 'Assigned'} ${p.ticketId} to ${p.techName || 'a technician'}`, { ticketId: p.ticketId }),
  'ticket.resolved':   (p) => write('ticket.resolved',  `Marked ${p.ticketId} fixed`, { ticketId: p.ticketId }),
  'ticket.reopened':   (p) => write('ticket.reopened',  `Reopened ${p.ticketId}`, { ticketId: p.ticketId }),
  'ticket.escalated':  (p) => write('ticket.escalated', `Escalated ${p.ticketId}${p.reason ? ' (' + p.reason + ')' : ''}`, { ticketId: p.ticketId }),
  'technician.created':(p) => write('technician.created', `Added technician ${p.name}${p.dept ? ' (' + p.dept + ')' : ''}`),
  'technician.removed':(p) => write('technician.removed', `Removed technician ${p.name || p.techId}`),
  'password.reset':    (p) => write('password.reset',   `Sent password-reset link to ${p.name || p.email}`),
  'notice.posted':     (p) => write('notice.posted',    `Posted notice: ${p.title}`),
  'settings.changed':  ()  => write('settings.changed', 'Updated app rules / settings'),
};

export const AuditService = {
  start(bus) {
    Object.entries(RECORDERS).forEach(([event, fn]) => bus.on(event, fn));
  },
  subscribe(callback) {
    const q = query(collection(db, 'audit_log'), orderBy('ts', 'desc'), limit(200));
    return onSnapshot(q, (s) => callback(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => console.error('Audit listener error:', err));
  },
};
