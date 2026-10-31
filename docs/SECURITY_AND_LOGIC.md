# Security And Logic Notes

This document records the main application logic, current security controls, and the recommended hardening backlog. It is meant to sit beside the README as the project grows.

## Runtime Topology

| Component | Local default | Notes |
| --- | --- | --- |
| Desktop web app | `http://localhost:5173` | Vite app in `apps/desktop-web`; API calls use the `/api` dev proxy |
| API Gateway | `http://localhost:5000` | Express reverse proxy for the domain services |
| Domain services | `http://localhost:5001`–`:5007` | Auth, quiz, parser, attempt, social, messaging, and media |
| MongoDB | `mongodb://localhost:27017/mcq-platform` | Shared local database used by the domain services |
| Redis | — | Not required by the current local runtime |

## Domain Logic

### Import And Mapping

1. Upload middleware receives CSV, Excel, or JSON files and applies size limits.
2. Parser services read headers and sample rows.
3. Smart column mapper scores each header for question, option, answer, explanation, serial, and media roles.
4. Content analysis boosts likely columns based on string length and value shape.
5. The UI can accept the automatic mapping or send manual corrections.
6. Quiz generation normalizes option labels and answer values before storing quiz/question records.

Important behavior:

- Short answer headers such as `ans` should map to the answer column, not an option column.
- Overall confidence is exposed separately from per-field confidence.
- Manual mapping remains the final user-controlled correction point.

### Quiz Attempts

The attempt flow stores selected answers, answer changes, timing, visit history, flags, and completion stats. This supports:

- score calculation
- result review
- creator analytics
- speed classification
- suspicious activity signals

### Social And Messaging

Social routes serve discovery feeds, reactions, bookmarks, comments, notifications, and shares. Direct messages use the message service over HTTP, with Socket.IO events for live conversation updates, presence, and typing indicators. Message routes check authentication and conversation membership before returning or changing conversation data.

## Current Security Controls

| Area | Current control |
| --- | --- |
| Auth transport | JWT stored in httpOnly cookies |
| Cookie policy | `sameSite=strict`; `secure` in production |
| Passwords | bcrypt hashing in the user model |
| Refresh tokens | Stored server-side on the user document and rotated on refresh/login |
| Admin access | `protect` plus `restrictTo('admin')` route middleware |
| Ownership | Controller/service checks before quiz, attempt, community, upload, and session mutations |
| CORS | Restricted to configured frontend origins |
| HTTP headers | Helmet enabled in Express |
| CSRF | Double-submit CSRF cookie/header check for cookie-authenticated unsafe requests |
| Validation | Body validation and Mongo ObjectId validation middleware |
| Uploads | Multer upload handling and per-user size limits |
| Upload validation | Extension, signature, and text/binary content checks before import records are created |
| Rate limiting | In-memory auth and upload limiters with separate buckets and standard rate-limit headers |
| Chat | Socket auth and message sanitization |

## Security Gaps To Close

These are not blockers for local development, but they should be handled before production or multi-user hosting.

1. Move rate limit counters to Redis so limits work across restarts and multiple API instances.
2. Add refresh-token family tracking with reuse detection.
3. Replace lightweight validation with a comprehensive schema layer for every request body/query.
4. Add malware scanning for untrusted uploaded files.
5. Add admin audit logs for role changes, user deletion, quiz moderation, and session destruction.
6. Add central security event logging for repeated auth failures and suspicious attempts.
7. Add production Content Security Policy once frontend asset origins are finalized.
8. Add CI checks for tests, build, dependency audit review, and secret scanning.

## Safe Defaults Checklist

- Do not deploy with default `JWT_SECRET` or `JWT_REFRESH_SECRET`.
- Keep `CLIENT_URL` exact in production; do not use wildcard CORS.
- Use HTTPS in production so secure cookies are actually sent.
- Keep MongoDB and Redis private to the app network.
- Avoid committing `.env`, generated uploads, local database data, or logs.
- Review `npm audit` output before releases and prioritize runtime dependency issues.

## Test Coverage Notes

Current coverage includes parser behavior and answer detection. Useful next tests:

- auth refresh and logout cookie behavior
- CSRF behavior on integrated API routes
- admin route access control
- upload size and file-type rejection
- quiz ownership checks
- session lifecycle permissions
- workspace ownership rules
- socket auth and chat sanitization
