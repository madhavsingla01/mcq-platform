# 📚 QuizFocus Documentation & Plans Repository

Welcome to the centralized documentation hub for QuizFocus (`mcq-platform`). All architectural plans, specifications, trackers, and user guides are stored and maintained here.

---

## 🗂️ Documentation Directory Structure

```
docs/
├── README.md                          # Master documentation index (This file)
├── PROJECT_TRACKER.md                 # Master project status & checkpoint tracker
│
├── plans/                             # Architectural Specifications & Roadmaps
│   ├── admin_panel_plan.md            # Admin Control Center & Microservice Plan
│   ├── messaging_upgrade_plan.md      # Real-Time WhatsApp/IG-Style Messaging Plan
│   ├── quiz_id_symbol_search_plan.md  # Symbolic Quiz Codes (!QZ-XXXXXX) & Fast Search Plan
│   └── mobile_redesign_report.md      # Dedicated Mobile Web Client (Port 5174) Report
│
├── architecture/                      # Core Engineering Guidelines & Standards
│   ├── AGENTS.md                      # Emil Kowalski & Apple Design Engineering Principles
│   ├── SECURITY_AND_LOGIC.md          # Security, CSRF, JWT, and Attempt Logic
│   └── PROGRESS.md                    # Initial Architecture Progress Log
│
└── guides/                            # Operational & Developer Manuals
    └── ADMIN_GUIDE.md                 # Admin Control Center Usage & Role Management
```

---

## 📑 Quick Reference by Category

### 1. Active Trackers & Status

| Document | Path | Description |
| :--- | :--- | :--- |
| **Project Tracker** | [`PROJECT_TRACKER.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/PROJECT_TRACKER.md) | Comprehensive milestone tracker detailing completed checkpoints (CP-01 through CP-14), current state, and backlog. |

---

### 2. Architectural Plans & Specifications (`docs/plans/`)

| Document | File Link | Focus Area |
| :--- | :--- | :--- |
| **Challenges Architecture & Roadmap** | [`CHALLENGES_ARCHITECTURE_AND_ROADMAP.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/plans/CHALLENGES_ARCHITECTURE_AND_ROADMAP.md) | Deep dive into Challenge mechanics: 10-question limits, strict timers, single attempt locks, dense rankings, routes, and anti-cheat architecture. |
| **Admin Panel Master Plan** | [`admin_panel_plan.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/plans/admin_panel_plan.md) | Blueprint for the dedicated `admin-service` microservice (:5008), RBAC, immutable audit logging, user suspensions, and moderation queue. |
| **Messaging Service Overhaul** | [`messaging_upgrade_plan.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/plans/messaging_upgrade_plan.md) | WhatsApp & Instagram benchmark for bidirectional Socket.IO chat, presence tracking, typing indicators, read receipts, and mobile inbox. |
| **Symbolic Quiz Codes & Fast Search** | [`quiz_id_symbol_search_plan.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/plans/quiz_id_symbol_search_plan.md) | Fast-path syntax (`!` for quizzes, `@` for creators, `#` for topics) and `!QZ-XXXXXX` symbolic codes with sparse B-tree indexing. |
| **Mobile Redesign Report** | [`mobile_redesign_report.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/plans/mobile_redesign_report.md) | Architecture report on the standalone mobile-first web frontend (`apps/mobile-web` on port 5174) with 48px touch targets and bottom rail. |

---

### 3. Engineering Guidelines & Security (`docs/architecture/`)

| Document | File Link | Focus Area |
| :--- | :--- | :--- |
| **Design Engineering (AGENTS.md)** | [`AGENTS.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/architecture/AGENTS.md) | Emil Kowalski motion principles, Apple G2 squircle tokens, physics curves (`--ease-out`), tactile `:active` feedback, and mobile ergonomics. |
| **Security & Logic** | [`SECURITY_AND_LOGIC.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/architecture/SECURITY_AND_LOGIC.md) | Secure cookie sessions, double-submit CSRF protection, token versioning, attempt result resolution, and anti-tamper scoring. |
| **Progress Log** | [`PROGRESS.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/architecture/PROGRESS.md) | Baseline log of early microservices milestones and frontend consolidation. |

---

### 4. Operational Manuals & Guides (`docs/guides/`)

| Document | File Link | Focus Area |
| :--- | :--- | :--- |
| **Admin Operator Guide** | [`ADMIN_GUIDE.md`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/docs/guides/ADMIN_GUIDE.md) | How to access `/admin`, promote users to super-admin via CLI script, suspend accounts with audited reasons, triage reports, and inspect latency. |

---

## 🛠️ Microservices Ecosystem Quick Reference

| Service | Port | Directory | Primary Role |
| :--- | :---: | :--- | :--- |
| **API Gateway** | `5000` | `services/api-gateway` | Reverse proxy, security perimeter, WebSocket forwarder |
| **Auth Service** | `5001` | `services/auth-service` | User identity, JWT sessions, profiles, passwords |
| **Quiz Service** | `5002` | `services/quiz-service` | Quizzes, timed challenges, `!QZ-XXXXXX` codes, tags, search |
| **Parser Service** | `5003` | `services/parser-service` | Document extraction (Excel, CSV, PDF, Word, Images) |
| **Attempt Service** | `5004` | `services/attempt-service` | Quiz attempts, timers, suspicious activity, scoring |
| **Social Service** | `5005` | `services/social-service` | Comments, reactions, follows, notifications, activity feeds |
| **Message Service** | `5006` | `services/message-service` | Real-time chat, Socket.IO presence, typing indicators |
| **Media Service** | `5007` | `services/media-service` | Image uploads, compression, asset serving |
| **Admin Service** | `5008` | `services/admin-service` | Operations, RBAC, suspensions, moderation, audit trail |
| **Desktop Web** | `5173` | `apps/desktop-web` | Full-featured desktop frontend + Admin Control Center |
| **Mobile Web** | `5174` | `apps/mobile-web` | Lightweight touch-first mobile client |
