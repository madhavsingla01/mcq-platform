# Step 05 report: engineering quality gates

**Status: implemented and locally verified; hosted GitHub Actions run remains unverified.**

## Delivered

- Added root aggregate commands for service tests, CI-equivalent unit/component/accessibility checks and both frontend builds, plus a multi-lockfile dependency audit.
- Added or aligned test scripts for Gateway, Attempt, Parser, Quiz, Social and Media. Added the missing Jest development dependency and lockfile entries for Attempt, Parser and Social.
- Replaced stale API Gateway middleware/controller tests with contracts for the current gateway behavior, and updated two legacy checks that referenced the removed test file.
- Added a GitHub Actions workflow for pull requests, pushes to `main` and manual runs. It installs all 12 locked packages, runs the aggregate checks, runs API/database and media integration against isolated MongoDB 8 instances with FFmpeg/FFprobe, then audits dependencies.
- Added explicit time-bounded dependency-audit exceptions. The gate rejects critical findings, unexcepted high findings, expired exceptions, and exceptions that no longer match current findings.
- Applied non-forced compatible dependency updates and moved Media to Sharp 0.35.5 to clear its high advisories.
- Added a Mongo-backed regression proving concurrent challenge starts persist one ranked attempt and repeat submission is idempotent.
- Added [the testing and quality-gate inventory](30-testing-architecture-and-quality-gates.md) with coverage limits, CI behavior and the remaining advisory register.

## Verification

| Check | Result |
|---|---|
| `npm run test:ci` | Passed: 31 root checks, 114 service tests, four accessibility UI tests, desktop build and mobile build |
| `npm run test:integration` | Passed: 134 legacy E2E runner checks and 40 Node integration tests, including a concurrent one-ranked-attempt assertion and idempotent repeat submission |
| `npm run test:media` | Passed: nine tests in the isolated media upload/access integration suite |
| `npm run security:audit` | Passed with five exact high-finding exceptions; zero critical findings |
| Clean install of all 12 lockfiles | Passed in a temporary tree using `npm ci --ignore-scripts --no-audit --no-fund` |
| `git diff --check` | Passed; Git emitted only existing line-ending conversion warnings |
| GitHub-hosted workflow | Not run in this environment |

The integration runner used `MONGOD_BINARY` for the installed MongoDB binary and its own temporary database, test keys, ports and service processes. It does not connect to application data. The media integration suite covers corrupt uploads, private media access, retry/idempotency behavior, audio/video workflows, challenge media, and CSV import.

## Remaining work and Step 06 handoff

The five high package-level exceptions are listed with advisory IDs and the 2027-01-31 review date in [the quality-gate inventory](30-testing-architecture-and-quality-gates.md). The Vite exceptions need a planned Vite 8 and compatible-plugin upgrade; the xlsx exceptions need a maintained package decision and migration. Keep the audit gate active and do not widen these exceptions.

Have the repository owner observe the new workflow on GitHub and make its check required through branch protection. There is no browser-journey automation or lint/format/type-check gate yet. These are explicit follow-up gaps, not completed Step 05 checks.

At the time this Step 05 report was completed, Step 06 was a handoff only. The subsequent Step 06 implementation and its verification are documented in the [Step 06 report](32-step-06-report.md).

For the Step 06 source and coverage map—including Quiz/Question model locations, ManualBuilder, parser/import routes, mapping UI and file-hash duplicate detection—see the [testing architecture and quality gates](30-testing-architecture-and-quality-gates.md#step-06-discovery-handoff).
