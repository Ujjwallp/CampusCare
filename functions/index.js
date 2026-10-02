// ═══════════════════════════════════════════════════════════════════════════
//  CampusCare — Cloud Functions (privileged, trusted server side)
//  Runs with the Firebase Admin SDK, which the browser cannot. It closes the
//  gaps that security rules alone cannot:
//    • provisionStaff   — create a staff login + records atomically (no browser
//                         secondaryAuth hack, no orphaned accounts)
//    • deleteStaff      — actually DELETE the Firebase Auth login + data + free
//                         their tickets (the browser can only delete the data)
//    • autoAssignOnCreate — assign new tickets server-side (not on the
//                         reporter's browser), keeping the counter honest
//    • setAdminClaim    — grant the admin custom claim (stronger than an email
//                         allow-list; optional)
//
//  DEPLOY: requires the Firebase **Blaze** plan (Functions are not on Spark).
//  See README.md in this folder for step-by-step deploy + client wiring.
// ═══════════════════════════════════════════════════════════════════════════
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 10 }); // Mumbai; closest to IIITG

const db = getFirestore();
const auth = getAuth();

// Keep this in sync with firestore.rules isAdmin(). Once setAdminClaim is used,
// you can switch these checks to `req.auth.token.admin === true` instead.
const ADMIN_EMAILS = ["admin@iiitg.ac.in"];

function assertAdmin(req) {
  const t = (req.auth && req.auth.token) || {};
  const email = String(t.email || "").toLowerCase();
  const ok = !!req.auth && (t.admin === true || ADMIN_EMAILS.includes(email));
  if (!ok) throw new HttpsError("permission-denied", "Administrator only.");
  return email;
}
function tempPassword() {
  return "Temp@" + Math.floor(1000 + Math.random() * 9000);
}
function normPhone(p) {
  const d = String(p == null ? "" : p).replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}
// Category → team mapping (mirror of js/shared/catalog.js). Keep in sync.
const TEAM_FOR_CATEGORY = {
  IT: "IT & Network Cell", Electrical: "Electrical Cell", Appliances: "Electrical Cell",
  Plumbing: "Plumbing & Estate", Hostel: "Carpentry & Furniture",
  Civil: "Civil & Building Maintenance", Housekeeping: "Housekeeping & Sanitation",
  Mess: "Mess & Food Services", HostelOffice: "Hostel Office", Security: "Security Office",
  Medical: "Medical Centre", Transport: "Transport Section", Lab: "Lab Technical Staff",
  Library: "Library", Sports: "Sports & Gym", Grounds: "Horticulture & Grounds",
};

