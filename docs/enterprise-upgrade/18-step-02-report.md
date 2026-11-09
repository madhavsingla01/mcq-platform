# Step 02 implementation report

November 8, 2026. Architecture work was completed in the existing checkout without deployment or production data migration. The subsequent accessible multimedia request is a separate feature in progress. This report records the Step 02 baseline before that feature.

## A. Executive summary

Attempt Service now owns routed attempt mutations and scheduled expiry. Quiz keeps compatible URLs through an authenticated, bounded HTTP relay. Gateway failures have safe additive codes/correlation, including 504 timeouts. Desktop progress sync uses the correct progress endpoint. Email-only Admin privilege bootstrap is removed. A real moderation regression exposed and repaired missing restriction fields/filters and policy-bypassing caches.

## B. Before/after architecture

[Service boundaries](10-service-boundaries.md) contains both diagrams and the target logical design. Previously Quiz and Attempt accepted competing writes and Quiz ran the finalizer. Now nested Quiz attempt URLs relay to Attempt and only Attempt runs scheduled expiry. Deployment count, MongoDB collections and public route names remain.

## C. Service ownership

The completed [service matrix](10-service-boundaries.md), [operational contracts](11-domain-ownership.md) and [collection matrix](14-database-ownership.md) distinguish owners, current writers/readers and remaining exceptions. Notifications are a Social module, questions belong to Quiz, and embedded timers are not independently deployed workers.

## D. Confirmed architectural problems

Competing attempt handlers/finalization, a sync request routed to submission, Admin email-based privilege escalation, restriction projection drift, uncoordinated authorization caches, duplicated mutable schemas, Identity/Social relationship writers and raw Admin moderation writes are recorded with file evidence in the boundary report. [Source inventory](architecture-inventory.json) includes dormant modules and is explicitly not a runtime reachability proof.

## E. Backend changes

| Files under repository root | Previous → resulting behavior | Reason, security and verification |
|---|---|---|
| `services/quiz-service/src/routes/attemptCompatibility.routes.js`, `infrastructure/attemptClient.js`, `routes/quiz.routes.js` | Local attempt handlers → allowlisted, bounded owner relay | Preserve legacy URLs without two mutation owners. Validate origin/path, reject redirects, abort on disconnect, never retry writes. Unit and real direct/gateway contracts |
| `services/attempt-service/src/routes/attempts.routes.js`, `middleware/quizIdentifier.middleware.js` | ObjectId-only aliases → compatible symbolic identifiers | Preserve `!QZ`/code lookup after moving execution. Real start/recovery/sync/submit/result tests |
| `services/quiz-service/src/jobs/cleanup.worker.js`, `services/attempt-service/src/jobs/finalization.worker.js`, Attempt `server.js` | Quiz-owned expiry → Attempt-owned scheduler | Existing scoring/tracking logic retained. Non-overlap guard per process and graceful worker/server shutdown. Real deadline and repeated-finalization test |
| Attempt `middleware/auth.middleware.js` | Account-code backfill in execution auth → read-only Identity projection; version defaults checked consistently | Avoid this cross-domain identity write and honor revocation. Existing authentication/integration regressions |
| `services/api-gateway/src/contracts.js`, `server.js` | Inconsistent/raw proxy errors → safe legacy-compatible structured failures | Strip forged identity headers on HTTP/WS; safe 502/504; no exception details in response. Real proxy stall/refusal and socket regressions |
| `services/admin-service/src/middleware/auth.middleware.js` | Configured email could bootstrap wildcard Admin → persisted role/RBAC only | Fresh matching-email account denied; persisted Admin role succeeds |
| Attempt/Social `models/Quiz.model.js`, Quiz `controllers/quiz.controller.js`, `controllers/search.controller.js`, Social `services/social/activity.service.js`, `controllers/profile.controller.js` | Missing restriction projections/filters and warm-cache bypass → current policy reads/filters | Real Admin restriction after successful detail/tag reads denies detail/attempt and removes affected discovery results |
| Quiz `config/env.js`, `.env.example`, Compose | No Quiz→Attempt configuration → validated private origin/deadline | Local loopback template and Compose service hostname; invalid configuration unit checks; Compose syntax validation |

No new service, broker, database engine or runtime package was added. Unmounted legacy attempt functions remain in Quiz pending safe removal, and cross-domain derived writes remain documented.

## F. Frontend maintenance

Desktop `services/attempt.service.js` separates `/sync-progress` from submission. `api/errorContract.js` and the existing Axios interceptor preserve legacy errors while adding normalized status/code/message/request ID. Messaging's send error consumes that adapter. The [frontend report](16-frontend-api-integration.md) records stores/consumers, mobile compatibility and unexecuted browser checks. The standalone mobile source is unchanged by user instruction. No visual redesign was included.

## G. Contracts

[Gateway](12-api-gateway-architecture.md), [service communication](13-service-communication.md) and [HTTP error schema](../../contracts/http-error.v1.schema.json) document exact aliases, header trust, original credentials, response compatibility, deadlines and retries. Existing domain error envelopes still pass through. Nested Quiz attempt calls add an HTTP hop; 15s relay default is shorter than the gateway's 30s default. Timeout does not imply a mutation failed. Read current attempt state before retry.

## H. Security assessment

Confirmed fixes cover Admin email privilege bootstrap, missing moderation projection/filters and detail-cache bypass. The gateway does not trust browser user/role headers. Receiving services verify original credentials and resource ownership. Relay URL traversal/absolute request targets cannot redirect credentials.

