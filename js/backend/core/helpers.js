// ─── SHARED DATA HELPERS (used by several services) ───
import { db, collection, doc, getDoc, getDocs, updateDoc, query, where } from '../infra/firebase.js';

export const lc = (s) => (s || '').trim().toLowerCase();
// Phone numbers are matched on their last 10 digits, so +91 / 0 prefixes and
// spaces don't matter. Returns '' when there aren't 10 usable digits.
export const normalizePhone = (p) => { const d = (p == null ? '' : String(p)).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
export const nowTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
export const sysMsg = (text) => ({ sender: 'System', text, time: nowTime(), at: Date.now(), isSystem: true });
export const msOf = (v) => v && typeof v.seconds === 'number' ? v.seconds * 1000 : (typeof v === 'number' ? v : null);
export const DAY_MS = 86400000;

// Catalogue access (js/shared/catalog.js is loaded as a plain script)
export const catalog = {
  team: (cat) => window.CC_CATALOG ? window.CC_CATALOG.teamForCategory(cat) : null,
  isUrgent: (cat, issue) => !!(window.CC_CATALOG && window.CC_CATALOG.isUrgentIssue(cat, issue)),
  isConfidential: (cat, issue) => !!(window.CC_CATALOG && window.CC_CATALOG.isConfidentialIssue(cat, issue)),
  isAreaWide: (cat, issue) => !!(window.CC_CATALOG && window.CC_CATALOG.isAreaWideIssue(cat, issue)),
};

export async function findTechByEmail(email) {
  const snap = await getDocs(query(collection(db, 'technicians'), where('email', '==', lc(email))));
  if (!snap.empty) return { firebaseId: snap.docs[0].id, id: snap.docs[0].id, ...snap.docs[0].data() };
  // The scoped technicians rule lets a technician read only their OWN record
  // (by uid or by their own email), so the email query above is sufficient —
  // no full-collection scan (which the rules correctly deny).
  return null;
}

// Campus members (non-teaching staff who REPORT) are admin-provisioned accounts
// kept separate from technicians, keyed by their login uid.
export async function findMemberByEmail(email) {
  const snap = await getDocs(query(collection(db, 'campus_members'), where('email', '==', lc(email))));
  if (!snap.empty) return { firebaseId: snap.docs[0].id, uid: snap.docs[0].id, ...snap.docs[0].data() };
  return null;
}

// Maps a ticket's human id (IIITG-YYYY-NNNN) -> { firebaseId, collection }.
// Populated from the live ticket feeds + on create. This lets getTicketRef read
// a ticket by its DOC id with a single getDoc, which the security rules evaluate
// per-document (owner / assignee / public) and allow — whereas a
// where('id','==',...) QUERY is denied for non-admins (not provably scoped).
const _ticketIndex = new Map();
export function indexTicket(idField, firebaseId, coll) {
  if (idField && firebaseId) _ticketIndex.set(idField, { firebaseId, collection: coll || 'tickets' });
}
export async function getTicketRef(ticketId) {
  const hit = _ticketIndex.get(ticketId);
  if (hit) {
    try {
      const ref = doc(db, hit.collection, hit.firebaseId);
      const snap = await getDoc(ref);
      if (snap.exists()) return { ref, data: snap.data(), firebaseId: hit.firebaseId, collection: hit.collection };
    } catch (e) { /* fall through to the (admin-only) query below */ }
  }
  for (const coll of ['tickets', 'confidential_tickets']) {
    const snapshot = await getDocs(query(collection(db, coll), where('id', '==', ticketId)));
    if (!snapshot.empty) return { ref: doc(db, coll, snapshot.docs[0].id), data: snapshot.docs[0].data(), firebaseId: snapshot.docs[0].id, collection: coll };
  }
  throw new Error("Ticket not found");
}

export async function adjustTechTasks(techDocId, delta) {
  if (!techDocId) return;
  try {
    const ref = doc(db, 'technicians', techDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const current = Number(snap.data().activeTasks) || 0;
    await updateDoc(ref, { activeTasks: Math.max(0, current + delta) });
  } catch (e) { console.warn("Could not update technician task count", e); }
}
