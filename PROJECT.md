# Project: QuizFocus MCQ Platform Refinement & Production Readiness

## Architecture
The platform is organized as a multi-package monorepo containing:
- **Frontend Workspaces**:
  - `apps/desktop-web`: React 18, Vite 5, Tailwind CSS v4, Zustand 4.5, Sonner, KaTeX. Main desktop portal for quiz creation, examination, live analytics, and community.
  - `apps/mobile-web`: Secondary mobile portal.
- **Backend Microservices (`services/`)**:
  - `api-gateway` (Port 5000): Express 4, `http-proxy-middleware`, routes REST and WebSockets.
  - `auth-service` (Port 5001): JWT session authentication, user profiles, preferences.
  - `quiz-service` (Port 5002): Quiz creation, question bank, tagging, search.
  - `parser-service` (Port 5003): Ingestion and parsing of CSV/XLSX quiz files.
  - `attempt-service` (Port 5004): Exam attempts, submission evaluation, timing, scoring.
  - `social-service` (Port 5005): Discovery, explore feed, creator following, user public profiles.
  - `message-service` (Port 5006): Socket.IO direct messaging and notifications.
  - `media-service` (Port 5007): Image uploads, Sharp optimization, asset delivery.
  - `admin-service` (Port 5008): Moderation, issue reports, platform health logs.
  - `challenge-service` (Port 5009): Multiplayer arenas, duels, real-time leaderboard aggregation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Strict Orange & Dark Neutral Palette | Replace 222 unapproved hex codes (blues, purples, greens, cool slate) with pure Orange (`#FF4500`), dark neutral glass (`#121214`, `#18181B`), and true black (`#000000`). Fix light mode bleed in `AIWorkspace.jsx` and `NavigatorSidebar.jsx`. | M1 | survey_ui |