Existing email-bootstrapped Admin memberships must be reviewed before deployment. This fix prevents new email-only grants but does not automatically delete ambiguous existing memberships. Shared JWT keys, one refresh token per account, differing optional-auth middleware, passive socket room eviction after restriction, production asset privacy and dependency findings remain. [OWASP ASVS 5.0](https://asvs.owasp.org/) and [OWASP API1 object authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/) inform these scoped checks. No certification or full standard coverage is claimed.

## I. Verification

| Test | Command/method | Actual result before multimedia work | Notes |
|---|---|---|---|
| Unit/transport/frontend contracts | `npm run test:unit` | 21 passed | Includes error compatibility, header claims, relay deadline/disconnect/path safety and executable desktop request paths |
| Existing regression checks | `npm run test:integration` | 134 passed | Mix of source and API assertions; not 134 browser journeys |
| Real HTTP/MongoDB/WS integration | Same command | 23 Node results passed, comprising 14 chat/settings and 7 architecture scenarios plus two parent suites | Fresh isolated MongoDB and ten random-port processes; generated signing keys |
| Quiz service | `npm test -- --runInBand` in quiz-service | 67 passed across 7 suites | Existing domain/policy tests |
| Desktop compilation | `npm run desktop:build` | Passed | Existing image-compressor mixed-import warning |
| Deployment syntax | `docker compose config --quiet` | Passed | Images, containers and production ingress not started |
| Source parse | esbuild transform of service/desktop/scripts/tests source | 566 files parsed | Syntax validation, not runtime path coverage |
| Scope/whitespace | Git diff checks | Changed paths checked; mobile working/staged diff empty | Pre-existing unrelated edits preserved |
| Browser/accessibility/production | Not executed | Incomplete | No new visual or screen-reader pass. Production cookies, network faults, worker replicas, backup restore remain unverified |

Intermediate runs found a source-location assertion that assumed a gateway error string stayed in `server.js`; it was replaced by an executable failure-classification assertion. The moderation test then exposed the missing Attempt restriction field. A fixture initially performed all-session logout before later using the same account token; test ordering was corrected. WS header sanitization initially spread an IncomingMessage whose headers are not enumerable; explicit header forwarding repaired the regression. The final full integration run passed after these corrections. Quiz lifecycle testing includes answering a real question and verifying its score.

## J. Migration and rollback

[Rollout](17-migration-and-compatibility.md) requires a coordinated Quiz/Attempt cutover with exactly one expiry scheduler, explicit Admin provisioning, private origins and staging parity checks. No data migration is needed. Additive projection fields stay on rollback. Do not roll back the privilege/visibility fixes. Single-replica worker behavior and staged cutover are constraints, not proven zero-downtime migration.

## K. Deferred work and acceptance limits

The bounded implementation is complete and tested. Full production acceptance remains incomplete for browser/mobile visual validation, physical assistive technology, container image builds, runtime/dependency remediation, backup restoration, production auth/ingress and replica-safe finalization. [Deferred work](17-migration-and-compatibility.md) maps schema ownership to Step 04, legacy quiz cleanup/imports to 06, challenge races to 07, social aliases to 08, messaging to 09, events to 10/18, media to 13, observability/performance to 16/17 and deployment/security to 19/22. These are not marked as finished by this report.

## L. Step 03 handoff — authentication, authorization and privacy

Step 03 has not been started. Use Identity `controllers/auth.controller.js`, `middleware/auth.middleware.js`, `utils/preferences.js`, User model, JWT/cookie/CSRF utilities and routes as the current account authority. Browser integration is desktop `api/axios.js`, AuthStore/SettingsStore, protected routes and socket service; mobile has its own read-only client/store implementation.

Current flow is registration/login → access/refresh cookies → bootstrap or refresh → per-service JWT plus account lookup → domain resource checks → logout/revoke via tokenVersion. Role is persisted on User. Admin additionally loads membership/roles/permissions. Role/identity headers are untrusted. Shared HMAC secrets span services; no issuer/audience/key-provider migration or signed machine identity has been implemented.

Prerequisites and next tests:

- Inventory all live auth middleware, cookie options, CSRF policies, token-version comparisons and guest ownership. Compare optional-auth behavior on expired/revoked tokens with protected APIs; avoid an accidental guest fallback on privileged operations.
- Review existing Admin memberships created by legacy email bootstrap, explicit provisioning, wildcard grants, demotion and audit. Preserve valid operators through a reviewed migration; do not silently delete memberships.
- Design per-device sessions, refresh rotation/reuse detection, password reset and MFA before implementing UI promises. Define rollback and old-cookie compatibility; never invalidate production sessions accidentally during schema migration.
- Define owner-level public/private/unlisted/invite/restricted rules, including pre-deadline challenge scores/answers, result review, search, social projections and media. Negative tests need owner, participant, stranger, guest, suspended/deleted account and Admin cases.
- Test wrong signature, expired token, missing/versionless token after revocation, CSRF mismatch, forged gateway headers, direct-service access and WebSocket reconnect/room delivery after restriction.
- Specify service key separation/issuer/audience/rotation and minimum network exposure. A new key model must ship with both old-token transition and operational rollback tests.
- Verify production same-site/cross-origin cookie and ingress behavior, frontend refresh queue failures, logout across tabs, stale stores and passive socket revocation. Shared-key and database-read assumptions must remain explicit until replaced.

ADRs and alternative decisions are in [19](19-architecture-decisions.md). Do not interpret this handoff as permission to skip the listed migration evidence.
