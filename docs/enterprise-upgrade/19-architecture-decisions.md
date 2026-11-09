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
