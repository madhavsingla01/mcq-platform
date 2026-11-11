# Testing architecture and quality gates

**Baseline recorded:** 2026-11-09

## Starting state

The repository was at `abd655b` with extensive pre-existing uncommitted changes across account/authentication, media and UI work. Those changes were preserved; no reset, real-database cleanup or commit was performed. At the start there was no CI workflow and no root aggregate test command. Existing tests ran through Node's built-in runner and Jest, while separate frontend builds and an isolated integration runner were available. An untouched-HEAD full-suite result was not captured, so the results below are final verification—not a claim that every count is a before/after comparison. Prior notes identified obsolete Gateway tests and a local `mongod` PATH assumption; the Gateway assertions were replaced with current contracts, and integration is run with an explicit binary path where needed.

## Local commands

| Command | Scope |
|---|---|
| `npm run test:unit` | Root Node unit and contract checks |
| `npm run test:services` | Gateway, Attempt, Parser, Quiz, Social and Media service tests |
| `npm run test:media:ui` | Media accessibility UI checks |
| `npm run test:ci` | Unit, service and media UI suites, then desktop and mobile production builds |
| `npm run test:integration` | Starts all services against a disposable local MongoDB, runs the legacy E2E checks and Node integration tests, then cleans up |
| `npm run security:audit` | Audits all 12 app/service lockfiles and blocks critical or unexcepted high findings |

Set `MONGOD_BINARY` when `mongod` is not on `PATH`. The integration runner creates its own temporary database directory and signing keys. It does not read application database URIs or drop application databases.

## Verification inventory

The local `npm run test:ci` pass covered 31 root checks, 114 service tests, four media accessibility UI tests, and successful desktop and mobile production builds. Service test counts were Gateway 2, Attempt 19, Parser 18, Quiz 67, Social 5 and Media 3.

| Component | Framework and command | Result | Verified scope and gaps |
|---|---|---:|---|
| Root contracts / units | Node built-in `node:test`; `npm run test:unit` | 31 passed | Gateway runtime, chat settings, architecture, frontend API and media accessibility contracts. |
| API Gateway | Node built-in `node:test`; `npm --prefix services/api-gateway test` | 2 passed | Current header sanitization and proxy error contracts. |
| Attempt | Jest 30.3.0; `npm --prefix services/attempt-service test` | 19 passed | Attempt domain, use cases and persistence-facing logic. Database behavior is additionally exercised by integration tests. |
| Parser | Jest 30.3.0; `npm --prefix services/parser-service test` | 18 passed | Parser and answer-detection unit behavior; not a full uploaded-file journey. |
| Quiz | Jest 30.3.0; `npm --prefix services/quiz-service test` | 67 passed | Quiz use cases and challenge domain/ranking helpers. Some older assertions duplicate rules inline; they are not production regression coverage. |
| Social | Jest 30.3.0; `npm --prefix services/social-service test` | 5 passed | Limited profile/social unit scope. Some tests implement simplified logic inline; real follow, profile/privacy and messaging paths have API integration coverage. |
| Media | Node built-in `node:test`; `npm --prefix services/media-service test` | 3 passed | URL validation unit tests. Upload, processing and access policies are exercised by the separate media integration command below. |
| Desktop UI | Node test runner with jsdom 26.1, Testing Library 16.3 and axe-core 4.14; `npm run test:media:ui` | 4 passed | Media accessibility UI only. Broader creator, Explore, settings, messaging and auth interaction coverage is not yet automated. |
| Mobile UI | Production build only; `npm run mobile:build` | Build passed | No mobile-specific component or interaction suite. |
| Admin, Auth, Challenge, Message services | Isolated HTTP/DB integration runner; no package-local test script | Included in 40 integration tests | Role enforcement, identity/session controls, messaging/settings and authorization are exercised across the stack. No independent component suites. |

The isolated `npm run test:integration` pass covered 134 legacy runner checks and 40 Node integration tests. It uses real HTTP services and MongoDB plus generated accounts and test-owned records. The legacy runner includes static and API-style checks; it is not a browser-journey suite. The real challenge API integration verifies answer/result quarantine, creator practice exclusion, deadline finalization, repeat finalization, concurrent starts resolving to one persisted ranked attempt, and idempotent repeat submission. Challenge domain/use-case tests also cover question limits, timer/deadline validation, immutability and ranking. Server-time expiry and score/time tie-breaking have unit coverage; a real multi-process/concurrent leaderboard finalization stress test remains unverified.

`npm run test:media` separately runs the real isolated upload/access integration suite. The CI workflow installs FFmpeg/FFprobe and executes this suite. There is no Playwright or Cypress browser automation in this baseline. Challenge, auth, quiz, social, messaging and privacy journeys are therefore API-level—not browser UI—coverage.

| Domain | Real or production-code coverage | Remaining gap |
|---|---|---|
| Auth / sessions | Registration, login, invalid credentials, refresh rotation/replay, logout, cookie/origin rules, token validation and spoofed identity checks in `tests/integration/identity-security.test.mjs` | Browser storage, expiry UX and deployment ingress are not exercised. |
| Quiz / imports | Real draft → publish → discovery → attempt → score lifecycle in `tests/integration/platform-architecture.test.mjs`; CSV mapping/scoring in `tests/integration/accessible-media.test.mjs`; parser unit tests | Excel/JSON and mapping UI errors need fuller integration coverage. |
| Challenge | Real pre-deadline answer/result quarantine, creator practice exclusion, deadline finalization and concurrent ranked-attempt uniqueness in `tests/integration/platform-architecture.test.mjs`; actual challenge domain/use-case and ranking unit tests | No multi-process leaderboard finalization stress test; challenge browser journey is absent. |
| Social / profiles | Follow, discovery preferences, notifications, private/restricted quiz visibility, bookmarks and Explore contracts in integration tests | Dedicated production-code unit suite remains small. |
| Messaging | Real HTTP/socket send, retrieval/persistence, membership and settings contracts in `tests/integration/chat-settings.test.mjs` | Browser reconnect and multi-replica delivery are unverified. |
| Administration | Privilege enforcement, forged identity rejection, restricted content and audit logs in `tests/integration/platform-architecture.test.mjs` | No isolated Admin component suite or browser workflow. |
| Database | Disposable MongoDB integration, unique ranked-attempt invariant, test-owned generated users/content | Migration compatibility, index rollout and replica-set transaction behavior are not tested by this suite. |

