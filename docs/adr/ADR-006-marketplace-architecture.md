# ADR-006 — Marketplace Service Ownership Boundaries, Content References, and Entitlements Architecture

## Status
Accepted for Step 02 / Phase 1 architecture foundation; establishes service ownership boundaries, data isolation invariants, security boundary controls, and versioned contract prerequisites for Phase 2 implementation.

## Context and problem
QuizFocus is expanding from free, community, and competitive challenge quizzes to an enterprise creator marketplace. The marketplace enables quiz authors, educators, and institutions to publish and monetize premium quizzes, practice test suites, and certification prep packages.

Without explicit architectural boundaries and strict contractual controls, introducing marketplace capabilities introduces five critical failure modes:
1. **Content and Media Duplication (Data Desynchronization & Storage Bloat)**:
   Replicating quiz schemas, question banks, option choices, explanations, and media assets into marketplace database collections results in divergence when authors update questions, fix errata, or refresh media assets in `quiz-service`.
2. **Conflicting Execution Authority (Violation of ADR-002)**:
   Attempting to execute, track, or score quiz attempts within `marketplace-service` would violate ADR-002 ("Attempt execution has one active owner"), fragmenting attempt lifecycle logic across multiple services.
3. **Authorization & Creator Spoofing Risks**:
   Permitting unverified sellers to monetize quizzes they do not author, or trusting client-asserted payment receipts to grant quiz access, creates financial fraud, unauthorized monetization, and content piracy vulnerabilities.
4. **Media Exposure & Copyright Leakage**:
   Directly duplicating or exposing raw question media through unrestricted marketplace endpoints risks copyright infringement and bypasses `media-service` access controls and processing pipelines.
5. **Replay Attacks & Inconsistent Financial State**:
   Without client-driven idempotency keys and immutable audit records, network retries, race conditions, or concurrent checkout submissions could trigger duplicate charges, phantom licenses, or unrecorded entitlement grants.

## Alternatives
- **Alternative A: Monolithic Extension of `quiz-service`**:
  Embed catalog listings, pricing, payment checkout, and license tracking directly into `quiz-service`.
  *Rejected*: Bloats `quiz-service` with e-commerce, payment processing, tax calculation, and financial ledger concerns. Entangles authoring with transactional commerce, significantly increasing blast radius and regulatory compliance burdens (PCI DSS, financial auditing).
- **Alternative B: Duplicated Question Snapshots in Marketplace**:
  Copy the complete quiz tree (questions, answers, explanations, media URLs) into a marketplace listing document upon publishing.
  *Rejected*: Every question typo fix, accessibility correction, or image update would require distributed cross-service cache invalidation and snapshot reconciliation. Duplicating media URLs bypasses `media-service` access policies and accessibility metadata.
- **Alternative C: Client-Side Receipt Presentation**:
  Allow client web/mobile applications to receive an entitlement receipt from marketplace and pass it directly to `attempt-service`.
  *Rejected*: Susceptible to client-side credential replay, receipt forgery, and race conditions between license revocation and client attempt initiation.
- **Alternative D: Synchronous Question-by-Question Entitlement Polling**:
  Require `attempt-service` to call `marketplace-service` on every question fetch during an active quiz attempt.
  *Rejected*: Adds excessive cross-service network latency to every question transition, creating availability bottlenecks and single points of failure during quiz taking.

## Decision and reasons
We establish the following architectural policies, domain ownership boundaries, and security controls:

### 1. Service Ownership Boundaries
- **`marketplace-service` (Port 5013)**:
  - Exclusive owner of marketplace listings, catalog metadata (title, description, summary, tags, ratings, review counts, preview question counts), pricing models (free, one-time purchase, subscription), commercial licenses, learner entitlements, and future order/checkout lifecycles.
  - Listings store a reference `quizId` (or `contentId` with `contentType: 'quiz'`) pointing to `quiz-service`.
  - **Zero Duplication Invariant**: Marketplace collections NEVER store or duplicate quiz questions, option choices, correct answers, explanations, or question media files.
