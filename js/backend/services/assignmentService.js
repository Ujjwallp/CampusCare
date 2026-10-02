// ─── ASSIGNMENT SERVICE ───
// Chooses the best on-duty technician for a ticket.
//   normal tickets → least busy (ties: better track record)
//   urgent tickets → workload AND performance (speed, on-time %, rating, late tickets)
// Listens to: ticket.created, ticket.needsAssignment, technician.onDuty, technician.removed
import { db, auth, collection, getDocs, updateDoc, query, where, arrayUnion } from '../infra/firebase.js';
import { msOf, DAY_MS, sysMsg, catalog, getTicketRef, adjustTechTasks } from '../core/helpers.js';
import { ADMIN_EMAILS } from '../core/config.js';
import { SettingsService } from './settingsService.js';
import { bus } from '../core/eventBus.js';

const lateMs = () => SettingsService.get().lateHours * 3600000;

function techPerformance(resolved) {
  const works = [], onTime = [], ratings = [];
  resolved.forEach(t => {
    const created = msOf(t.createdAt), done = t.resolvedAtMs || msOf(t.resolvedAt);
    const start = t.acknowledgedAt || t.assignedAt || created;
    if (start && done && done >= start) works.push(done - start);
    if (created && done) onTime.push(done - created <= lateMs() ? 1 : 0);
    if (t.rating) ratings.push(t.rating);
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return { fixed: resolved.length, avgWork: avg(works), onTimeRate: avg(onTime), rating: avg(ratings) };
}

export const AssignmentService = {
  async pickTechnician(category, priority, excludeId = null) {
    const dept = catalog.team(category);
    if (!dept) return null;
    const techSnap = await getDocs(query(collection(db, 'technicians'), where('dept', '==', dept)));
    const techs = techSnap.docs.map(d => ({ firebaseId: d.id, ...d.data() })).filter(t => t.status === 'On Duty' && t.firebaseId !== excludeId);
    if (!techs.length) return null;

    const open = (await getDocs(query(collection(db, 'tickets'), where('status', 'in', ['Pending', 'In Progress'])))).docs.map(d => d.data());
    let resolved = [];
    if (priority === 'High' || techs.length > 1) {
      const since = Date.now() - 90 * DAY_MS;
      resolved = (await getDocs(query(collection(db, 'tickets'), where('status', '==', 'Resolved')))).docs.map(d => d.data())
        .filter(t => (t.resolvedAtMs || msOf(t.resolvedAt) || 0) >= since);
    }

    const rows = techs.map(t => {
      const mine = open.filter(x => x.assignedTo === t.firebaseId);
      const late = mine.filter(x => { const c = msOf(x.createdAt); return c && Date.now() - c > lateMs(); }).length;
      const perf = techPerformance(resolved.filter(x => (x.resolvedBy || x.assignedTo) === t.firebaseId));
      return { tech: t, load: mine.length, urgentLoad: mine.filter(x => x.priority === 'High').length, late, perf };
    });
    const works = rows.map(r => r.perf.avgWork).filter(v => v != null);
    const minW = Math.min(...works), maxW = Math.max(...works);
    rows.forEach(r => {
      const speed = r.perf.avgWork == null ? 0.5 : (maxW > minW ? 1 - (r.perf.avgWork - minW) / (maxW - minW) : 1);
      const onTime = r.perf.onTimeRate == null ? 0.5 : r.perf.onTimeRate;
      const rating = r.perf.rating == null ? 0.6 : r.perf.rating / 5;
      const confidence = Math.min(1, r.perf.fixed / 3);
      r.performance = 0.5 * (1 - confidence) + confidence * (0.45 * speed + 0.35 * onTime + 0.20 * rating);
      r.score = priority === 'High'
        ? r.load + 1.5 * r.urgentLoad + 2 * r.late + 4 * (1 - r.performance)
        : r.load + 0.5 * r.late + 0.5 * (1 - r.performance);
    });
    rows.sort((x, y) => x.score - y.score || x.load - y.load);
    const best = rows[0];
    const bits = [`on duty`, `${best.load} open ticket${best.load === 1 ? '' : 's'}`];
    if (priority === 'High' && best.perf.fixed) {
      if (best.perf.onTimeRate != null) bits.push(`${Math.round(best.perf.onTimeRate * 100)}% fixed on time`);
      if (best.perf.rating) bits.push(`rated ${best.perf.rating.toFixed(1)}/5`);
    }
    const why = rows.length > 1
      ? `${priority === 'High' ? 'Urgent ticket: best mix of availability and track record' : 'Least busy'} among ${rows.length} on-duty ${dept} technicians (${bits.join(', ')}).`
      : `Only on-duty technician in ${dept} (${bits.join(', ')}).`;
    return { tech: best.tech, reason: why };
  },

  // Give one waiting ticket to the best technician. Returns the technician's name or null.
  async autoAssignTicket(ticketId, { force = false, explainIfNone = false, candidateTechId = null } = {}) {
    const { ref, data } = await getTicketRef(ticketId);
    if (data.assignedTo || data.status === 'Resolved' || data.confidential) return null;
    if (!force && !SettingsService.get().autoAssign) {
      if (explainIfNone) await updateDoc(ref, { messages: arrayUnion(sysMsg('The Admin will give this ticket to a technician.')) });
      return null;
    }
    const pick = await this.pickTechnician(data.category, data.priority);
    if (!pick) {
      if (explainIfNone) await updateDoc(ref, { messages: arrayUnion(sysMsg(catalog.team(data.category)
        ? 'No technician of this team is on duty right now. It will be assigned as soon as one is available.'
        : 'The Admin will pick the right person for this ticket.')) });
      return null;
    }
    // A technician client can only make a safe self-claim. It participates in
    // the same workload selection as the reporter/admin, and writes only when
    // the best available technician is itself.
    if (candidateTechId && pick.tech.firebaseId !== candidateTechId) return null;
    await adjustTechTasks(pick.tech.firebaseId, +1);
    await updateDoc(ref, {
      assignedTo: pick.tech.firebaseId, assignedToName: pick.tech.name, assignedToEmail: pick.tech.email || null,
      assignedAt: Date.now(), assignedBy: 'auto', assignReason: pick.reason, acknowledgedAt: null,
      messages: arrayUnion(sysMsg(`Automatically given to ${pick.tech.name}. ${pick.reason}`))
    });
    await bus.emit('ticket.assigned', { ticketId, techId: pick.tech.firebaseId, techName: pick.tech.name, auto: true });
    return pick.tech.name;
  },

  // Give every waiting ticket (optionally of one team) to technicians. Urgent and oldest first.
  async autoAssignWaiting(dept = null, { force = false, candidateTechId = null } = {}) {
    if (!force && !SettingsService.get().autoAssign) return { assigned: 0, waiting: 0 };
    const snap = await getDocs(query(collection(db, 'tickets'), where('status', '==', 'Pending')));
    const waiting = snap.docs.map(d => d.data())
      .filter(t => !t.assignedTo && !t.confidential && catalog.team(t.category) && (!dept || catalog.team(t.category) === dept))
      .sort((a, b) => ((b.priority === 'High') - (a.priority === 'High')) || ((msOf(a.createdAt) || 0) - (msOf(b.createdAt) || 0)));
    let n = 0;
    for (const t of waiting) { if (await this.autoAssignTicket(t.id, { force, candidateTechId })) n++; }
    return { assigned: n, waiting: waiting.length };
  },

  // Admin chooses a technician by hand
  async assignTicket(ticketId, techId, techName) {
    const { ref, data } = await getTicketRef(ticketId);
    if (data.assignedTo === techId) return;
    if (data.assignedTo && data.status !== 'Resolved') await adjustTechTasks(data.assignedTo, -1);
    await adjustTechTasks(techId, +1);
    const techs = await getDocs(query(collection(db, 'technicians')));
    const t = techs.docs.find(d => d.id === techId);
    await updateDoc(ref, {
      status: 'Pending', assignedTo: techId, assignedToName: techName, assignedToEmail: t ? (t.data().email || null) : null,
      assignedAt: Date.now(), acknowledgedAt: null, assignedBy: 'admin', assignReason: 'Chosen by the Admin.',
      messages: arrayUnion(sysMsg(`Admin ${data.assignedTo ? 're' : ''}assigned ticket to ${techName}. Waiting for acknowledgement.`))
    });
    await bus.emit('ticket.assigned', { ticketId, techId, techName, auto: false });
  },
};

// ── event subscriptions ──
bus.on('ticket.created', ({ ticketId, confidential }) => confidential ? null : AssignmentService.autoAssignTicket(ticketId, { explainIfNone: true }));
bus.on('ticket.needsAssignment', ({ ticketId }) => AssignmentService.autoAssignTicket(ticketId, { explainIfNone: true }));
// On duty, technicians participate in workload-based assignment; each browser
// can write only if its own technician is the best available match.
bus.on('technician.onDuty', ({ dept, techId }) => {
  const email = (auth.currentUser?.email || '').toLowerCase();
  const adminCanAssign = ADMIN_EMAILS.some(x => x.toLowerCase() === email);
  return AssignmentService.autoAssignWaiting(dept, { candidateTechId: adminCanAssign ? null : (techId || null) });
});
bus.on('technician.removed', () => AssignmentService.autoAssignWaiting());
