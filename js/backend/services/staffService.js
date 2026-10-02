// ─── STAFF SERVICE ───
// Technician accounts: create, duty status, secure password reset, profile
// photo approvals, and removal.
// Publishes: technician.onDuty, technician.removed
import { db, auth, secondaryAuth, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp, arrayUnion, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, deleteUser } from '../infra/firebase.js';
import { lc, normalizePhone, sysMsg, findTechByEmail } from '../core/helpers.js';
import { bus } from '../core/eventBus.js';

// ── Phone sign-in index ──
// Firebase has no "phone + password" sign-in, so we keep a small public lookup
// (phone number → login email). At sign-in the app resolves the typed phone to
// the email, then does the normal email+password sign-in. The index stores only
// the email (needed to sign in); it is written only by the admin.
async function upsertPhoneIndex(phone, email, kind, uid) {
  const key = normalizePhone(phone);
  if (!key || !email) return;
  // Store ONLY the login email (the minimum needed to resolve phone→email at
  // sign-in). No uid/kind, to minimise what a phone-number lookup can reveal.
  await setDoc(doc(db, 'staff_phone_index', key), { email: lc(email), updatedAt: serverTimestamp() });
}
async function removePhoneIndex(phone) {
  const key = normalizePhone(phone);
  if (!key) return;
  try { await deleteDoc(doc(db, 'staff_phone_index', key)); } catch (e) {}
}

