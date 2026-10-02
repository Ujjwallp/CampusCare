// ─── NOTICE SERVICE ───
// Campus-wide notices from the Administrator ("Wi-Fi down in Hostel 3,
// expected fix 5 PM"). Shown as a banner to everyone, and inside
// the report form when someone is about to report the same thing.
// Firestore: notices/{id}
import { db, auth, collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp } from '../infra/firebase.js';
import { bus } from '../core/eventBus.js';

export const NoticeService = {
  subscribe(callback) {
    return onSnapshot(collection(db, 'notices'), (s) => {
      const now = Date.now();
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(n => n.active !== false && (!n.expiresAt || n.expiresAt > now))
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      callback(list);
    }, () => callback([]));
  },

  async post({ title, body, level = 'info', category = '', zone = '', hours = 24 }) {
    if (!title || !title.trim()) throw new Error("Give the notice a title.");
    const ref = await addDoc(collection(db, 'notices'), {
      title: title.trim(), body: (body || '').trim(), level, category, zone,
      active: true, createdAt: serverTimestamp(), createdAtMs: Date.now(),
      expiresAt: hours ? Date.now() + hours * 3600000 : null,
      createdBy: auth.currentUser ? auth.currentUser.email : null,
    });
    await bus.emit('notice.posted', { title: title.trim() });
    return ref.id;
  },

  async end(id) { await updateDoc(doc(db, 'notices', id), { active: false, endedAt: Date.now() }); },
};
