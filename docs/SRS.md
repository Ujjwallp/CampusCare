# Software Requirements Specification (SRS)
## CampusCare — Campus Service & Grievance Portal, IIIT Guwahati

**Version:** 1.0 · **Status:** Baseline · **Prepared for:** Indian Institute of Information Technology Guwahati

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [External Interface Requirements](#3-external-interface-requirements)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Requirements](#6-data-requirements)
7. [Appendices](#7-appendices)

---

## 1. Introduction

### 1.1 Purpose
This document specifies the software requirements for **CampusCare**, a web‑based campus service and grievance‑management platform for IIIT Guwahati. It defines the functional and non‑functional requirements, external interfaces, and data model, and serves as the agreed reference for development, verification and future maintenance.

### 1.2 Scope
CampusCare lets every member of the institute — students, faculty, and non‑teaching staff — report problems anywhere on campus (infrastructure, IT, hostel, academic, grievances, etc.), track them in real time, and communicate with the maintenance staff assigned to fix them. Technicians manage their work queue; the administration oversees the entire lifecycle with dashboards, assignment, analytics, notices and reports. The system is a serverless Progressive Web App backed by Firebase, with a thin Cloud Functions layer for privileged operations.

Out of scope: payroll, procurement/inventory accounting, and integration with external ERP systems.

### 1.3 Definitions, Acronyms and Abbreviations
| Term | Meaning |
|---|---|
| **Ticket** | A reported problem tracked through its lifecycle |
| **Me‑too** | Joining an existing public ticket instead of filing a duplicate |
| **Confidential ticket** | A sensitive grievance visible only to the reporter and Admin |
| **Campus user** | A student, faculty member, or provisioned non‑teaching staff who reports issues |
| **Technician** | Maintenance/caretaker staff who resolve tickets |
| **SOA** | Service‑Oriented Architecture |
| **PWA** | Progressive Web App |
| **SDK** | Software Development Kit |
| **QoS** | Quality of Service |

### 1.4 References
- IEEE Std 830‑1998 — Recommended Practice for Software Requirements Specifications
- `docs/ARCHITECTURE.md`, `docs/SECURITY.md` (companion documents)
- Firebase Authentication & Cloud Firestore documentation

### 1.5 Overview
Section 2 gives the overall product description and user classes. Section 3 defines external interfaces. Section 4 lists functional requirements (uniquely identified **FR‑n**). Section 5 lists non‑functional requirements (**NFR‑n**). Section 6 describes the data model.

---

## 2. Overall Description

### 2.1 Product Perspective
CampusCare is a self‑contained, serverless single‑page application. The browser runs modular vanilla JavaScript directly (no build step); data and authentication are provided by Firebase; privileged server‑side actions run as Firebase Cloud Functions. The UI communicates only through an **API Gateway** facade that composes ten services over an event bus (see `docs/ARCHITECTURE.md`).

### 2.2 Product Functions (summary)
- Role‑based authentication (campus user, technician, administrator).
- Guided problem reporting with category, location, map pin and photo.
- Duplicate detection and "Me‑too" escalation.
- Automatic and manual ticket assignment to technicians.
- Technician resolution workflow and reporter feedback.
- Real‑time chat and notifications.
- Confidential grievance handling.
- Administrative dashboards, analytics, notices, staff management, audit log and exports.

### 2.3 User Classes and Characteristics
| Class | Characteristics | Privileges |
|---|---|---|
| **Student / Faculty** | Verified `@iiitg.ac.in` Google account | Report, me‑too, chat, rate, reopen own tickets |
| **Non‑teaching staff** | Admin‑provisioned account | Same reporting rights as campus users |
| **Technician** | Admin‑provisioned account, belongs to a team | View/claim/resolve assigned tickets, chat |
| **Administrator** | Trusted account | Full oversight: assign, manage staff, settings, notices, reports, confidential tickets |

### 2.4 Operating Environment
- **Client:** any modern evergreen browser (Chrome, Edge, Firefox, Safari) on desktop or mobile; installable as a PWA.
- **Backend:** Google Firebase (Authentication, Cloud Firestore, optional Cloud Functions on the Blaze plan); Cloudinary for image hosting.
- **Network:** HTTPS; functions degrade gracefully offline via the on‑device Firestore cache.

### 2.5 Design and Implementation Constraints
- No server application of its own (serverless); privileged logic limited to Cloud Functions.
- Security must be enforced at the database layer (Firestore rules), not only in the UI.
- No build toolchain — source must run in the browser as‑is.
- Confidential data must never be readable by non‑authorised accounts, even via the raw API.
- The Firebase web API key is public; secrets (service accounts, Cloudinary secret) must never be committed.

### 2.6 Assumptions and Dependencies
- Users have institute Google accounts (campus users) or admin‑provisioned credentials (staff).
- Firebase and Cloudinary services are available.
- Cloud Functions features (atomic provisioning, server‑side assignment) require the Blaze plan; without them the app falls back to browser‑side equivalents within the limits the rules allow.

---

## 3. External Interface Requirements

### 3.1 User Interfaces
- Responsive SPA: mobile bottom navigation, desktop top navigation.
- Light / dark / auto (system) theme.
- Guided multi‑step report wizard, interactive campus map (Leaflet), chat drawer, admin dashboards with charts.
- Accessibility: semantic roles, ARIA live regions for status, keyboard‑operable controls.

### 3.2 Hardware Interfaces
- Device camera/photo library (optional attachment upload).
- Device geolocation (optional "use my location" for the map pin).

### 3.3 Software Interfaces
- **Firebase Authentication** — Google sign‑in and email/password.
- **Cloud Firestore** — real‑time document database (`onSnapshot` listeners, persistent cache).
- **Firebase Cloud Functions** — callable + Firestore‑trigger functions.
- **Cloudinary** — unsigned image upload API.
- **Leaflet / ArcGIS tiles**, **Chart.js**, **SheetJS** — maps, charts, Excel export.

### 3.4 Communication Interfaces
- All traffic over HTTPS/TLS.
- Real‑time updates via Firestore's streaming protocol.
- Web Push / in‑app notifications via the service worker.

---

## 4. Functional Requirements

### 4.1 Authentication & Authorisation
- **FR‑1** The system shall let students/faculty sign in only with a verified Google account on the `@iiitg.ac.in` domain.
- **FR‑2** The system shall let technicians and non‑teaching staff sign in with a phone number or email and an admin‑set password.
- **FR‑3** The system shall authenticate the administrator via a dedicated admin account and deny campus/staff access to admin functions.
- **FR‑4** The system shall support password reset via email and enforce a temporary‑password change on first staff login.
- **FR‑5** The system shall keep concurrent student/technician/admin sessions isolated on the same device.

### 4.2 Problem Reporting
- **FR‑6** A reporter shall create a ticket by selecting a category and issue type (from the configured catalogue), a place kind and spot, and optionally a photo and a map pin.
- **FR‑7** The system shall restrict map pins to within the campus boundary.
- **FR‑8** The system shall auto‑fill reporter identity (name, email, department) and record creation time.
- **FR‑9** The system shall save an in‑progress report as a local draft until submission.
- **FR‑10** The system shall mark certain issue types as urgent or confidential automatically per the catalogue.

### 4.3 Duplicate Detection & Me‑too
- **FR‑11** Before submission, the system shall show open public tickets of the same type nearby (same zone or within a set radius).
- **FR‑12** A user shall join an existing public ticket ("Me too") instead of filing a duplicate, increasing its affected count by exactly one.
- **FR‑13** The system shall auto‑escalate a public ticket to Urgent when the affected count reaches the admin‑configured threshold.

### 4.4 Assignment
- **FR‑14** The system shall assign a new non‑confidential ticket to the least‑busy on‑duty technician of the matching team.
- **FR‑15** For urgent tickets, the system shall prefer the best‑performing available technician (speed, on‑time rate, rating, load).
- **FR‑16** The administrator shall manually (re)assign any ticket to any technician.
- **FR‑17** The system shall never assign confidential tickets automatically; the administrator handles them.

### 4.5 Technician Workflow
- **FR‑18** A technician shall view a personal queue of tickets assigned to them.
- **FR‑19** A technician shall acknowledge a ticket ("Start work"), moving it to In Progress.
- **FR‑20** A technician shall mark a ticket resolved with remarks, optional photo, and materials used.
- **FR‑21** A technician shall view directions to the exact reported spot.

### 4.6 Communication
- **FR‑22** The reporter and the assigned technician shall exchange messages on a ticket; the administrator may join any thread.
- **FR‑23** The system shall deliver real‑time and push notifications for status changes and new messages.
- **FR‑24** The system shall close a resolved ticket's chat to the reporter until it is reopened.

### 4.7 Feedback & Reopen
- **FR‑25** The reporter shall rate a resolved ticket (1–5).
- **FR‑26** The reporter shall reopen a resolved ticket with a reason, returning it to the queue/technician.

### 4.8 Confidential Grievances
- **FR‑27** The system shall store confidential complaints in a separate collection readable only by the reporter and the administrator.
- **FR‑28** Confidential media shall be stored privately (not on public image URLs).

### 4.9 Administration
- **FR‑29** The administrator shall view dashboards and analytics (reported vs fixed, trends, fix‑time).
- **FR‑30** The administrator shall triage tickets via a list and a campus map.
- **FR‑31** The administrator shall provision, reset and remove technician and non‑teaching‑staff accounts.
- **FR‑32** The administrator shall view technician workload and performance.
- **FR‑33** The administrator shall post and end campus‑wide notices.
- **FR‑34** The administrator shall configure the me‑too threshold, "late" duration and auto‑assign toggle.
- **FR‑35** The administrator shall export reports to Excel and PDF.

### 4.10 Lost & Found
- **FR‑36** Users shall post and browse lost/found items on a public board.

### 4.11 Audit Trail
- **FR‑37** The system shall record an append‑only audit entry for significant actions, readable only by the administrator and not editable or deletable.

---

## 5. Non-Functional Requirements

### 5.1 Performance (speed)

**Measured payload** (actual build, gzip = bytes transferred over the wire):

| Resource | Raw | Gzipped |
|---|---:|---:|
| HTML (`index.html`) | 112 KB | 23 KB |
| CSS (Tailwind + custom) | 76 KB | 15 KB |
| Application JavaScript (34 modules) | 359 KB | 114 KB |
| **Initial code payload** | **≈ 533 KB** | **≈ 148 KB** |
| Maps (Leaflet + heat) | — | ≈ 45 KB *(lazy, on demand)* |
| Charts (Chart.js) | — | ≈ 70 KB *(lazy, admin only)* |

Heavy libraries are **not** in the initial load — a student who only reports/chats never downloads the ~115 KB of maps + charts.

**Performance targets** (first visit over a typical 4G link ≈ 10 Mbps, 50 ms RTT; repeat visits use the service‑worker + on‑device Firestore cache):

| Metric | Target |
|---|---|
| First Contentful Paint | ≤ 1.5 s (first visit) |
| Time to Interactive | ≤ 2.5 s first visit · ≤ 0.8 s repeat |
| Cached‑data render (repeat visit) | ≤ 200 ms, before the network confirms |
| Real‑time update propagation | 100–500 ms end‑to‑end |
| Write round‑trip (chat / acknowledge) | ≤ 300 ms to server confirmation |
| UI re‑render | coalesced to one animation frame (~16 ms) per batch |

- **NFR‑1** The initial gzipped code payload shall not exceed **160 KB**; theme shall be applied before first paint (no flash).
- **NFR‑2** On repeat visits the app shall render cached data within **200 ms** from the on‑device Firestore cache, before the network round‑trip completes.
- **NFR‑3** Non‑critical libraries (maps, charts) shall load on demand only, keeping the initial download under the budget above.
- **NFR‑4** Live changes shall propagate to other clients within **~0.5 s** under normal network conditions, and UI re‑renders shall be coalesced to one frame per batch of data changes.

### 5.2 Security
- **NFR‑5** All data access shall be enforced by Firestore security rules at the database layer, independent of the UI.
- **NFR‑6** Reads shall be scoped so a user cannot read another user's private ticket; confidential tickets are reader‑limited to the reporter and Admin.
- **NFR‑7** Writes shall be field‑scoped; ownership, confidentiality and creation time shall be immutable to non‑admins.
- **NFR‑8** Privileged operations (account creation/deletion) shall run only in Cloud Functions with the Admin SDK.
- **NFR‑9** No plaintext passwords or service secrets shall be stored in the database or source repository.
- **NFR‑10** All transport shall be encrypted (HTTPS/TLS).

### 5.3 Reliability & Availability
- **NFR‑11** Real‑time listeners shall auto‑reconnect with exponential backoff after transient network loss.
- **NFR‑12** The app shall remain usable for reading cached data while offline.

### 5.4 Usability & Accessibility
- **NFR‑13** The interface shall be responsive across phone and desktop.
- **NFR‑14** Interactive controls shall be keyboard‑operable and expose appropriate ARIA semantics.
- **NFR‑15** Light, dark and system themes shall be supported.

### 5.5 Scalability & Maintainability
- **NFR‑16** The architecture shall be service‑oriented, with the UI decoupled from data access via the API gateway and event bus.
- **NFR‑17** Domain configuration (categories, teams, places) shall be data‑driven in a single catalogue file.

### 5.6 Portability
- **NFR‑18** Being static, the app shall deploy to any static host; the backend is Firebase‑managed.
- **NFR‑19** The app shall be installable as a PWA with a service worker and manifest.

### 5.7 Capacity and Scalability (load the app can handle)

CampusCare is serverless; its capacity is that of the managed Firebase platform, which the app inherits automatically. The figures below are Google Cloud Firestore / Firebase Authentication **documented platform limits**.

| Dimension | Capacity |
|---|---|
| Registered users (Firebase Authentication) | Millions — far beyond an institute's few‑thousand users |
| Concurrent real‑time listeners (Firestore) | Up to **1,000,000** simultaneous connections per database |
| Sustained write throughput (database‑wide) | ≈ **10,000 writes/sec** (scales further on request) |
| Writes to a single document | 1/sec sustained (≈ 500/sec burst) |
| Reads / storage | Scale automatically (TB‑scale storage) on the Blaze plan |
| Cloud Functions concurrency | Configurable (default `maxInstances = 10`) |

**Institute‑scale sizing.** For IIIT Guwahati (on the order of 10³–10⁴ users), expected peak is a few hundred simultaneous active sessions — under **0.1%** of Firestore's one‑million concurrent‑connection limit, and far below its write throughput — leaving very large headroom. The on‑device cache sharply cuts repeat reads, so small deployments can run within the free (Spark) tier quotas (50,000 reads/day, 20,000 writes/day); the paid (Blaze) plan removes all quota ceilings for production.

- **NFR‑20** The system shall support at least **5,000 registered users** and **500 concurrent active sessions** with no architectural change.
- **NFR‑21** A single ticket shall accept thousands of "Me too" joins over its lifetime, bounded only by Firestore's 1‑write/second per‑document limit.
- **NFR‑22** The system shall scale horizontally through Firebase with no code change, up to the platform limits above.

---

## 6. Data Requirements

Primary Firestore collections (documents hold the fields their rules allow):

| Collection | Purpose |
|---|---|
| `tickets` | Public/normal tickets (reporter, category, location, status, assignment, messages, me‑too) |
| `confidential_tickets` | Sensitive grievances (reporter + Admin only) |
| `technicians` | Technician records (team, status, load, login uid) |
| `campus_members` | Non‑teaching staff reporter records |
| `users` | User profiles and provisioned‑access flags |
| `staff_credentials` | Staff credential status flags (never passwords) |
| `staff_phone_index` | Phone → login‑email resolution for phone sign‑in |
| `admin_messages` | Direct user ↔ administrator threads |
| `notices` | Campus‑wide announcements |
| `settings` | App configuration (thresholds, toggles) |
| `profile_requests` | Technician photo‑change requests |
| `audit_log` | Append‑only action history (Admin‑readable) |

Key entity — **Ticket**: `id`, `userId`, `userEmail`, `category`, `subCategory`, `location`, `lat/lng`, `status` (Pending → In Progress → Resolved), `priority`, `assignedTo`, `assignedToEmail`, `upvotes`/`upvotedBy`, `messages[]`, `createdAt`, resolution fields.

---

## 7. Appendices

**A. Ticket lifecycle:** Reported → (Assigned) → In Progress → Resolved → (Reopened → …).

**B. Traceability:** each requirement (FR‑n / NFR‑n) maps to a service in `docs/ARCHITECTURE.md` and, where applicable, a rule in `firestore.rules`.

**C. Future enhancements:** full migration of browser‑side assignment to Cloud Functions; per‑ticket chat sub‑collection to further isolate message/contact data on public tickets; SLA timers and escalation workflows.

---

<p align="center"><sub>CampusCare SRS v1.0 · IIIT Guwahati</sub></p>
