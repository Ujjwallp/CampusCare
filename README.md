# CampusCare · IIIT Guwahati

> **Campus Service & Grievance Portal** — everyone at IIIT Guwahati reports campus problems, technicians fix them, and the administration tracks every issue end‑to‑end, in real time.

![Status](https://img.shields.io/badge/status-active-success)
![Stack](https://img.shields.io/badge/stack-Firebase%20%7C%20Vanilla%20JS%20%7C%20PWA-262262)
![License](https://img.shields.io/badge/license-institutional-blue)

CampusCare is a **serverless Progressive Web App**: a fast, installable single‑page app backed by Firebase (Authentication + Firestore) with a thin layer of Cloud Functions for privileged operations. No build step, no framework — precompiled Tailwind CSS and modular vanilla JavaScript organised as a clean Service‑Oriented Architecture.

---

## Table of Contents
- [Who it's for](#who-its-for)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Security](#security)
- [Documentation](#documentation)

---

## Who it's for

| Role | Who | How they sign in |
|---|---|---|
| **Campus User** | Students & faculty | Google sign‑in with the official `@iiitg.ac.in` account |
| **Campus User (provisioned)** | Non‑teaching staff | Phone number or email + password set up by the Admin |
| **Technician / Caretaker** | Maintenance staff | Phone number or email + password set up by the Admin |
| **Administrator** | Warden / HoD / Administrative Officer | Admin username + password |

Every member of the institute can **report any problem on campus** — hostel, academic, Wi‑Fi, water, electrical, grievances and more.

---

## Features

**Report in seconds**
- 3‑step wizard: *what's wrong* (17 categories, ~150 issue types) → *where* (kind of place, then room/spot) → *details* (optional photo + an exact pin on the campus satellite map).
- Your profile auto‑fills the rest. Draft is saved on the device until you submit.

**No duplicate reports**
- CampusCare surfaces matching open issues nearby → press **Me too**. Once enough people join (threshold set by the Admin), the ticket auto‑escalates to **Urgent**.

**Smart auto‑assignment**
- New tickets go to the least‑busy on‑duty technician of the right team. Urgent tickets go to the best performer (speed, on‑time %, rating, current load).

**Live tracking & chat**
- Real‑time status, a chat thread between reporter ↔ technician (the Admin can join), in‑app & push notifications, and a progress timeline (Reported → Assigned → In progress → Fixed).

**Confidential grievances**
- Sensitive complaints (harassment, ragging, faculty grievances) are stored in a separate collection visible only to the reporter and the Administrator — enforced at the database level.

**For technicians**
- Personal work queue, Start work / Mark fixed, materials used, resolution remarks + photo, and directions to the exact spot.

**For the administrator**
- Dashboard & analytics (reported vs fixed, fix‑time, trends), ticket list + map triage, technician workload & performance, campus notices, app rules/settings, staff account management, Lost & Found board, an append‑only audit log, and exportable reports (Excel / PDF).

**Platform**
- Installable **PWA** with offline support, light/dark/auto theme, responsive (mobile bottom‑nav + desktop top‑nav), real‑time sync, and an on‑device Firestore cache for instant loads.

---

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript (ES modules + classic scripts), precompiled **Tailwind CSS**, Lucide icons |
| **Auth & Data** | **Firebase Authentication** + **Cloud Firestore** (v10, modular SDK) with persistent offline cache |
| **Privileged backend** | **Firebase Cloud Functions** (Node 20) — Admin SDK operations |
| **Maps** | Leaflet + leaflet.heat (lazy‑loaded) |
| **Charts** | Chart.js (lazy‑loaded) |
| **Image uploads** | Cloudinary (unsigned preset); confidential media kept inside Firestore |
| **Exports** | SheetJS (Excel), print‑to‑PDF |
| **PWA** | Service worker (network‑first for app code), Web App Manifest |
| **Dev server** | Python `http.server` (`run_server.py`) |

No bundler, no transpiler — the browser runs the source directly.

---

## Architecture

CampusCare follows a **Service‑Oriented Architecture**. The UI never touches Firestore directly; it calls a single **API Gateway** (`window.API`) that composes independent services communicating through an **event bus**.

```
  Presentation (js/frontend)
        │  window.API
        ▼
  API Gateway (js/backend/gateway.js)
        │
        ├── AuthService        UserService       TicketService
        ├── AssignmentService  StaffService      MessageService
        ├── FileService        NoticeService     SettingsService
        └── AuditService               ▲ events (core/eventBus.js)
                                        │
                      Firebase (Auth + Firestore)  ·  Cloudinary
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for diagrams, the full service catalogue, data model and design decisions.

---

## Project structure

```
CampusCare/
├── index.html                  # single entry point (SPA shell)
├── sw.js                       # service worker (PWA, offline)
├── manifest.webmanifest        # PWA manifest
├── run_server.py / start.command   # local dev server
├── firebase.json / .firebaserc     # Firebase project config
├── firestore.rules             # database security rules
├── tailwind.config.js
├── assets/
│   ├── css/  tailwind.css · style.css
│   └── img/  logos, icons, campus imagery
├── functions/                  # Cloud Functions (privileged ops)
│   ├── index.js · package.json · README.md
├── docs/                       # ARCHITECTURE · SECURITY · SRS · MEDIA_SETUP
└── js/
    ├── shared/     catalog.js            # categories, teams, place types
    ├── backend/
    │   ├── gateway.js                    # window.API facade
    │   ├── core/   config · eventBus · helpers
    │   ├── infra/  firebase.js           # SDK init + persistent cache
    │   └── services/ (10 services)
    └── frontend/
        ├── app.js                        # bootstrap, live feeds
        ├── core/   state · theme · utils
        └── ui/     (14 view modules)
```

---

## Run locally

```bash
cd CampusCare
python3 run_server.py        # serves http://localhost:5500 (no‑cache)
```
…or double‑click `start.command` on macOS. Then open **http://localhost:5500**.

- **Campus users** sign in with their `@iiitg.ac.in` Google account.
- **Admin** signs in from the Admin tab (default username `admin@iiitg.ac.in`).
- **Staff / technicians** sign in with the phone/email + password the Admin provisions for them.

> A live server is required because the app uses ES modules — opening `index.html` as a `file://` won't work.

---

## Configuration

| What | Where |
|---|---|
| Problem categories, teams, issue types, place kinds, materials | `js/shared/catalog.js` |
| Admin emails, campus domain, Cloudinary cloud name + upload preset | `js/backend/core/config.js` |
| Me‑too threshold, "late" hours, auto‑assign toggle | In‑app: **Manage → Settings** |
| Firebase project (apiKey, projectId…) | `js/backend/infra/firebase.js` |
| Database rules | `firestore.rules` |

> The Firebase web **apiKey is public by design** — it identifies the project, not a secret. Data is protected by the Firestore security rules, not by hiding the key. Never commit service‑account keys or the Cloudinary API **secret** (see `.gitignore`).

---

## Deployment

**Database rules** (required): Firebase Console → Firestore → Rules → paste `firestore.rules` → **Publish**. Or:
```bash
firebase deploy --only firestore:rules
```

**Cloud Functions** (optional, requires the **Blaze** plan):
```bash
cd functions && npm install
firebase deploy --only functions
```
Functions provide privileged operations the browser can't do safely — atomic staff provisioning, real account deletion, and server‑side auto‑assignment. See `functions/README.md`.

**Hosting**: the app is static — host `index.html` + `assets/` + `js/` on Firebase Hosting, GitHub Pages, Netlify, or any static host. (Enable public email/password sign‑up **off** in Firebase Auth; staff are admin‑provisioned.)

---

## Security

- **Scoped reads** — a student can only read their own tickets, public ("Me too") tickets, and tickets assigned to them; confidential grievances are reader‑limited to the reporter and Admin.
- **Field‑level write rules** — reporters and technicians may change only the specific fields their workflow needs; ownership, confidentiality and timestamps are immutable.
- **Verified identity** — campus rights require a verified Google `@iiitg.ac.in` account; staff logins are admin‑provisioned.
- **Privileged ops in Cloud Functions** — account creation/deletion run server‑side with the Admin SDK.
- **No plaintext passwords, no secrets in the repo.**

Full threat model and rule‑by‑rule rationale: **[docs/SECURITY.md](docs/SECURITY.md)**.

---

## Documentation

| Doc | Contents |
|---|---|
| **[docs/SRS.md](docs/SRS.md)** | Software Requirements Specification (functional + non‑functional requirements) |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Architecture, service catalogue, data model, design decisions |
| **[docs/SECURITY.md](docs/SECURITY.md)** | Security model, Firestore rules, threat mitigations |
| **[docs/MEDIA_SETUP.md](docs/MEDIA_SETUP.md)** | Cloudinary / media upload setup |
| **[functions/README.md](functions/README.md)** | Cloud Functions deploy & wiring |

---

<p align="center"><sub>Built for the Indian Institute of Information Technology Guwahati · Bongora, Assam</sub></p>
