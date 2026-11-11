# Full project audit

**Reviewed:** 2026-11-09  
**Scope:** Current working-tree snapshot of the 13 service packages and two web apps; runtime code, service boundaries, package manifests/lockfiles, CI and test wiring, deployment configuration, and the existing architecture, security, and redundancy reports.  
**Method:** Static source/configuration review plus `npm run test:ci` and `npm run security:audit`. This is a risk-ranked engineering audit, not a penetration test or a certification.

**Priority:** P1 is a release/CI risk to address first; P2 is significant engineering or operational risk; P3 is lower-impact cleanup/documentation work.

## Executive summary

The project has broad domain coverage, an active CI workflow, and passing local unit/service/UI/build checks. It is not yet possible to treat the pipeline as complete for the current 15-package repository: the three split Social services are omitted from clean CI dependency installation and from dependency auditing. Several service processes also log uncaught exceptions without terminating, so an orchestrator may not restart a potentially corrupted process.

The dependency audit reports five package-level high findings which are currently allowed by dated exceptions: Vite in both clients and SheetJS (`xlsx`) in Attempt, Parser, and Quiz. The Social split is currently a routing/deployment split over shared source and shared MongoDB, rather than independent code or data ownership. Existing reports also document duplicated security/business logic, missing restore rehearsals, and meaningful automated UI/operational test gaps.

**Overall assessment:** good local verification coverage, but address the CI inventory and fatal-process handling first; remediate high dependency advisories and complete the operational ownership/recovery work before claiming production readiness.

## Findings

### P1 — CI does not install or audit the three split Social packages

**Evidence:** The repository has 15 lockfiles (two apps and 13 services). [`quality.yml`](../../.github/workflows/quality.yml) installs and caches the original 12 packages, stopping at `social-service`. However, root [`package.json`](../../package.json) runs tests for `social-feed-service`, `social-interactions-service`, and `social-comments-service`. [`audit-dependencies.mjs`](../../scripts/audit-dependencies.mjs) likewise lists only the original 12 packages.

The new services' route tests import Express-backed routers and each package declares its own runtime dependencies. The local `test:ci` pass ran in a workspace that already has installed dependencies; it does not demonstrate that a clean GitHub runner can resolve those packages. Nor does the current dependency audit inspect their lockfiles.

**Impact:** clean CI can fail on missing dependencies, and advisories in these deployable services can go undetected.  
**Action:** add all three packages to the workflow's npm cache/install matrix and to the dependency-audit package list; test from a clean runner.

### P1 — Uncaught exceptions are logged without terminating affected services

**Evidence:** [`auth-service/src/server.js`](../../services/auth-service/src/server.js), [`quiz-service/src/server.js`](../../services/quiz-service/src/server.js), and the shared [`social-service/src/serviceApp.js`](../../services/social-service/src/serviceApp.js) register `uncaughtException` handlers that only log. Similar logging-only handlers exist in several other service entrypoints.

Registering an `uncaughtException` listener prevents Node's default fatal exit. Continuing to accept requests after an unexpected synchronous exception can leave in-memory state or partially completed operations inconsistent, and prevents the process manager from reliably restarting the instance.

**Impact:** degraded or corrupted processes may remain in service instead of being replaced.  
**Action:** use a consistent fatal-error policy: stop accepting work, log/flush safely, and exit nonzero; define and test the corresponding `unhandledRejection` policy. Do not treat either event as recoverable by logging alone.

### P1 — High-severity dependency advisories remain under exceptions

**Evidence:** The fresh `npm run security:audit` completed with zero critical findings, but reported five high-severity package findings accepted by exceptions expiring 2027-01-31:

- Vite in Desktop and Mobile. The findings include development-server and Windows path/command-handling advisories.
- `xlsx` in Attempt, Parser, and Quiz. The findings include prototype pollution and regular-expression denial of service in spreadsheet parsing.

The current row and file-size limits are useful defense in depth, but they do not remove vulnerable parser behavior. The three split Social packages were omitted from this audit run (P1 finding above).

**Impact:** hostile spreadsheet inputs may exercise vulnerable parsing paths; the Vite advisories remain relevant when affected development tooling is exposed or used.  
**Action:** prioritize a maintained XLSX parser/migration with malicious-file regression tests; plan the Vite/toolchain upgrade against a supported Node version; remove the exceptions when each advisory is resolved. Keep development servers private.

### P2 — Social services are not yet independent code or data owners

**Evidence:** Each split Social service imports shared middleware and application setup from `services/social-service/src`; the Social implementation and legacy service remain the source of controllers/models. The services use the same MongoDB database and collections. This boundary and its compatibility caveats are also recorded in [`10-service-boundaries.md`](10-service-boundaries.md).

**Impact:** code changes and data access remain coupled to the legacy Social service. Separate containers alone do not provide independent release ownership, least-privilege data access, or isolated rollback.  
**Action:** treat the current arrangement as an explicitly transitional deployment split. Establish a versioned shared package or move owned code into each service, specify read/write contracts, and introduce service-specific database roles only after compatibility and migration tests.

