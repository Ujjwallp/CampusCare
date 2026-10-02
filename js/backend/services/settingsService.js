// ─── SETTINGS SERVICE ───
// Admin-editable rules (Me-too threshold, late time, auto-assign) in Firestore: settings/app
import { db, doc, setDoc, onSnapshot, serverTimestamp } from '../infra/firebase.js';
import { DEFAULT_SETTINGS } from '../core/config.js';
import { bus } from '../core/eventBus.js';

let current = { ...DEFAULT_SETTINGS };
const ref = () => doc(db, 'settings', 'app');

export const SettingsService = {
  get() { return { ...current }; },

  subscribe(cb) {
    return onSnapshot(ref(), (s) => {
      // Just refresh local state + UI here. The 'settings.changed' domain event
      // is emitted only from save(), so the audit log records real admin edits,
      // not every snapshot.
      current = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      cb && cb(this.get());
    }, () => {});
  },

  async save(changes) {
    const clean = {};
    if (changes.meTooThreshold != null) clean.meTooThreshold = Math.max(2, Math.min(100, Math.round(changes.meTooThreshold)));
    if (changes.lateHours != null) clean.lateHours = Math.max(1, Math.min(24 * 30, Math.round(changes.lateHours)));
    if (changes.autoAssign != null) clean.autoAssign = !!changes.autoAssign;
    await setDoc(ref(), { ...current, ...clean, updatedAt: serverTimestamp() });
    current = { ...current, ...clean };
    await bus.emit('settings.changed', current);
    return this.get();
  },
};
