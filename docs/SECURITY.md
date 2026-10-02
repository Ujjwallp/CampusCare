# CampusCare — Security Audit & Hardening

A security review of CampusCare was carried out by attacking a local copy of
the app the way any logged-in user could (browser console + direct Firestore
calls, no special tools). This document lists what was found, how serious each
issue was, how it could be exploited, and what was done to fix it.

The headline point for a grievance app: **client-side hiding is not security.**
Anything a logged-in user's browser is allowed to fetch, that user can read —
the UI filtering it out changes nothing. The fixes move the protection into the
database (Firestore security rules) and into the data model.

## Summary of findings

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | Critical | Confidential grievances readable by any logged-in user | Fixed |
| 2 | Critical | Any user could edit/tamper with any ticket | Fixed |
| 3 | High | All private admin↔user messages readable/forgeable by anyone | Fixed |
| 4 | High | Technician records writable by any logged-in user | Fixed (mostly; see note) |
| 5 | Medium | Technician passwords stored in plaintext | Fixed |
| 6 | Medium | Ticket reporter identity could be spoofed on create | Fixed |
| 7 | Low | `profile_requests` world-readable/writable | Fixed |
| 8 | Low | Attachment URLs not scheme-checked | Noted |
| 9 | Low | Following a shared issue could be confused with increasing its affected count | Fixed in rules and UI |

What was already good: HTML output is consistently escaped (`escapeHtml`) so
stored-XSS via ticket text, names and messages is not possible; admin access is
decided by a server-side e-mail check in the rules, not by anything the client
can set.

---

## 1. Confidential grievances were readable by everyone — CRITICAL

**Before.** All tickets lived in one `tickets` collection with the rule
`allow read: if signedIn()`. Harassment / ragging reports were marked
`confidential` and hidden only by a JavaScript `.filter(...)`. Any student could
open the console and read every confidential complaint — reporter name, e-mail
and description — directly from Firestore.

**Fix.** Confidential reports now live in a **separate `confidential_tickets`
collection** whose rule allows reads only to the Administrator and the person
who filed the report:

```
allow read: if isAdmin() || request.auth.uid == resource.data.userId;
```

The app subscribes the admin to the whole collection and a reporter only to
their own (`where userId == uid`), so no other account's browser ever receives
someone else's confidential ticket. Verified by test: a second student sees
`0` confidential tickets; the reporter and the admin each see their own.

## 2. Any user could tamper with any ticket — CRITICAL

**Before.** `allow update: if signedIn()`. A student could reassign tickets,
mark them Resolved, rewrite descriptions, strip the `confidential` flag or
inflate priority — all from the console.

**Fix.** Ticket updates are now scoped:

- the **admin**, the **reporter**, or the **assigned technician** may edit freely;
- any other campus user may change *only* the "Me too" fields
  (`upvotes`, `upvotedBy`, `followers`, `messages`, `priority`) and *only* on a
  public ticket.
- a campus user may separately add or remove only their own `followerIds` entry
  on a public ticket. Following does not change the affected count.

The assigned-technician check reads the technician doc to match the login, so a
user cannot pretend to be the assignee.

## 3. Private messages were open to everyone — HIGH

**Before.** `admin_messages` was `read, write: if signedIn()`. Any user could
read every private conversation between the admin and every other person, and
forge replies into any thread.

**Fix.** A thread is now visible and writable only to the Administrator and the
thread's owner (`resource.data.senderId == request.auth.uid`).

## 4. Technician records writable by anyone — HIGH

**Before.** `allow write: if isAdmin() || signedIn()` — the `|| signedIn()`
cancelled the admin check, so anyone could create fake technicians or flip
their own status to "On Duty".

**Fix.** Only the admin may create or delete technicians. A technician may
update only their own `status` / `photoUrl`. **Note:** the workload counter
(`activeTasks`) is still writable by any campus user, because auto-assignment
runs on the reporter's browser (no backend). This is a much smaller gap than
before and is flagged in the rules; the complete fix is to move assignment into
a Cloud Function.

## 5. Passwords were stored in plaintext — MEDIUM

**Before.** `staff_credentials` stored each technician's password in cleartext
so the admin could view it. Reset worked by silently re-logging-in as the
technician with that stored password.

**Fix.** Passwords are **no longer stored**. Instead:

- **On creation**, the admin sets an initial temporary password that is shown
  **once** and never saved; the technician must change it on first login.
- **On reset**, the admin triggers a Firebase **password-reset e-mail** to the
  technician, who clicks the link and chooses their own new password. The admin
  never sees or stores it.

`staff_credentials` now holds only a status flag (`temp: true/false`), so even
if it were read there is no secret in it. Verified by test: after a reset the
stored credential document has no `password` field.

## 6. Reporter identity could be spoofed — MEDIUM

**Before.** Create rules didn't pin `userId`, so a ticket could be created with
a fake reporter.

**Fix.** Create is allowed only when
`request.resource.data.userId == request.auth.uid`.

## 7. `profile_requests` world-open — LOW

Tightened: a technician may create a photo-change request; only the admin can
read or resolve it.

## 8. Attachment URLs — LOW (noted)

Attachment links are escaped into attributes (no breakout), and non-image
`data:` URLs won't render as images. As defence-in-depth, attachment opening
could additionally allow-list `https:` and `data:image/` schemes only.

---

## Residual limitations (need a backend to fully close)

These are inherent to a serverless (browser-only) app and are documented rather
than hidden:

1. **Auto-assignment counters** (`technicians.activeTasks`) are writable by any
   campus user because the assignment logic runs client-side. → Cloud Function.
2. **Deleting a technician's login** can't be done from the browser anymore
   (we no longer hold their password). The technician's data is removed and
   their tickets are freed; the admin deletes the leftover Firebase Auth account
   from the console, or via a Cloud Function.
3. **Non-public, non-confidential tickets** are still readable by any signed-in
   user (only *confidential* ones were split out). Giving every private ticket
   the same per-owner protection would need the same collection split or
   Cloud Functions.

## How to deploy the rules

Firebase console → Firestore Database → Rules → paste `firestore.rules` →
**Publish**. Test first in the Rules Playground. Until the rules are published,
the hardening above is not active — the rules file in this repo is the
recommended configuration, not something the app applies on its own.
