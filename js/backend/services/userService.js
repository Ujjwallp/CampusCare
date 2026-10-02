// ─── USER SERVICE ───
// Profiles for every campus member: students, faculty and non-teaching staff.
// Firestore: users/{uid}
import { db, auth, doc, getDoc, setDoc, serverTimestamp } from '../infra/firebase.js';

export const USER_TYPES = {
  student: 'Student',
  faculty: 'Faculty',
  staff: 'Non-teaching staff',
};

let cached = null;

export const UserService = {
  USER_TYPES,

  async getMyProfile(force = false) {
    const u = auth.currentUser;
    if (!u) return null;
    if (cached && cached.uid === u.uid && !force) return cached;
    try {
      const snap = await getDoc(doc(db, 'users', u.uid));
      cached = snap.exists() ? { uid: u.uid, ...snap.data() } : null;
    } catch (e) { cached = null; }
    return cached;
  },

  cachedProfile() { return cached; },

  async saveMyProfile(p) {
    const u = auth.currentUser;
    if (!u) throw new Error("Not logged in");
    if (!USER_TYPES[p.userType]) throw new Error("Choose who you are (student, faculty or staff).");
    const profile = {
      uid: u.uid,                                   // required by the security rules
      name: (p.name || '').trim() || u.displayName || u.email.split('@')[0],
      email: u.email,
      userType: p.userType,
      department: (p.department || '').trim(),
      idNumber: (p.idNumber || '').trim(),          // roll number / employee ID
      phone: (p.phone || '').trim(),
      placeType: p.placeType || '',                 // hostel / lab / office ...
      zone: (p.zone || '').trim(),                  // typed building name
      spot: (p.spot || '').trim(),                  // room / office
      photoURL: u.photoURL || p.photoURL || '',     // Google account picture, if any
      updatedAt: serverTimestamp(),
    };
    const existing = await this.getMyProfile(true);
    if (!existing) profile.createdAt = serverTimestamp();
    await setDoc(doc(db, 'users', u.uid), profile, { merge: true });
    cached = { uid: u.uid, ...(existing || {}), ...profile };
    return cached;
  },

  clear() { cached = null; },
};
