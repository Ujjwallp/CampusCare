// ─── EVENT BUS ───
// Services never call each other for side-effects directly; they publish
// domain events and other services subscribe. This keeps services loosely
// coupled (Service-Oriented Architecture): each could later be moved into
// its own Cloud Function / microservice by replacing this bus with Pub/Sub.
//
//   bus.on('ticket.needsAssignment', handler)
//   await bus.emit('ticket.needsAssignment', { ticketId })   → results of all handlers

const handlers = new Map();
const log = [];

export const bus = {
  on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(fn);
    return () => handlers.set(event, handlers.get(event).filter(h => h !== fn));
  },

  async emit(event, payload) {
    log.push({ event, at: Date.now() });
    if (log.length > 200) log.shift();
    const list = handlers.get(event) || [];
    const results = [];
    for (const fn of list) {
      try { results.push(await fn(payload)); }
      catch (err) { console.warn(`[bus] handler for "${event}" failed`, err); results.push(null); }
    }
    return results;
  },

  // for debugging / the architecture demo: window.API._events()
  recent() { return [...log]; },
};
