# Project Progress

This file records concrete setup, documentation, and verification progress. Keep entries short and dated so future work can be traced without digging through terminal history.

## 2026-09-17

### Runtime Fixes Documented

- Documented the local MongoDB port as `27018` instead of the blocked/default `27017`.
- Documented the Redis local port as `6380`.
- Added troubleshooting notes for MongoDB connection failures and duplicate nodemon arguments.

### Documentation Improvements

- Reworked the README into a runbook-style guide.
- Corrected the frontend stack from React 19 to React 18.
- Reworded smart column detection as heuristic mapping rather than AI-powered mapping.
- Added API route inventory.
- Added core logic flow for import, mapping, quiz generation, attempts, results, and live sessions.
- Added security baseline and recommended hardening backlog.
- Added this progress log and `docs/SECURITY_AND_LOGIC.md`.

### Verification

- Backend health endpoint returns `200` at `http://127.0.0.1:5000/api/v1/health`.
- Frontend dev server returns `200` at `http://127.0.0.1:5173`.
- Server test suite passes with 18 tests.
- Client production build completes successfully.

### Security Implementation

- Added double-submit CSRF middleware for cookie-authenticated unsafe API requests.
- Added frontend Axios support for echoing the readable CSRF cookie as `x-csrf-token`.
- Issued and cleared CSRF cookies alongside auth token cookies.
- Split rate-limit buckets by limiter type so auth and upload limits do not collide.
- Added standard `RateLimit-*` and `Retry-After` headers.
- Tightened import upload validation with extension, binary signature, and text-content checks.
- Added CSRF middleware unit tests.
- Server test suite now passes with 23 tests.

## Next Documentation Targets

- Add endpoint-level examples for upload, mapping, quiz generation, and attempts.
- Add data model diagrams for quiz, question, attempt, session, and workspace entities.
- Add a deployment guide once the target hosting platform is selected.
- Add an incident response checklist for admin/security events.