export const StaffService = {
  // Scoped: the admin reads every technician (needed to assign work); a
  // technician reads only their OWN record; a campus user reads none (they get
  // the assignee's name from the ticket). Matches the technicians read rule.
  subscribe(scope, callback) {
    const map = (snapshot) => callback(snapshot.docs.map(d => ({ firebaseId: d.id, id: d.id, ...d.data() })));
    const err = (e) => console.error("Technicians listener error:", e);
    if (scope && scope.role === 'admin') {
      return onSnapshot(collection(db, 'technicians'), map, err);
    }
    if (scope && scope.uid) {
      return onSnapshot(query(collection(db, 'technicians'), where('uid', '==', scope.uid)), map, err);
    }
    callback([]);
    return () => {};
  },

  async create(payload) {
    const email = lc(payload.email);
    // Create the login on a secondary auth instance so the Admin stays signed in
    const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, payload.password);
    let docRef, tech;
    try {
      tech = {
        name: payload.name, dept: payload.dept, email,
        personalEmail: payload.personalEmail || 'None', phone: payload.phone || 'Not provided', photoUrl: payload.photoUrl || null,
        uid: userCred.user.uid, status: "On Duty", activeTasks: 0, createdAt: serverTimestamp(),
      };
      docRef = await addDoc(collection(db, 'technicians'), tech);
      // Store ONLY a status flag — never the password. The temp password is
      // shown to the admin once (returned below) and the technician must change
      // it on first login.
      await setDoc(doc(db, 'staff_credentials', docRef.id), { email, temp: true, updatedAt: serverTimestamp() });
    } catch (e) {
      // The login account was created but saving the record failed — roll the
      // account back so the email isn't left orphaned (which would otherwise
      // block re-creating it with "email already in use").
      try { await deleteUser(userCred.user); } catch (_) {}
      throw e;
    } finally {
      try { await signOut(secondaryAuth); } catch (_) {}
    }
    // Best-effort: let them sign in by phone too (never blocks creation).
    try { await upsertPhoneIndex(tech.phone, email, 'technician', tech.uid); } catch (e) { console.warn('phone index', e); }
    await bus.emit('technician.onDuty', { techId: docRef.id, dept: tech.dept });
    await bus.emit('technician.created', { name: tech.name, dept: tech.dept, email });
    return { firebaseId: docRef.id, id: docRef.id, ...tech };
  },

  // Campus member = non-teaching staff who REPORTS problems (no IIITG account).
  // Kept in a separate collection so they never mix with technicians. Keyed by
  // their login uid so the security rules can recognise them.
  async createMember(payload) {
    const email = lc(payload.email);
    const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, payload.password);
    const uid = userCred.user.uid;
    const member = {
      name: payload.name, email, section: payload.section || payload.dept || '',
      phone: payload.phone || 'Not provided', photoUrl: payload.photoUrl || null,
      uid, createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'campus_members', uid), member);
      await setDoc(doc(db, 'staff_credentials', uid), { email, temp: true, member: true, updatedAt: serverTimestamp() });
      // A non-teaching staff member is a CAMPUS USER by default: give them a
      // users/{uid} profile from the start (so they're scoped exactly like any
      // other campus user, not a special category).
      await setDoc(doc(db, 'users', uid), {
        uid, name: payload.name, email, userType: 'staff',
        department: payload.section || payload.dept || '', idNumber: '',
        phone: payload.phone || '', placeType: '', zone: '', spot: '',
        photoURL: payload.photoUrl || '', provisionedStaff: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      // Roll back the just-created login so the email isn't orphaned.
      try { await deleteUser(userCred.user); } catch (_) {}
      throw e;
    } finally {
      try { await signOut(secondaryAuth); } catch (_) {}
    }
    try { await upsertPhoneIndex(member.phone, email, 'member', uid); } catch (e) { console.warn('phone index', e); }
    await bus.emit('technician.created', { name: member.name, dept: member.section || 'Non-teaching staff', email });
    return { firebaseId: uid, uid, ...member };
  },

  // Resolve a typed phone number to the staff login email (used before sign-in).
  async emailForPhone(phone) {
    const key = normalizePhone(phone);
    if (!key) return null;
    try { const snap = await getDoc(doc(db, 'staff_phone_index', key)); return snap.exists() ? (snap.data().email || null) : null; }
    catch (e) { console.warn('emailForPhone', e); return null; }
  },

  // Backfill the phone index for every existing technician + member (admin only).
  async rebuildPhoneIndex() {
    let count = 0;
    const techs = await getDocs(collection(db, 'technicians'));
    for (const d of techs.docs) { const t = d.data(); if (normalizePhone(t.phone) && t.email) { await upsertPhoneIndex(t.phone, t.email, 'technician', t.uid); count++; } }
    const mems = await getDocs(collection(db, 'campus_members'));
    for (const d of mems.docs) { const m = d.data(); if (normalizePhone(m.phone) && m.email) { await upsertPhoneIndex(m.phone, m.email, 'member', m.uid || d.id); count++; } }
    return { count };
  },

  subscribeMembers(callback) {
    let campusMembers = [], provisionedProfiles = [], legacyProfiles = [];
    const emit = () => {
      const rows = new Map(campusMembers.map(member => [member.uid || member.firebaseId, { ...member }]));
      for (const profile of [...provisionedProfiles, ...legacyProfiles]) {
        const uid = profile.uid || profile.firebaseId;
        const profileRow = {
          firebaseId: uid, uid, ...profile,
          section: profile.department || profile.section || 'Non-teaching staff',
          phone: profile.phone || 'Not provided',
          photoUrl: profile.photoURL || profile.photoUrl || null,
          campusUser: true,
        };
        rows.set(uid, { ...profileRow, ...(rows.get(uid) || {}), campusUser: true });
      }
      callback([...rows.values()]);
    };
    const onError = (err) => console.error('Non-teaching staff listener error:', err);
    const unsubs = [
      onSnapshot(collection(db, 'campus_members'), (s) => {
        campusMembers = s.docs.map(d => ({ firebaseId: d.id, uid: d.id, ...d.data() }));
        emit();
      }, onError),
      onSnapshot(query(collection(db, 'users'), where('provisionedStaff', '==', true)), (s) => {
        provisionedProfiles = s.docs.map(d => ({ firebaseId: d.id, uid: d.id, ...d.data() }));
        emit();
      }, onError),
      onSnapshot(query(collection(db, 'users'), where('movedFromStaff', '==', true)), (s) => {
        legacyProfiles = s.docs.map(d => ({ firebaseId: d.id, uid: d.id, ...d.data() }));
        emit();
      }, onError),
    ];
    return () => unsubs.forEach(unsub => unsub());
  },

  async removeMember(uid) {
    let phone = null;
    try { const s = await getDoc(doc(db, 'campus_members', uid)); if (s.exists()) phone = s.data().phone; } catch (e) {}
    if (!phone) {
      try { const s = await getDoc(doc(db, 'users', uid)); if (s.exists()) phone = s.data().phone; } catch (e) {}
    }
    await deleteDoc(doc(db, 'campus_members', uid));
    try { await deleteDoc(doc(db, 'staff_credentials', uid)); } catch (e) {}
    try {
      const profile = await getDoc(doc(db, 'users', uid));
      if (profile.exists()) await updateDoc(doc(db, 'users', uid), { provisionedStaff: false, movedFromStaff: false });
    } catch (e) {}
    if (phone) await removePhoneIndex(phone);
    return { ok: true };
  },

  // Coming on duty triggers assignment of waiting tickets for that team
  async setStatus(techId, newStatus) {
    await updateDoc(doc(db, 'technicians', techId), { status: newStatus });
    if (newStatus !== 'On Duty') return { assigned: 0 };
    const snap = await getDoc(doc(db, 'technicians', techId));
    const results = await bus.emit('technician.onDuty', { techId, dept: snap.exists() ? snap.data().dept : null });
    return results.find(r => r && typeof r.assigned === 'number') || { assigned: 0 };
  },

  // Secure reset: send the technician a Firebase password-reset email. The
  // admin never sees or sets the password (that would need plaintext storage
  // or the Admin SDK). The technician clicks the link and chooses a new one.
  async resetPassword(techId) {
    let tech = null, isMember = false;
    if (techId && techId !== 'undefined') {
      const dSnap = await getDoc(doc(db, 'technicians', techId));
      if (dSnap.exists()) tech = { firebaseId: dSnap.id, ...dSnap.data() };
      if (!tech) { const mSnap = await getDoc(doc(db, 'campus_members', techId)); if (mSnap.exists()) { tech = { firebaseId: mSnap.id, ...mSnap.data() }; isMember = true; } }
    }
    if (!tech) tech = await findTechByEmail(techId);
    if (!tech) throw new Error("Account not found");
    await sendPasswordResetEmail(auth, tech.email);
    await setDoc(doc(db, 'staff_credentials', tech.firebaseId), { email: tech.email, temp: false, updatedAt: serverTimestamp() }, { merge: true });
    if (!isMember) { try { await updateDoc(doc(db, 'technicians', tech.firebaseId), { lastPasswordReset: serverTimestamp() }); } catch (e) {} }
    await bus.emit('password.reset', { name: tech.name, email: tech.email });
    return { name: tech.name, email: tech.email };
  },

  async isUsingTempPassword() {
    const user = auth.currentUser;
    if (!user) return false;
    // Members are keyed by uid; technicians by their doc id.
    const byUid = await getDoc(doc(db, 'staff_credentials', user.uid)).catch(() => null);
    if (byUid && byUid.exists()) return byUid.data().temp === true;
    const tech = await findTechByEmail(user.email).catch(() => null);
    if (!tech) return false;
    const snap = await getDoc(doc(db, 'staff_credentials', tech.firebaseId));
    return snap.exists() && snap.data().temp === true;
  },

  async remove(techId) {
    const techRef = doc(db, 'technicians', techId);
    const snap = await getDoc(techRef);
    if (!snap.exists()) throw new Error("Technician not found");
    const tech = snap.data();
    // The login account in Firebase Authentication cannot be deleted from the
    // browser without the password (which we no longer store) or the Admin SDK.
    // We remove all of the technician's data and free their tickets; the admin
    // can delete the leftover auth account from the Firebase console if needed.
    const loginDeleted = false;
    const credRef = doc(db, 'staff_credentials', techId);
    const credSnap = await getDoc(credRef);
    const ticketSnap = await getDocs(query(collection(db, 'tickets'), where('assignedTo', '==', techId)));
    let returned = 0;
    for (const d of ticketSnap.docs) {
      if (d.data().status === 'Resolved') continue;
      returned++;
      await updateDoc(d.ref, { status: 'Pending', assignedTo: null, assignedToName: null, acknowledgedAt: null,
        messages: arrayUnion(sysMsg(`${tech.name} was removed from staff. Ticket returned to the queue.`)) });
    }
    for (const d of (await getDocs(query(collection(db, 'profile_requests'), where('techId', '==', techId)))).docs) await deleteDoc(d.ref);
    if (credSnap.exists()) await deleteDoc(credRef);
    await deleteDoc(techRef);
    if (tech.phone) await removePhoneIndex(tech.phone);
    await bus.emit('technician.removed', { techId, name: tech.name, returned });
    return { name: tech.name, loginDeleted, ticketsReturned: returned };
  },

  // Profile photo change → admin approval
  async requestPhoto(techId, techName, photoUrl) {
    await addDoc(collection(db, 'profile_requests'), { techId, techName, photoUrl, status: 'pending', createdAt: serverTimestamp() });
  },
  subscribePhotoRequests(callback) {
    return onSnapshot(query(collection(db, 'profile_requests'), where('status', '==', 'pending')), (s) => callback(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => console.error(err));
  },
  async resolvePhotoRequest(reqId, approve) {
    const ref = doc(db, 'profile_requests', reqId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Request not found");
    if (approve) await updateDoc(doc(db, 'technicians', snap.data().techId), { photoUrl: snap.data().photoUrl });
    await deleteDoc(ref);
  },
};