| F2 | Apple-Inspired Animation & Interaction Polish | Enforce `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, $\le 300\text{ms}$ duration, transform/opacity only (remove `width` animation in `Sidebar.css`), uniform `:active { transform: scale(0.97); }`, and replace native `alert()` calls with `sonner` toasts. | M1 | survey_ui |
| F3 | Microservices Security Hardening | Add missing auth on `admin-service/reports/submit`, configure `process.on('unhandledRejection')` and `uncaughtException` across all 10 services, sanitize 500 error messages to prevent leakage, and eliminate hardcoded static JWT secrets. | M2 | survey_backend |
| F4 | Performance Bottleneck Remediation | Refactor `social-service` `getExplore` from full in-memory array loading/scoring to MongoDB aggregation pipeline with index-backed pagination. Fix missing DB indexes and unbounded queries. | M2 | survey_backend |
| F5 | Wire Feedback & Issue Reporting | Connect `HelpSettings.jsx` and `PublicProfile.jsx` report actions to backend `POST /api/v1/admin/reports/submit` with genuine persistence. | M3 | survey_ui / survey_backend |
| F6 | Wire Attempt History & Profile Endpoints | Fix `AttemptService.getUserAttempts()` route mismatch (frontend calls `GET /attempts` vs backend route gap) and `AuthService.updateProfile()` HTTP method (`PUT` vs `PATCH`). | M3 | survey_ui / survey_backend |
| F7 | Wire Preferences & Privacy Persistence | Wire take-quiz `SettingsDrawer.jsx` (sound cues, auto-advance) to backend user preferences. Enforce `searchDiscovery`, `allowMessagesFrom`, `hideCompletedQuizzes`, and `showOnLeaderboard` in backend queries. | M3 | survey_ui / survey_backend |
| F8 | Fix Dead-End Routes & Redundant Requests | Fix `ActivitySettings.jsx` result routing (`/result/${attemptId}` instead of activity ID) and eliminate guaranteed 404 in `Challenges.jsx`. | M3 | survey_ui |
| F9 | Fix Render Container Builds & Port Binding | Remove `"mcq-platform-root": "file:../.."` dependency from `message-service`, `parser-service`, and `social-service`. Bind services to `0.0.0.0` and dynamic `PORT`. Fix `media-service` missing env crash and `quiz-service` unused env crash. | M4 | survey_devops |
| F10 | Configure Cross-Domain CORS & Cookies | Implement `CORS_ALLOWED_ORIGINS` across all services. Update auth cookies to `sameSite: 'none'`, `secure: true` for decoupled Vercel + Render operation. | M4 | survey_devops / survey_backend |
| F11 | Vercel Deployment Readiness & Config | Add `vercel.json` SPA rewrites to `apps/desktop-web`. Make `VITE_API_URL` and `VITE_DEV_PORT` configurable without build failure. Configure API client for dynamic production backend URL. | M4 | survey_devops |
| F12 | Root Test Runner & Gateway Tests | Add root `npm test` script. Fix `api-gateway` test suite imports. Ensure all microservice unit tests pass cleanly. | M4 | survey_devops |
| F13 | E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box test suite verifying all 12 features across unit, boundary, combinatorial, and realistic application scenarios. | M5 | test_track |
| F14 | 100% E2E Pass & Adversarial Hardening (Tier 5) | Validate 100% of E2E tests pass, followed by white-box adversarial stress testing with challenger agents. | M5 | project_pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | UI Simplification & Strict Palette Refinement | Refactor `apps/desktop-web` styling, tokens, color palette to strict #FF4500 and dark neutrals, Apple motion standards, sonner toasts | none | PLANNED |
| M2 | Security Vulnerability Remediation & Performance Optimization | Harden all 10 microservices against vulnerabilities, error crashes, data leaks, and refactor `social-service` memory bottleneck | none | PLANNED |
| M3 | Wire Disconnected Features & Backend Persistence | Wire all 16 audited UI toggles, feedback forms, and profile/attempt routes to real backend endpoints and MongoDB persistence | M1, M2 | PLANNED |
| M4 | Production Deployment Readiness (Render & Vercel) | Docker build fixes, CORS_ALLOWED_ORIGINS, sameSite cookie config, vercel.json, dynamic API URLs, root test runner | M2, M3 | PLANNED |
| M5 | E2E Testing Suite & Adversarial Hardening | Implement E2E test infra (Tiers 1-4), verify 100% pass rate, and perform Tier 5 adversarial coverage hardening | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### Frontend ↔ Auth Service (`POST /api/v1/auth/*`, `PATCH /api/v1/auth/me`)
- Request: `PATCH /api/v1/auth/me` with `preferences: { soundCues, autoAdvance, searchDiscovery, allowMessagesFrom, hideCompletedQuizzes, showOnLeaderboard, defaultDifficulty, primaryCategory }`
- Response: `{ success: true, data: userDoc }`
- Headers: `Authorization: Bearer <token>` or session cookie.

### Frontend ↔ Attempt Service (`GET /api/v1/attempts`, `POST /api/v1/attempts/start`, `POST /api/v1/attempts/:id/submit`)
- `GET /api/v1/attempts?page=1&limit=20`: Returns `{ success: true, data: [attemptSummary], pagination }`
- `GET /api/v1/attempts/:id/result`: Returns detailed score, answers, explanations.

### Frontend ↔ Admin Service (`POST /api/v1/admin/reports/submit`)
- Endpoint: `POST /api/v1/admin/reports/submit`
- Middleware: `optionalAuth` (attaches `req.user` if authenticated, allows guest reports if session token present)
- Body: `{ targetType: 'quiz' | 'user' | 'feedback', targetId: string, reason: string, details?: string }`
- Response: `{ success: true, message: 'Report submitted successfully', reportId: string }`

### Gateway & Services ↔ Deployment Config
- `PORT`: Required dynamic port binding from environment (`process.env.PORT || defaultPort`).
- `HOST`: `'0.0.0.0'` for container binding.
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins or `*` in dev, verified against `req.headers.origin`.
- Cookies: `sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'`, `secure: process.env.NODE_ENV === 'production'`.

## Code Layout
- `apps/desktop-web/`:
  - `src/index.css`: Global CSS variables, design tokens, `@theme`, squircle styles.
  - `src/pages/`: Page components (`take-quiz/`, `explore/`, `settings/`, `profile/`, `challenges/`, etc.).
  - `src/components/`: Shared components (`layout/`, `ui/`, `quiz/`, `common/`).
  - `src/api/`: Axios client and service API modules (`axios.js`, `auth.service.js`, `attempt.service.js`, etc.).
  - `src/store/`: Zustand stores.
- `services/`:
  - `api-gateway/src/`: Reverse proxy, route maps, CORS, rate limits.
  - `auth-service/src/`: Auth routes, controllers, User model, JWT middleware.
  - `quiz-service/src/`: Quiz CRUD, Question models, search.
  - `attempt-service/src/`: Attempt evaluation, scoring, attempt history routes.
  - `social-service/src/`: Explore feed, aggregation pipeline, social graph.
  - `admin-service/src/`: Report submission, moderation, health.
  - `message-service/src/`, `media-service/src/`, `challenge-service/src/`, `parser-service/src/`.
- `tests/e2e/`: End-to-end opaque-box test runner and test suites (Tiers 1-4).