### P2 — Security and business rules are duplicated across services

**Evidence:** [`33-redundancy-audit.md`](33-redundancy-audit.md) records identical session-token validation in eight services, copied parser/scoring/timer implementations, and other exact-copy helpers. Some copies are live; others are candidates for removal after caller verification.

**Impact:** policy, scoring, or parsing fixes can land in only some services, creating service-dependent behavior. Removing or centralizing code without distinguishing live implementations from local projections can also break ownership boundaries.

**Action:** add parity tests first for token validation, parsing, and scoring; remove only confirmed orphaned code; extract pure shared logic through a versioned package while leaving service-specific authorization, persistence, and adapters local.

### P2 — Recovery, media lifecycle, and multi-replica behavior are not production-verified

**Evidence:** The existing [`05-security-and-risk-register.md`](05-security-and-risk-register.md) documents that backup restoration and retention are unverified, media remains filesystem-backed, and Messaging uses process-local Socket.IO state, counters, and last-seen data without persisted replay.

**Impact:** loss or migration of a host can affect uploaded assets; scaling messaging to multiple replicas can cause inconsistent delivery/state; deletion and retention expectations are not yet demonstrated.

**Action:** define recovery objectives and rehearse a restore; define media authorization, durability, and deletion/retention policies; keep Messaging single-replica until adapter/affinity/replay behavior is tested under multiple instances.

### P2 — Automated quality gates do not cover broad browser journeys or static analysis

**Evidence:** [`30-testing-architecture-and-quality-gates.md`](30-testing-architecture-and-quality-gates.md) records no repository lint, formatter, type-check, or coverage gate; no Playwright/Cypress browser suite; and mobile production-build verification without mobile interaction tests. Auth, Admin, Challenge, and Message also lack package-local test scripts, though API-level integration coverage exists.

**Impact:** passing unit/API tests and production builds do not verify real browser navigation, session expiry, responsive interactions, or accessibility outside the tested media UI. Regressions can pass without a code-quality or coverage signal.

**Action:** add smoke browser journeys for authentication, quiz attempt/recovery/submission, profile privacy, and messaging; add mobile interaction coverage; select and enforce lint/type/coverage thresholds. Keep API integration tests as a complementary layer.

### P2 — The reported quiz 403 is not yet confirmed against a real failed request

**Evidence:** A client recovery fix and regression test now prevent reuse of a local snapshot when the server reports no matching active attempt. The test verifies the stale-snapshot decision, but the original browser trace did not include response bodies, and this audit did not replay the user's authenticated attempt.

**Impact:** the stale-snapshot case is addressed, but a separate CSRF, JWT/session, or ownership mismatch could still produce 403 responses.

**Action:** verify one failing request's response message and request headers in Network/service logs, then confirm Auth and Attempt use the intended shared signing configuration and that the attempt's owner/session matches. Do not relax CSRF or ownership checks to suppress the status.

### P3 — The getting-started README does not reflect the current service inventory

**Evidence:** [`README.md`](../../README.md) lists the original ten services and launch commands but omits Social Feed/Profile, Social Interactions, and Social Comments on ports 5010–5012, although Compose and the root scripts include them.

**Impact:** operators following the README may start or troubleshoot an incomplete topology.  
**Action:** update the service table, ports, launch commands, and verification instructions to match Compose and the package inventory.

## Verification performed

| Check | Result |
|---|---|
| `npm run test:ci` | Passed: 40 root unit/contract tests, all configured service tests (including one route contract test per split Social service), four media UI tests, Desktop build, and Mobile build |
| `npm run security:audit` | Completed with zero critical findings; five high package findings accepted under current exceptions. Three split Social packages were not included. |
| Integration and media API suites | Not rerun during this audit; existing integration evidence is documented in prior reports. |
| Docker image builds / production deployment | Not run. A local passing Compose configuration or application build does not prove image builds, ingress behavior, production secrets, or deployment health. |

The audit reviewed a working tree with substantial pre-existing modified and untracked files. Findings describe the current workspace snapshot and should not be read as a clean-branch or production deployment assessment. No application source code was changed as part of this audit.

## Recommended order

1. Complete the CI and dependency-audit package inventory; verify it on a clean runner.
2. Correct fatal exception handling and test shutdown/restart behavior.
3. Replace or mitigate the XLSX dependency and upgrade the Vite toolchain; retire the exceptions.
4. Prove backup/restore and asset lifecycle behavior; document replica limits.
5. Add parity and browser tests before extracting duplicated code or changing service ownership.
6. Align README and architecture documentation with the actual deployment inventory.

## Existing detailed evidence

- [Service boundaries and ownership exceptions](10-service-boundaries.md)
- [Security and operational risk register](05-security-and-risk-register.md)
- [Testing architecture and quality gates](30-testing-architecture-and-quality-gates.md)
- [Redundancy and duplicate-code findings](33-redundancy-audit.md)
