// ─── TICKET SERVICE ───
// Lifecycle of a ticket: report → (assign) → start → fix → rate / reopen,
// plus "Me too" (join an existing shared issue) and duplicate search.
// Publishes: ticket.created, ticket.needsAssignment, ticket.resolved, ticket.reopened, ticket.escalated
import { db, auth, collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, deleteField } from '../infra/firebase.js';
import { nowTime, sysMsg, catalog, getTicketRef, adjustTechTasks, indexTicket } from '../core/helpers.js';
import { ADMIN_EMAILS } from '../core/config.js';
import { SettingsService } from './settingsService.js';
import { UserService, USER_TYPES } from './userService.js';
import { bus } from '../core/eventBus.js';

// Distance in metres between two lat/lng points
function metres(a, b) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Places are typed by people, so "Hostel 3", "hostel-3" and "HOSTEL 3 " must match.
const zoneOf = (loc) => String(loc || '').split(' — ')[0].toLowerCase()
  .replace(/\b(hostel|block|building|bldg|room|no\.?|number)\b/g, ' ').replace(/[^a-z0-9]+/g, '');

export const TicketService = {
  // Scoped reads: the Admin reads every ticket, but a campus user reads ONLY
  // their own + the public ones, and a technician reads ONLY what's assigned to
  // them. This keeps one user from reading another's private ticket even from the
  // browser console (enforced together with the matching read rule).
  //   scope = { role, uid, email }
  subscribe(scope, callback, onError = null, onSync = null) {
    const opts = { includeMetadataChanges: true };
    const err = (e) => { console.error("Tickets listener error (check Firestore rules):", e); if (typeof onError === 'function') onError(e); };
    const sort = (arr) => arr.sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity));
    let syncSent = false;
    const sync = (snap) => { if (typeof onSync === 'function' && !syncSent) { syncSent = true; onSync({ fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites }); } };

    if (scope && scope.role === 'admin') {
      return onSnapshot(collection(db, 'tickets'), opts, (snapshot) => {
        sync(snapshot);
        callback(sort(snapshot.docs.map(d => { indexTicket(d.data().id, d.id, 'tickets'); return { firebaseId: d.id, ...d.data() }; })));
      }, err);
    }

    // Non-admin: merge a few scoped queries by id.
    const col = collection(db, 'tickets');
    const queries = [query(col, where('isPublic', '==', true))];
    if (scope && scope.uid) queries.push(query(col, where('userId', '==', scope.uid)));
    if (scope && scope.email) queries.push(query(col, where('assignedToEmail', '==', scope.email)));
    const parts = queries.map(() => []);
    const emit = () => {
      const byId = new Map();
      parts.forEach(arr => arr.forEach(t => byId.set(t.firebaseId, t)));
      callback(sort([...byId.values()]));
    };
    const unsubs = queries.map((q, i) => onSnapshot(q, opts, (snapshot) => {
      sync(snapshot);
      parts[i] = snapshot.docs.map(d => { indexTicket(d.data().id, d.id, 'tickets'); return { firebaseId: d.id, ...d.data() }; });
      emit();
    }, err));
    return () => unsubs.forEach(u => { try { u(); } catch (e) {} });
  },

  // Confidential grievances live in their own collection so the database
  // itself keeps them to the Administrator and the reporter — never visible
  // to other students even from the browser console.
  subscribeConfidential(uid, isAdmin, callback, onError = null, onSync = null) {
    const src = isAdmin
      ? collection(db, 'confidential_tickets')
      : query(collection(db, 'confidential_tickets'), where('userId', '==', uid || '__none__'));
    return onSnapshot(src, { includeMetadataChanges: true }, (snapshot) => {
      if (typeof onSync === 'function') onSync({ fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites });
      const tickets = snapshot.docs.map(d => { indexTicket(d.data().id, d.id, 'confidential_tickets'); return { firebaseId: d.id, ...d.data() }; });
      tickets.sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity));
      callback(tickets);
    }, (err) => {
      console.error("Confidential tickets listener error:", err);
      if (typeof onError === 'function') onError(err);
    });
  },

  /**
   * Open shared issues that look like the one being reported, so people can
   * press "Me too" instead of filing a duplicate. Same type + same problem,
   * and same building OR within 150 m on the map.
   */
  async findSimilar({ category, subCategory, location, lat, lng, placeType }) {
    if (!category || !subCategory) return [];
    const snap = await getDocs(query(collection(db, 'tickets'), where('category', '==', category)));
    const me = auth.currentUser;
    const zone = zoneOf(location);
    return snap.docs.map(d => ({ firebaseId: d.id, ...d.data() }))
      .filter(t => t.status !== 'Resolved' && !t.confidential && t.isPublic && t.subCategory === subCategory)
      .map(t => {
        const dist = (typeof lat === 'number' && typeof t.lat === 'number') ? metres({ lat, lng }, { lat: t.lat, lng: t.lng }) : null;
        const sameZone = zone && zoneOf(t.location) === zone && (!placeType || !t.placeType || t.placeType === placeType);
        return { ...t, distance: dist, sameZone, mine: me && (t.userId === me.uid || (t.upvotedBy || []).includes(me.uid)) };
      })
      .filter(t => t.sameZone || (t.distance != null && t.distance <= 150) || !zone)
      .sort((a, b) => (b.sameZone - a.sameZone) || ((a.distance ?? 1e9) - (b.distance ?? 1e9)) || ((b.upvotes || 0) - (a.upvotes || 0)))
      .slice(0, 5);
  },

  async create(payload) {
    const user = auth.currentUser;
    const profile = await UserService.getMyProfile().catch(() => null);
    const autoUrgent = catalog.isUrgent(payload.category, payload.subCategory);
    const confidential = catalog.isConfidential(payload.category, payload.subCategory);
    // Always set these fields explicitly — the security rules read them, and a
    // MISSING field makes a rule error out and deny the write.
    payload.confidential = !!confidential;
    if (typeof payload.isPublic !== 'boolean') payload.isPublic = false;
    if (confidential) { payload.isPublic = false; payload.upvotes = 0; }
    // Lost & found goes on a public board so anyone can help return the item.
    if (/lost\s*&?\s*found/i.test(payload.subCategory || '')) payload.isPublic = true;
    if (payload.urgent || autoUrgent || confidential) payload.priority = 'High';
    const urgentWhy = payload.urgent ? 'reporter marked it urgent' : (autoUrgent ? `"${payload.subCategory}" is a safety/major issue` : null);
    delete payload.urgent;

    const nowStr = new Date().toLocaleString('en-GB');
    const messages = [{ sender: 'System', text: 'Ticket created.', time: nowStr, at: Date.now(), isSystem: true }];
    if (urgentWhy) messages.push(sysMsg(`Marked URGENT: ${urgentWhy}.`));
    if (confidential) messages.push(sysMsg('This is a confidential report. Only the Administrator can see it and will handle it personally.'));

    const reporter = {
      userEmail: user ? user.email : 'Unknown',
      userName: (profile && profile.name) || (user ? (user.displayName || user.email.split('@')[0]) : 'Unknown'),
      userId: user ? user.uid : null,
      reporterType: profile ? profile.userType : 'student',
      reporterDept: profile ? (profile.department || '') : '',
    };
    const newTicket = {
      ...payload, ...reporter,
      id: `IIITG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: nowStr,
      status: 'Pending',
      assignedTo: null, assignedToName: null, assignedToEmail: null, assignedAt: null, assignedBy: null, assignReason: null,
      // The reporter counts as 1 affected on a public ticket. Having a numeric
      // upvotes from the start lets the security rules enforce "me too" adds
      // exactly +1 (no inflation).
      upvotes: payload.isPublic ? 1 : 0,
      upvotedBy: payload.isPublic && user ? [user.uid] : [],
      followers: [],
      followerIds: [],
      availabilityWindows: Array.isArray(payload.availabilityWindows) ? payload.availabilityWindows.slice(0, 2) : [],
      appointment: null,
      appointmentHistory: [],
      messages,
      createdAt: serverTimestamp(),
    };
    const collName = confidential ? 'confidential_tickets' : 'tickets';
    const docRef = await addDoc(collection(db, collName), newTicket);
    indexTicket(newTicket.id, docRef.id, collName);
    // Assignment Service picks a technician (decoupled via the event bus)
    const results = await bus.emit('ticket.created', { ticketId: newTicket.id, confidential, category: payload.category });
    const assignedName = results.find(r => typeof r === 'string') || null;
    return { firebaseId: docRef.id, ...newTicket, assignedToName: assignedName || null, createdAt: { seconds: Math.floor(Date.now() / 1000) } };
  },

  /**
   * "Me too": someone else has the same problem. They join the existing
   * ticket (and follow its updates) instead of reporting a duplicate.
   * When enough people join, the ticket becomes urgent automatically.
   */
  async join(ticketId) {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");
    const { ref, data } = await getTicketRef(ticketId);
    if (data.userId === user.uid) throw new Error("This is your own report.");
    if ((data.upvotedBy || []).includes(user.uid)) throw new Error("You have already joined this issue.");
    if (data.status === 'Resolved') throw new Error("This issue is already fixed.");
    const profile = await UserService.getMyProfile().catch(() => null);
    const type = profile ? (USER_TYPES[profile.userType] || 'Campus user') : 'Campus user';
    const name = (profile && profile.name) || user.displayName || user.email.split('@')[0];
    // Strict: a "me too" may ONLY add this user and bump the count by exactly 1.
    // No chat messages or other fields (the security rules enforce this too, so a
    // crafted browser request can't forge messages or inflate the count).
    const count = (typeof data.upvotes === 'number' ? data.upvotes : (data.isPublic ? 1 : 0)) + 1;
    const updates = {
      upvotes: count,
      upvotedBy: arrayUnion(user.uid),
      followers: arrayUnion({ uid: user.uid, name, email: user.email, type: profile ? profile.userType : 'student', at: Date.now() }),
    };
    const threshold = SettingsService.get().meTooThreshold;
    let escalated = false;
    // Auto-escalate to urgent once enough people are affected. The rules permit
    // the priority change only alongside a valid +1 me-too at the 5-person mark.
    if (count >= threshold && count >= 5 && (data.priority || 'Normal') !== 'High') {
      updates.priority = 'High';
      escalated = true;
    }
    await updateDoc(ref, updates);
    if (escalated) await bus.emit('ticket.escalated', { ticketId, reason: 'metoo' });
    return { count, escalated, threshold };
  },

  async follow(ticketId) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in.');
    const { ref, data } = await getTicketRef(ticketId);
    if (!data.isPublic || data.confidential || data.status === 'Resolved') throw new Error('Only open shared issues can be followed.');
    if (data.userId === user.uid) throw new Error('You already receive updates for your own report.');
    if ((data.upvotedBy || []).includes(user.uid)) throw new Error('You already follow this issue with Me too.');
    await updateDoc(ref, { followerIds: arrayUnion(user.uid) });
    return true;
  },

  async unfollow(ticketId) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in.');
    const { ref, data } = await getTicketRef(ticketId);
    if (!(data.followerIds || []).includes(user.uid)) return false;
    await updateDoc(ref, { followerIds: arrayRemove(user.uid) });
    return true;
  },

  async proposeAppointment(ticketId, { startAt, endAt }) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in.');
    const start = Number(startAt), end = Number(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start) throw new Error('Choose a future visit window with an end time after its start.');
    const { ref, data } = await getTicketRef(ticketId);
    if (data.confidential) throw new Error('Visit scheduling is unavailable for confidential reports.');
    if (data.status === 'Resolved') throw new Error('Reopen the ticket before scheduling another visit.');
    const isAdmin = ADMIN_EMAILS.map(x => x.toLowerCase()).includes((user.email || '').toLowerCase());
    if (!isAdmin) {
      if (!data.assignedTo) throw new Error('This ticket has not been assigned yet.');
      const tech = await getDoc(doc(db, 'technicians', data.assignedTo));
      if (!tech.exists() || tech.data().uid !== user.uid) throw new Error('Only the assigned technician can propose a visit.');
    }
    const at = Date.now();
    const appointment = {
      id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
      startAt: start, endAt: end, status: 'proposed', proposedByUid: user.uid,
      proposedByName: user.displayName || user.email, updatedAt: at, updatedByUid: user.uid,
    };
    const events = [];
    if (data.appointment && ['proposed', 'confirmed'].includes(data.appointment.status)) {
      events.push({ appointmentId: data.appointment.id, startAt: data.appointment.startAt, endAt: data.appointment.endAt, status: 'superseded', at, byUid: user.uid });
    }
    events.push({ appointmentId: appointment.id, startAt: start, endAt: end, status: 'proposed', at, byUid: user.uid });
    await updateDoc(ref, {
      appointment,
      appointmentHistory: arrayUnion(...events),
      messages: arrayUnion(sysMsg(`A repair visit was proposed for ${new Date(start).toLocaleString()} – ${new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`)),
    });
    return appointment;
  },

  async respondToAppointment(ticketId, decision) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in.');
    if (!['confirmed', 'declined'].includes(decision)) throw new Error('Choose confirm or decline.');
    const { ref, data } = await getTicketRef(ticketId);
    if (data.userId !== user.uid) throw new Error('Only the reporter can respond to a visit proposal.');
    if (!data.appointment || data.appointment.status !== 'proposed') throw new Error('There is no pending visit proposal.');
    const at = Date.now();
    const appointment = { ...data.appointment, status: decision, updatedAt: at, updatedByUid: user.uid };
    const start = new Date(appointment.startAt).toLocaleString();
    const end = new Date(appointment.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    await updateDoc(ref, {
      appointment,
      appointmentHistory: arrayUnion({ appointmentId: appointment.id, startAt: appointment.startAt, endAt: appointment.endAt, status: decision, at, byUid: user.uid }),
      messages: arrayUnion(sysMsg(decision === 'confirmed' ? `The reporter confirmed the repair visit for ${start} – ${end}.` : `The reporter declined the proposed repair visit for ${start} – ${end}.`)),
    });
    return appointment;
  },

  async addMessage(ticketId, messagePayload) {
    const { ref } = await getTicketRef(ticketId);
    await updateDoc(ref, { messages: arrayUnion(messagePayload) });
    return true;
  },

  async acknowledge(ticketId, techId, techName) {
    const { ref, data } = await getTicketRef(ticketId);
    const updates = { status: 'In Progress', acknowledgedAt: Date.now(), messages: arrayUnion(sysMsg(`${techName || 'Technician'} acknowledged the ticket and started work.`)) };
    if (techId && data.assignedTo !== techId) {
      if (data.assignedTo) await adjustTechTasks(data.assignedTo, -1);
      await adjustTechTasks(techId, +1);
      Object.assign(updates, { assignedTo: techId, assignedToName: techName || null, assignedAt: Date.now(), assignedToEmail: auth.currentUser ? auth.currentUser.email : null });
    }
    await updateDoc(ref, updates);
  },

  async resolve(ticketId, remarks, photoUrl = null, materials = []) {
    const { ref, data } = await getTicketRef(ticketId);
    const msgs = [{ sender: 'Technician', text: `RESOLUTION REMARKS: ${remarks}`, time: nowTime(), at: Date.now(), isSystem: false }];
    if (photoUrl) msgs.push({ sender: 'Technician', text: 'Post-repair photo', fileUrl: photoUrl, fileName: 'post-repair.jpg', time: nowTime(), at: Date.now(), isSystem: false });
    if (materials.length) msgs.push(sysMsg('Materials used: ' + materials.map(m => `${m.item} × ${m.qty}${m.unit && m.unit !== 'pcs' ? ' ' + m.unit : ''}`).join(', ')));
    msgs.push(sysMsg('Ticket marked as fixed.'));
    const updates = {
      status: 'Resolved', resolvedAt: serverTimestamp(), resolvedAtMs: Date.now(), resolvedBy: data.assignedTo || null, resolvedByName: data.assignedToName || null,
      resolutionRemarks: remarks, materialsUsed: materials,
      materialsLog: arrayUnion({ at: Date.now(), by: data.assignedTo || null, byName: data.assignedToName || null, items: materials }),
      messages: arrayUnion(...msgs),
    };
    if (photoUrl) updates.resolutionPhotoUrl = photoUrl;
    await updateDoc(ref, updates);
    if (data.status !== 'Resolved') await adjustTechTasks(data.assignedTo, -1);
    await bus.emit('ticket.resolved', { ticketId });
  },

  async reopen(ticketId, reason) {
    const { ref, data } = await getTicketRef(ticketId);
    if (data.status !== 'Resolved') throw new Error('Only fixed tickets can be reopened.');
    let techOk = false;
    if (data.assignedTo) { try { techOk = (await getDoc(doc(db, 'technicians', data.assignedTo))).exists(); } catch (e) {} }
    const profile = await UserService.getMyProfile().catch(() => null);
    const updates = {
      status: 'Pending', acknowledgedAt: null, resolvedAt: deleteField(), resolvedAtMs: deleteField(), rating: deleteField(),
      reopenCount: (data.reopenCount || 0) + 1, reopenedAt: Date.now(),
      reopenHistory: arrayUnion({ at: Date.now(), reason, fixedBy: data.resolvedByName || data.assignedToName || null }),
      messages: arrayUnion({ sender: 'Student', senderName: (profile && profile.name) || data.userName || 'Reporter', text: `REOPENED: ${reason}`, time: nowTime(), at: Date.now(), isSystem: false },
        sysMsg(techOk ? `Ticket reopened and sent back to ${data.assignedToName}.` : 'Ticket reopened. Finding a technician.')),
    };
    if (techOk) { updates.assignedAt = Date.now(); await adjustTechTasks(data.assignedTo, +1); }
    else { updates.assignedTo = null; updates.assignedToName = null; updates.assignedToEmail = null; }
    await updateDoc(ref, updates);
    await bus.emit('ticket.reopened', { ticketId });
    if (!techOk) await bus.emit('ticket.needsAssignment', { ticketId });
  },

  async escalate(ticketId) {
    const { ref } = await getTicketRef(ticketId);
    await updateDoc(ref, { priority: 'High', messages: arrayUnion(sysMsg('Admin marked this ticket as urgent.')) });
    await bus.emit('ticket.escalated', { ticketId, reason: 'admin' });
  },

  async rate(ticketId, rating) {
    const { ref } = await getTicketRef(ticketId);
    await updateDoc(ref, { rating, feedbackAt: serverTimestamp(), messages: arrayUnion(sysMsg(`Reporter rated the fix ${rating}/5 stars.`)) });
  },
};

// An urgent ticket that is still waiting should be (re)considered for assignment
bus.on('ticket.escalated', async ({ ticketId }) => {
  try { const { data } = await getTicketRef(ticketId); if (!data.assignedTo) await bus.emit('ticket.needsAssignment', { ticketId }); } catch (e) {}
});