- **`quiz-service` (Port 5002)**:
  - Exclusive owner of quiz authoring, question banks, choices, explanations, drafts, category hierarchies, and quiz metadata.
  - Exposes an internal verification contract allowing `marketplace-service` to verify that an authenticated seller is the genuine, verified author of the referenced quiz.
- **`attempt-service` (Port 5004)**:
  - Exclusive owner of quiz attempt initialization, progress synchronization, timing enforcement, and final scoring per ADR-002.
  - **Entitlement Verification Gate**: Before allowing attempt initialization (`POST /api/v1/quiz/:id/attempt` or gateway equivalent) on paid/commercial content, `attempt-service` verifies with `marketplace-service` that the requesting user holds an active, unexpired entitlement. If the user lacks an entitlement, attempt initialization is rejected with HTTP 403 (`ENTITLEMENT_REQUIRED`).

### 2. Formalized Security Boundary Controls
- **Server-Side Authorization & JWT Claims Verification**:
  - `marketplace-service` independently verifies access tokens using `HS256` and the platform shared secret, validating claims (`id`, `exp`, token structure, revocation status).
  - API Gateway sanitizes requests by stripping client-asserted privileged headers (`x-user-id`, `x-role`, `x-internal-token`) per ADR-003 and forwarding verified `Authorization` and cookie credentials.
- **Creator Ownership Verification**:
  - A listing referencing a `quizId` can only be published, updated, or priced if `marketplace-service` confirms with `quiz-service` that `req.user.id` is the verified author or organization owner. Third-party listing creation is strictly prohibited.
- **Safe File & Media Access**:
  - Any preview or promotional media associated with a listing is managed via `media-service` references.
  - Raw question assets, explanation videos, and audio clips are never exposed or cloned into marketplace databases.
- **Immutable Audit Logging**:
  - Every listing state mutation (create, update, archive, publish), pricing modification, order transition, and entitlement action (grant, expire, revoke, refund) is written to an append-only audit trail.
  - Audit records contain `actorId`, `action`, `resourceId`, `requestId`, `timestamp`, `ip`, and before/after change hashes.
- **Replay Protection via Client-Supplied `Idempotency-Key`**:
  - State-mutating financial and entitlement endpoints (`POST /api/v1/marketplace/orders`, `POST /api/v1/marketplace/checkout`) strictly require an `Idempotency-Key` header (RFC 7231 / UUIDv4).
  - Keys are cached with an expiration TTL (e.g. 24 hours). Repeated requests with an existing key return the cached response without re-executing order creation or charging payment providers.

### 3. Versioned Future Contracts
- HTTP Endpoints: Governed by `contracts/marketplace-api.v1.json` (`/api/v1/marketplace/*`).
- Asynchronous Events: Governed by `contracts/marketplace-events.v1.json` (`marketplace.*.v1`).

## Consequences
- Clean separation of concerns between educational content authoring (`quiz-service`), quiz attempt execution (`attempt-service`), and monetization (`marketplace-service`).
- Zero data synchronization overhead or stale question errata across services.
- Attempt initialization on commercial quizzes requires a single low-latency entitlement check.
- Phase 1 isolates business routes at the API gateway, returning HTTP 404 until Phase 2 CRUD and payment handlers are implemented.

## Migration
1. Commit standalone `docs/adr/ADR-006-marketplace-architecture.md` and append ADR-006 to `docs/enterprise-upgrade/19-architecture-decisions.md`.
2. Commit `contracts/marketplace-api.v1.json` and `contracts/marketplace-events.v1.json`.
3. Scaffold `services/marketplace-service` on port 5013 with baseline health/readiness probes and authentication middleware.
4. Reserve `/api/v1/marketplace` in `api-gateway`, routing health probes to port 5013 and isolating business routes.
5. In Phase 2: Implement MongoDB collections, seller verification RPCs, Stripe checkout flows, and `attempt-service` entitlement interceptor.

## Rollback
- Reverting ADR-006 requires no database rollback or data migrations, as Phase 1 introduces no schema modifications or active order records.
- Rollback involves removing `/api/v1/marketplace` proxying in `api-gateway` and stopping `marketplace-service`.