// ─── provisionStaff ──────────────────────────────────────────────────────────
// data: { kind: 'technician'|'member', name, email, phone, dept?, section?, photoUrl? }
// returns: { uid, email, tempPassword, techId? }
exports.provisionStaff = onCall(async (req) => {
  assertAdmin(req);
  const d = req.data || {};
  const name = String(d.name || "").trim();
  const email = String(d.email || "").trim().toLowerCase();
  const kind = d.kind === "member" ? "member" : "technician";
  if (!name) throw new HttpsError("invalid-argument", "Name is required.");
  if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "A valid email is required.");
  const phoneKey = normPhone(d.phone);
  if (!phoneKey) throw new HttpsError("invalid-argument", "A valid 10-digit phone number is required.");

  const pass = tempPassword();
  let user;
  try {
    user = await auth.createUser({ email, password: pass, displayName: name });
  } catch (e) {
    throw new HttpsError("already-exists", "That email already has a login account.");
  }
  const uid = user.uid;

  try {
    const batch = db.batch();
    if (kind === "member") {
      batch.set(db.doc(`campus_members/${uid}`), {
        name, email, section: d.section || d.dept || "", phone: d.phone || "Not provided",
        photoUrl: d.photoUrl || null, uid, createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.doc(`users/${uid}`), {
        uid, name, email, userType: "staff", department: d.section || d.dept || "", idNumber: "",
        phone: d.phone || "", placeType: "", zone: "", spot: "", photoURL: d.photoUrl || "",
        provisionedStaff: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(db.doc(`staff_credentials/${uid}`), { email, temp: true, member: true, updatedAt: FieldValue.serverTimestamp() });
      batch.set(db.doc(`staff_phone_index/${phoneKey}`), { email, updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return { uid, email, tempPassword: pass };
    }
    const techRef = db.collection("technicians").doc();
    batch.set(techRef, {
      name, dept: d.dept || "", email, personalEmail: email, phone: d.phone || "Not provided",
      photoUrl: d.photoUrl || null, uid, status: "On Duty", activeTasks: 0, createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`staff_credentials/${techRef.id}`), { email, temp: true, updatedAt: FieldValue.serverTimestamp() });
    batch.set(db.doc(`staff_phone_index/${phoneKey}`), { email, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return { uid, email, tempPassword: pass, techId: techRef.id };
  } catch (e) {
    // Roll back the auth account so the email isn't orphaned.
    await auth.deleteUser(uid).catch(() => {});
    throw new HttpsError("internal", "Could not save the staff record: " + e.message);
  }
});

// ─── deleteStaff ─────────────────────────────────────────────────────────────
// data: { kind: 'technician'|'member', id }   (id = technician doc id, or member uid)
// Deletes the Auth login (browser cannot), the records, the phone index, and
// returns a technician's open tickets to the queue.
exports.deleteStaff = onCall(async (req) => {
  assertAdmin(req);
  const d = req.data || {};
  const id = String(d.id || "");
  const kind = d.kind === "member" ? "member" : "technician";
  if (!id) throw new HttpsError("invalid-argument", "id is required.");

  let uid = id, phone = null, returned = 0;
  if (kind === "member") {
    const s = await db.doc(`campus_members/${id}`).get();
    if (s.exists) { phone = s.data().phone; }
    else { const u = await db.doc(`users/${id}`).get(); if (u.exists) phone = u.data().phone; }
    await db.doc(`campus_members/${id}`).delete().catch(() => {});
    await db.doc(`users/${id}`).delete().catch(() => {});
    await db.doc(`staff_credentials/${id}`).delete().catch(() => {});
  } else {
    const s = await db.doc(`technicians/${id}`).get();
    if (s.exists) { uid = s.data().uid || id; phone = s.data().phone; }
    const q = await db.collection("tickets").where("assignedTo", "==", id).get();
    const batch = db.batch();
    q.forEach((doc) => {
      if (doc.data().status !== "Resolved") {
        returned++;
        batch.update(doc.ref, {
          status: "Pending", assignedTo: null, assignedToName: null,
          assignedToEmail: null, acknowledgedAt: null,
        });
      }
    });
    if (returned) await batch.commit();
    await db.doc(`technicians/${id}`).delete().catch(() => {});
    await db.doc(`staff_credentials/${id}`).delete().catch(() => {});
  }
  if (phone) { const k = normPhone(phone); if (k) await db.doc(`staff_phone_index/${k}`).delete().catch(() => {}); }
  let loginDeleted = false;
  if (uid) { try { await auth.deleteUser(uid); loginDeleted = true; } catch (e) {} }
  return { ok: true, loginDeleted, ticketsReturned: returned };
});

// ─── autoAssignOnCreate ──────────────────────────────────────────────────────
// Server-side assignment: when a non-confidential ticket is created, give it to
// the least-busy on-duty technician in the right team. Runs with Admin rights,
// so no privileged write happens on the reporter's browser.
exports.autoAssignOnCreate = onDocumentCreated("tickets/{id}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const t = snap.data();
  if (!t || t.assignedTo || t.confidential || t.status === "Resolved") return;

  const settings = await db.doc("settings/app").get();
  if (settings.exists && settings.data().autoAssign === false) return;

  const dept = TEAM_FOR_CATEGORY[t.category];
  if (!dept) return; // no team (e.g. Academic/Other) → admin handles manually

  const techSnap = await db.collection("technicians").where("dept", "==", dept).get();
  const techs = techSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.status === "On Duty");
  if (!techs.length) return;

  // least-busy by live open-ticket count
  const openSnap = await db.collection("tickets").where("status", "in", ["Pending", "In Progress"]).get();
  const load = {};
  openSnap.forEach((d) => { const a = d.data().assignedTo; if (a) load[a] = (load[a] || 0) + 1; });
  techs.sort((a, b) => (load[a.id] || 0) - (load[b.id] || 0));
  const best = techs[0];

  await snap.ref.update({
    assignedTo: best.id, assignedToName: best.name, assignedToEmail: best.email || null,
    assignedAt: Date.now(), assignedBy: "auto", assignReason: "Least busy on-duty " + dept + " technician.",
    acknowledgedAt: null,
    messages: FieldValue.arrayUnion({
      sender: "System", isSystem: true,
      text: "Automatically assigned to " + best.name + ".",
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      at: Date.now(),
    }),
  });
  await db.doc(`technicians/${best.id}`).update({ activeTasks: (best.activeTasks || 0) + 1 }).catch(() => {});
});

// ─── setAdminClaim (optional hardening) ──────────────────────────────────────
// Grants the `admin:true` custom claim so rules/functions can check a claim
// instead of an email list. Only an existing admin may call it. Bootstrap the
// very first admin once via the Functions shell (see README).
exports.setAdminClaim = onCall(async (req) => {
  assertAdmin(req);
  const email = String((req.data || {}).email || "").toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "email is required.");
  const u = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(u.uid, { admin: true });
  return { ok: true, uid: u.uid };
});