All 12 package lockfiles also completed clean `npm ci --ignore-scripts --no-audit --no-fund` installs in a disposable temporary tree. The local aggregate and integration results were produced on Node 20.11.1 / npm 10.2.4. The GitHub workflow uses Node 22 and has not yet been observed on a GitHub-hosted runner.

No repository lint, formatter, type-check or coverage configuration was found. These checks are not part of the current gate and must not be inferred from passing tests or builds. No separate secret scanner or SAST tool is configured; this gate currently includes npm dependency advisories and executable authorization/security regression tests only.

The final integration Node test process reported 13.4 seconds for its 40 tests; full workflow runtime was not measured. Hosted timing and bottlenecks remain unverified.

## GitHub Actions

[`.github/workflows/quality.yml`](../../.github/workflows/quality.yml) runs for pull requests, pushes to `main`, and manual dispatch on Ubuntu 24.04 with Node 22. It installs each locked dependency set, runs `test:ci`, installs MongoDB 8 and FFmpeg/FFprobe, runs both the isolated API/database and media upload/access integration suites, and runs the multi-lockfile audit. The workflow has read-only repository permissions. Repository branch protection must separately designate the resulting check as required.

## Dependency-audit policy and baseline

The audit checks every app/service lockfile. Critical findings and high findings not matched to an exact, current exception fail the gate. Moderate and low findings are reported but do not fail it. Exceptions are tied to package path, dependency, and advisory IDs; they include a reason and a review deadline. Related moderate/low transitive findings do not invalidate an exception; any related high/critical dependency does. Expired and stale exceptions fail the audit.

As of this baseline, no critical findings were reported. Five package-level high findings are accepted through exceptions expiring **2027-01-31**:

| Package | Dependency | Advisory IDs | Rationale |
|---|---|---|---|
| `apps/desktop-web` | Vite | 1116229, 1120784, 1242622, 1242651, 1242658, 1242724, 1242730, 1243432 | The offered Vite 8 fix is a major toolchain upgrade and requires Node 20.19+ plus compatible plugins. |
| `apps/mobile-web` | Vite | 1116229, 1120784, 1242622, 1242651, 1242658, 1242724, 1242730, 1243432 | Same shared Vite-major and plugin compatibility work. |
| `services/attempt-service` | xlsx | 1108110, 1108111 | npm reports no fix; evaluate a maintained replacement and migration. |
| `services/parser-service` | xlsx | 1108110, 1108111 | npm reports no fix; evaluate a maintained replacement and migration. |
| `services/quiz-service` | xlsx | 1108110, 1108111 | npm reports no fix; evaluate a maintained replacement and migration. |

Compatible dependency updates removed the previously observed fixable high findings, including the Sharp advisories. The exceptions do not suppress other dependencies or advisory IDs.

## Step 06 implementation outcome

| Area | Current entry points | Step 06 verification focus |
|---|---|---|
| Quiz/question models | `services/quiz-service/src/models/Quiz.model.js`, `Question.model.js`; parallel copies also exist in Parser and Attempt services | Reconcile ownership and schema drift before changing persistence. |
| Manual builder | `apps/desktop-web/src/pages/Create/ManualBuilder.jsx`; routes `/create/manual` and `/create/quiz` | Validate manual question creation, draft recovery, per-question validation and publish behavior with UI tests. |
| Import and column mapping | `services/parser-service/src/controllers/upload.controller.js`, parser routes/services and `services/quiz-service/src/services/parser/`; desktop `pages/Upload/Upload.jsx` and `pages/Mapping/Mapping.jsx` | Exercise CSV, Excel and JSON parser contracts, mapping persistence, validation errors and create/publish round trips. |
| Duplicate file handling | Parser and Quiz `services/upload/fileHash.service.js`; upload response includes `duplicateQuiz`, Mapping has a duplicate modal | Duplicate lookup and in-process generation locks are now uploader-scoped. Guest duplicate reuse is intentionally disabled. |
| Publishing and privacy | `services/quiz-service/src/routes/quiz.routes.js` and its draft/publish controllers | Verify owner authorization, visibility defaults, private discovery exclusion and safe response shape. |
| Existing tests | Quiz and Parser Jest suites, CSV flow in `tests/integration/accessible-media.test.mjs` | Owner-scoped duplicate and import mapping regressions have been added; browser E2E is not installed. |

The Step 06 implementation and measured verification are recorded in [the Step 06 report](32-step-06-report.md). Remaining debt includes duplicate Quiz/Question model copies across services, no browser automation, no database-backed reusable question bank, and no multi-process duplicate-generation stress test.

## Step 06 CI handoff

Before treating hosted CI as established, observe a GitHub Actions run and require its check in branch protection. Resolve the Vite and xlsx exceptions before their review deadline. Browser automation and lint/type-check tooling remain separate coverage gaps; scope and adopt them in a later step rather than treating this baseline as coverage for them.
