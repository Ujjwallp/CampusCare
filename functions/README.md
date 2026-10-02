# CampusCare — Cloud Functions

These are the **privileged, trusted** operations that the browser cannot do safely.
They run with the Firebase **Admin SDK**.

| Function | What it fixes |
|---|---|
| `provisionStaff` | Creates a staff login + all records **atomically** on the server — no browser `secondaryAuth` workaround, no orphaned auth accounts. |
| `deleteStaff` | Actually **deletes the Firebase Auth login** (the browser can only delete the data), frees a technician's open tickets, and cleans the phone index. |
| `autoAssignOnCreate` | Assigns new tickets **server-side** (Firestore trigger), so no privileged write runs on the reporter's browser and the load counter stays honest. |
| `setAdminClaim` | (Optional) grants an `admin:true` custom claim, stronger than an email allow-list. |

---

## ⚠️ Before you deploy — the plan requirement

Cloud Functions are **not available on the free Spark plan**. You must upgrade the
project to **Blaze (pay-as-you-go)**:

- Firebase Console → ⚙️ → **Usage and billing** → **Modify plan** → **Blaze**.
- Blaze has a **generous free tier** (2M function invocations, 125K/month free,
  etc.). For a campus app this is almost always **₹0/month** — but it **requires a
  card on file**. If you want to stay strictly card-free, keep using the current
  client-side provisioning (it works on Spark) and skip this folder.
- Set a **budget alert** (e.g. ₹100) so you're never surprised.

---

## Deploy

```bash
# 1. Install the Firebase CLI (once)
npm install -g firebase-tools
firebase login

# 2. From the project root (the folder with firebase.json)
cd functions && npm install && cd ..

# 3. Deploy only the functions
firebase deploy --only functions

# (to also deploy the Firestore rules from this repo)
firebase deploy --only firestore:rules
```

The functions deploy to region **asia-south1 (Mumbai)** — closest to Guwahati.

### Bootstrap the first admin claim (optional, once)
`setAdminClaim` requires the caller to already be an admin, so grant the first one
from the Functions shell:
```bash
firebase functions:shell
# then inside the shell:
setAdminClaim({ email: "admin@iiitg.ac.in" })
```
After that you can change `isAdmin()` in `firestore.rules` to use the claim:
```
function isAdmin() { return request.auth != null && request.auth.token.admin == true; }
```

---

## Wire the web app to call them

Add this helper to the app (e.g. `js/backend/infra/functions.js`), then call it
from the gateway. It falls back to the existing client code if Functions aren't
deployed, so the app keeps working on Spark.

```js
import { getFunctions, httpsCallable } from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { app } from "./firebase.js";                 // your initialised app
const fns = getFunctions(app, "asia-south1");
export const callFn = (name, data) => httpsCallable(fns, name)(data).then(r => r.data);
```

Then in `js/backend/services/staffService.js`, prefer the server path and fall
back to the browser path:

```js
// create
try {
  const r = await callFn("provisionStaff", { kind: "technician", name, email, phone, dept });
  return r; // { uid, email, tempPassword, techId }
} catch (e) {
  // Functions not deployed (Spark) → existing client create()
}

// delete (this is the big win — it removes the real login)
await callFn("deleteStaff", { kind: "technician", id: techId });
```

When `autoAssignOnCreate` is deployed, remove the client-side auto-assign call in
`assignmentService` (the `ticket.created` → `autoAssignTicket` handler) so
assignment happens only on the server.

---

## What this does NOT change
Real-time ticket lists are still read directly from Firestore by the browser (for
live updates). To also **scope those reads** per user (so a student can't read
another student's non-public ticket from the console), the client must query with
`where(userId==me)` / `where(isPublic==true)` and the `tickets` read rule must be
tightened to match. That's a separate client change; ask and I'll wire it in.
