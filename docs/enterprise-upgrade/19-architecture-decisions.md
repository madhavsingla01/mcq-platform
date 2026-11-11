# Architecture decisions for Step 02

## ADR-002 — Attempt execution has one active owner

**Status** Accepted and implemented for routed lifecycle operations and scheduled expiry.

**Context and problem** Quiz and Attempt both bound mutation handlers against the same attempts collection. Quiz's cleanup worker also made completion decisions. A shared database did not prevent policy drift or conflicting ownership.

**Alternatives** Move all Quiz functionality into Attempt; introduce a new competition service; route only new clients to Attempt and keep two old writers; retain public Quiz URLs through a transport adapter.

**Decision and reasons** Attempt owns execution. Quiz keeps a bounded authenticated HTTP compatibility relay, and the expiry worker moves to Attempt. Existing clients keep URLs, response data, IDs, cookies and guest sessions. Symbolic quiz identifiers resolve inside Attempt. This changes a concrete boundary without moving thousands of controller lines or adding another deployment.

**Consequences** Nested legacy paths add an HTTP hop and fail if Attempt is unavailable. No local fallback is permitted. Old Quiz attempt functions remain unmounted code pending Step 06 removal. Attempt still has cross-domain derived writes and multiple lifecycle entry points. Replica fencing and stale-save race safety are not implied by single service ownership.

**Migration** Deploy compatible Attempt, configure Quiz's private origin, coordinate the finalizer cutover and run real lifecycle contracts. Keep one scheduler during deployment. See [rollout](17-migration-and-compatibility.md).

**Rollback** Coordinate both processes, retaining exactly one scheduler. Prefer a forward fix over restoring independent mutation owners. No data/index rollback is needed.

## ADR-003 — Preserve end-service token verification and additive errors

**Status** Accepted and implemented for the gateway and Quiz relay.

**Context and problem** Services already verify shared JWTs. Adding trusted gateway user/role headers without a verified internal identity boundary would allow forgery. Gateway failures exposed different shapes and development error details.

**Alternatives** Trust external identity headers; introduce a service mesh and signed identity context now; retain end-service verification and strip misleading identity assertions. Replace every error response at once; or add structured edge errors while preserving legacy fields.

**Decision and reasons** Keep the signed original user credential through a strict relay header allowlist, re-verify in Attempt, and enforce object policies there. Gateway strips privileged header families on HTTP and WS forwarding. Gateway-generated failures gain a safe code/message/request-ID envelope. Existing domain errors pass through and desktop handles both forms.

**Consequences** Shared signing keys remain a platform trust assumption. Services can still verify or mint credentials using that key. Key separation, issuer/audience policy and service identity are Step 03 decisions. Envelope migration is partial by design. Existing v1 consumers remain compatible, except upstream timeout is now correctly identified as 504.

**Migration** Add JSON Schema and executable transport tests. Migrate service errors only when that service has caller and middleware tests. Do not copy domain rules into the gateway.

**Rollback** Additive envelope fields can be removed without touching data. Preserve safe messages and original credential verification. Never restore trust in client identity assertions.

## ADR-004 — Current policy reads before uncoordinated caching

**Status** Accepted and implemented on the affected detail/discovery paths.

**Context and problem** Admin wrote a restriction in shared MongoDB. Quiz's cached anonymous detail returned before reading that flag; Attempt's schema did not expose it, and some discovery filters omitted it. Cache TTL was therefore an authorization delay.

**Alternatives** Introduce broker invalidation immediately; trust short TTL; use current policy reads until owner revisions/events are reliable.

**Decision and reasons** Read current detail and trending-tag policy, expose the additive restriction field in the projections, and use consistent public filters within each affected service. Verify moderation after an earlier successful read, not only initially restricted fixtures.

**Consequences** More database reads on these paths. Some other aggregates/caches and metadata snapshots still require audit. There is no claim of platform-wide cache coherence.

**Migration** Establish owner metadata revisions and outbox/invalidation contracts before restoring response caching. Benchmark read load and verify negative authorization cases in both warm and cold caches.

**Rollback** Retain restriction fields and fail-closed filters. A forward performance fix is preferable to restoring the authorization bypass.

## ADR-005 — Retain MongoDB and current deployment count

**Status** Accepted for Step 02; extends [ADR-001](06-migration-roadmap.md).

**Context and problem** Services share schemas, ObjectIds and aggregations. More clusters, a broker, search infrastructure or shared runtime packaging would add operations before ownership contracts are stable.

**Alternatives** Database-per-service migration now, new search/notification/question services, a monolith rewrite, or logical owner boundaries on the existing infrastructure.

