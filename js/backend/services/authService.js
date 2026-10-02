// ─── AUTH SERVICE ───
// Sign-in, role verification (campus user / staff / admin), passwords, sessions.
import { db, auth, doc, getDoc, setDoc, serverTimestamp, setPersistence, browserSessionPersistence, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail, onAuthStateChanged } from '../infra/firebase.js';
import { ADMIN_EMAILS, CAMPUS_DOMAIN } from '../core/config.js';
import { lc, findTechByEmail, findMemberByEmail } from '../core/helpers.js';
import { bus } from '../core/eventBus.js';

export const AuthService = {
  ADMIN_EMAILS,
  getCurrentUser() { return auth.currentUser; },
  onAuthChange(cb) { return onAuthStateChanged(auth, cb); },

  async login({ email, password, role }) {
    // Keep independently signed-in student, technician, and admin tabs from
    // replacing each other's Firebase user on this shared origin.
    await setPersistence(auth, browserSessionPersistence);
    let user;
    if (password) {
      try { user = (await signInWithEmailAndPassword(auth, lc(email), password)).user; }
      catch (error) {
        const code = error.code || '';
        if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) throw new Error("Incorrect email or password.");
        if (code.includes('too-many-requests')) throw new Error("Too many attempts. Please wait a minute and try again.");
        throw new Error(error.message || "Invalid Credentials");
      }
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: CAMPUS_DOMAIN.slice(1) });
      try { user = (await signInWithPopup(auth, provider)).user; }
      catch (error) {
        if ((error.code || '').includes('popup-closed')) throw new Error("Sign-in popup was closed.");
        throw new Error(error.message || "Google Sign-In Failed");
      }
    }
    const res = await this.verifyRole(user, role);
    await bus.emit('auth.signedIn', res.user);
    return res;
  },

  // Make sure the signed-in account belongs to the portal it chose.
  //  • admin  → must be an Administrator account
  //  • staff  → must be a technician/caretaker the admin provisioned
  //             (they log in with a personal email — NO institutional account)
  //  • campus → students & faculty, must be an official @iiitg.ac.in account
  //             (only reachable via Google sign-in, the official means)
  async verifyRole(user, role) {
    const email = lc(user.email);
    const deny = async (msg) => { await signOut(auth); throw new Error(msg); };
    if (role === 'admin') {
      if (!ADMIN_EMAILS.map(lc).includes(email)) await deny("Access Denied: this account is not an Administrator.");
      return { success: true, user: { name: user.displayName || 'Administrator', email, role, uid: user.uid } };
    }
    if (role === 'staff') {
      // The Staff desk serves two kinds of admin-provisioned account, kept
      // apart: TECHNICIANS (who fix things) and CAMPUS MEMBERS / non-teaching
      // staff (who only report). Both use a personal email + password.
      // If the database rules block these reads, the lookups throw permission
      // errors and the account looks "not registered" even though it exists.
      // Track that so we can tell the admin to publish the rules.
      let permBlocked = false;
      const tryFind = async (fn) => {
        try { return await fn(); }
        catch (e) { if (/permission|insufficient|missing or insufficient/i.test(e.code || e.message || '')) permBlocked = true; return null; }
      };
      const tech = await tryFind(() => findTechByEmail(email));
      if (tech) return { success: true, user: { name: tech.name || user.displayName || email.split('@')[0], email, role: 'staff', techId: tech.firebaseId, uid: user.uid } };
      // Non-teaching members are keyed by their login uid. Read THAT doc directly
      // — a query by email is denied by the rules (members may only read their own
      // record, by uid), which is why phone/email login failed for them.
      const memberSnap = await tryFind(() => getDoc(doc(db, 'campus_members', user.uid)));
      if (memberSnap && memberSnap.exists()) {
        const m = memberSnap.data();
        return { success: true, user: { name: m.name || user.displayName || email.split('@')[0], email, role: 'student', provisioned: true, photo: user.photoURL, uid: user.uid } };
      }
      // Legacy non-teaching accounts may have been moved into users/{uid}
      // before they were provisioned as campus users by default. Only honor
      // Admin-set markers here; an ordinary profile must not grant staff login.
      const prof = await tryFind(() => getDoc(doc(db, 'users', user.uid)));
      if (prof && prof.exists()) {
        const p = prof.data();
        if (p.provisionedStaff === true || p.movedFromStaff === true) {
          return { success: true, user: { name: p.name || user.displayName || email.split('@')[0], email, role: 'student', provisioned: true, photo: user.photoURL, uid: user.uid } };
        }
      }
      if (permBlocked) await deny("You signed in, but the database blocked the account check. The administrator needs to publish the latest Firestore rules in the Firebase console, then this will work.");
      await deny("Access Denied: this account is not registered. Ask the Administrator to add you.");
    }
    // The Administrator account is not a campus reporter — otherwise tickets it
    // files would show "admin" as the reporter. Send it to the Admin tab.
    if (ADMIN_EMAILS.map(lc).includes(email)) await deny("This is the Administrator account — please sign in from the Admin tab, not Campus User.");
    // Campus users (students & faculty) must use their official IIITG account.
    if (!email.endsWith(CAMPUS_DOMAIN)) await deny(`Access Denied: students and faculty must sign in with their official ${CAMPUS_DOMAIN} Google account.`);
    return { success: true, user: { name: user.displayName || email.split('@')[0], email, role, photo: user.photoURL, uid: user.uid } };
  },

  async resetPassword(email) { await sendPasswordResetEmail(auth, lc(email)); },

  async updateMyPassword(newPass) {
    if (!auth.currentUser) throw new Error("Not logged in");
    await updatePassword(auth.currentUser, newPass);

    try {
      // Clear the "temporary" flag (never store the password). Members are
      // keyed by uid; technicians by their doc id.
      const u = auth.currentUser;
      const byUid = await getDoc(doc(db, 'staff_credentials', u.uid)).catch(() => null);
      if (byUid && byUid.exists()) {
        await setDoc(doc(db, 'staff_credentials', u.uid), { email: u.email, temp: false, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        const tech = await findTechByEmail(u.email);
        if (tech) await setDoc(doc(db, 'staff_credentials', tech.firebaseId), { email: tech.email, temp: false, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) { console.warn("Could not sync staff credential", e); }
  },

  async logout() {
    await bus.emit('auth.signingOut');
    try { await signOut(auth); } catch (e) { console.warn(e); }
  },
};