**Decision and reasons** Retain MongoDB and ten existing service processes. Keep questions in Quiz, notifications in Social, discovery in existing services and workers embedded for now. Protocol schemas can be shared without shared mutable models. Do not add infrastructure to satisfy a diagram.

**Consequences** Shared collection exceptions and embedded-worker limits remain explicit debt. No independent database access isolation or multi-replica execution guarantee exists yet.

**Migration** Owner API/event parity first, then credential narrowing and deployment separation only when justified. Version any future shared package and test local/container packaging.

**Rollback** No schema split, renamed collection or new persistent infrastructure needs reversal.

## ADR-006 — Marketplace Service Ownership Boundaries, Content References, and Entitlements Architecture

**Status** Accepted for Step 02 / Phase 1 architecture foundation; establishes service ownership boundaries, data isolation invariants, security boundary controls, and versioned contract prerequisites for Phase 2 implementation. Standalone record documented at [ADR-006](../adr/ADR-006-marketplace-architecture.md).

**Context and problem** QuizFocus is expanding from free, community, and competitive challenge quizzes to an enterprise creator marketplace. Without explicit architectural boundaries, marketplace features risk content duplication (stale question copies, desynchronized answers/explanations, media bloat), split attempt execution authority (violating ADR-002), unauthorized seller monetization or creator spoofing, media copyright leakage, and financial transaction replay vulnerabilities.

**Alternatives** Monolithic extension of `quiz-service` (bloats quiz service with billing and e-commerce concerns); duplicated question snapshots in marketplace (causes question errata divergence and bypasses `media-service`); client-asserted payment receipts (vulnerable to forgery, tampering, and replay); synchronous question-by-question entitlement polling (creates high latency and single points of failure during quiz attempts).

**Decision and reasons** Establish strict domain ownership boundaries:
1. `marketplace-service` (port 5013) owns listings, catalog metadata, pricing models, commercial licenses, learner entitlements, and order/checkout lifecycles. Listings store a reference `quizId` (or `contentId` with `contentType: 'quiz'`) pointing to `quiz-service`. Zero Duplication Invariant: marketplace collections never store or duplicate quiz questions, option choices, correct answers, explanations, or question media files.
2. `quiz-service` (port 5002) retains exclusive ownership of quiz authoring, question banks, choices, explanations, drafts, and categories. Exposes author verification so `marketplace-service` confirms seller ownership.
3. `attempt-service` (port 5004) retains exclusive ownership of quiz execution, progress synchronization, timing, and scoring (per ADR-002). For paid/restricted quizzes, `attempt-service` verifies an active, unexpired entitlement with `marketplace-service` prior to initializing an attempt (`POST /api/v1/quiz/:id/attempt`). If the user lacks an active entitlement, attempt initialization is rejected with HTTP 403 (`ENTITLEMENT_REQUIRED`).
4. Formalized Security Boundary Controls:
   - Server-side authorization & JWT claims verification: `marketplace-service` independently verifies access tokens (`HS256`, checking claims `id`, `exp`, structure). Gateway strips privileged client headers (`x-user-id`, `x-role`, `x-internal-token`) per ADR-003.
   - Creator ownership verification: seller must be the verified author or organization owner of the referenced quiz.
   - Safe file/media access: all preview media is referenced via `media-service` without raw file duplication or exposing protected question assets.
   - Immutable audit logging: append-only audit trail for listing mutations, pricing changes, order transitions, and entitlement transactions.
   - Replay protection via client-supplied `Idempotency-Key` headers (RFC 7231 / UUIDv4) with TTL expiration on financial and order endpoints.
5. Versioned future contracts: HTTP endpoints governed by `contracts/marketplace-api.v1.json` (`/api/v1/marketplace/*`); asynchronous events governed by `contracts/marketplace-events.v1.json` (`marketplace.*.v1`).

**Consequences** Decouples authoring, execution, and commerce cleanly. Zero question duplication overhead. Low-latency single entitlement check at attempt initialization. Gateway isolates unimplemented business routes with HTTP 404 during Phase 1 while routing `/health` and `/ready` probes to port 5013.

**Migration** Deploy standalone ADR-006, versioned contract schemas, and scaffold `marketplace-service` on port 5013. Reserve `/api/v1/marketplace` in `api-gateway`. Phase 2 implements MongoDB persistence, seller verification RPC, payment webhooks, and `attempt-service` entitlement interceptor.

**Rollback** No database rollback or data migrations needed. Revert `/api/v1/marketplace` proxying in `api-gateway` and stop `marketplace-service`.

