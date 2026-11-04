# QuizFocus current implementation roadmap

This roadmap adapts the supplied Challenges specification to the repository as it exists now. It excludes `apps/mobile-web` as requested. The specification remains a source of domain requirements, but its implementation claims and commands are not assumed to match the current code.

## Current architecture baseline

- **API Gateway** is the public entry point and already has a `/api/v1/challenges` proxy configured for `challenge-service`.
- **Challenge Service** is a new dedicated service for challenge content, publication, discovery, and challenge-specific reads. It shares the `quizzes` collection for compatibility with existing quiz records.
- **Quiz Service** still owns standard quiz authoring and also contains legacy challenge creation, validation, and challenge-related reads.
- **Attempt Service** owns quiz and competitive attempt execution, answer persistence, scoring, and attempt finalization.
- **Social Service** currently supplies the desktop challenge overview and social interactions.
- **Auth Service** owns identity and account state; **Admin Service** owns moderation and audit; **Media Service** owns image processing.
- **Desktop Web** is the supported client in this work. Its challenge builder now posts to Challenge Service, while attempt execution remains with Attempt Service.
- Services share the `mcq-platform` Mongo database today. Collection ownership and cross-service writes need an explicit migration plan before databases are separated.

## Progress snapshot (2026-10-31)

- Challenge Service is included in local startup, installation, Docker Compose, gateway routing, environment examples, and admin health configuration.
- Challenge Service supports owner-bound draft autosaves and publishing a saved draft in place. Draft content is excluded from public discovery; draft details and attempts require owner/admin access.
- Attempt Service requires an account for competitive challenge participation and has a partial unique index for one official attempt per user/challenge. Creator practice attempts remain outside that index.
- Attempt and Quiz Service read guards treat invite-only, restricted, and draft challenges as private. Challenge question validation rejects missing or invalid correct-answer indexes instead of silently marking a fallback option.
- Legacy challenge writes remain in Quiz/Attempt Service, private invitations/approvals are not implemented, and deadline finalization is not backed by a durable worker.
- The configuration sweep removed embedded credentials and deployment URLs and moved import row caps and cache TTLs into validated service configuration. Rate limits, database pools, additional timeouts, and UI behavior still contain tunable values. Phase 7 is not complete.

This snapshot records implemented slices; it does not mean the acceptance criteria for Phases 2–8 have passed. Verification and data review are required before removing compatibility paths or treating the new attempt index as a production migration.

## Phase 1 — Make the current service topology runnable

1. Add Challenge Service to local service startup, installation, Docker Compose, environment examples, health reporting, and admin system-health configuration.
2. Remove weak default JWT secrets and reflected-origin CORS from Challenge Service; require the same configured access-token key and trusted client origins as the other services.
3. Add the Challenge Service URL and port to root/service environment examples; keep local secrets out of tracked files.
4. Verify gateway health reports the service accurately and that service startup fails clearly when required configuration is missing.

**Acceptance:** A fresh documented setup starts the gateway and all supported services with explicit configuration; `/api/v1/challenges` reaches Challenge Service and health checks include it.

## Phase 2 — Establish one challenge write path

1. Make Challenge Service the owner of challenge creation, draft updates, publication, challenge metadata, visibility, and restriction state.
2. Keep standard quiz creation and question banks in Quiz Service.
3. Move the desktop challenge builder to the Challenge Service contract while preserving its current user workflow.
4. Remove or deprecate legacy challenge writes in Quiz Service only after parity, data compatibility, and route coverage are verified.
5. Keep compatibility reads for existing challenge records and `quizCode`/`challengeCode` identifiers during migration.

**Acceptance:** New challenges have one authoritative write path; old records remain accessible; repeated publish requests do not create duplicate challenges.

## Phase 3 — Enforce competitive invariants across service boundaries

1. Centralize access and eligibility policy for public, private, restricted, expired, and creator-practice cases.
2. Enforce the single competitive attempt rule atomically in Attempt Service and add a compatible unique index after duplicate-data inspection.
3. Compute each attempt cutoff as the earlier of its personal duration and the challenge global deadline.
4. Validate start, answer update, synchronization, manual submit, timeout, result access, and leaderboard reads on the server.
5. Keep creator practice attempts out of ranked results and participation counts.
6. Lock questions, timing, and scoring rules after the first competitive start.

**Acceptance:** Race tests cover concurrent starts, answer writes at cutoff, manual/automatic submission races, creator attempts, and access revocation.

## Phase 4 — Reliable finalization and official results

1. Separate lifecycle, moderation, and finalization status.
2. Process expired attempts and challenges with a durable, retry-safe worker; retain a bounded indexed scan as recovery.
3. Make submission and finalization idempotent.
4. Materialize a deterministic leaderboard only after finalization completes; keep results quarantined while work is pending or failed.
5. Version leaderboard snapshots and invalidate local/shared caches when official results change.
6. Add an administrative recovery and audit path for failed finalization.

**Acceptance:** Expired challenges reach an auditable result state without requiring a browser to remain open; retrying a job cannot duplicate awards or change ranks.

## Phase 5 — Complete private access and social workflows

1. Implement invitation and approval records in the owning service, with revocation and expiry rules.
2. Apply one access policy to discovery, detail, code lookup, attempt start, and leaderboard endpoints.
3. Use cryptographically secure access codes, rate limits, and hashed secrets where a room code is retained.
4. Connect bookmarks, invitations, reminders, and overview cards to the authoritative Challenge Service contract.

**Acceptance:** Knowing an ID or code cannot bypass private access; reminders and invitations are idempotent and auditable.

## Phase 6 — Administration, integrity, and operations

1. Add explicit admin permissions for challenge restriction, restoration, user eligibility, and incident investigation.
2. Record actor, reason, target, request ID, and before/after state for sensitive operations without storing secrets.
3. Treat focus telemetry as evidence only; never use it as automatic proof of cheating.
4. Add request correlation, deadline/finalization lag metrics, duplicate-attempt alerts, and audit persistence alerts.
5. Document recovery steps and data retention for challenges, attempts, and media.

**Acceptance:** Unauthorized admin actions fail server-side and every sensitive change is attributable.

## Phase 7 — Configuration and hard-coded-value removal

1. Move deployment-specific values (ports, service URLs, client origins, database URLs, storage paths, secret keys) into validated environment configuration.
2. Move changeable business limits (question/duration limits, pagination caps, upload limits, rate limits, lockout durations, cache TTLs, timeouts, retention windows) into service configuration with documented defaults in `.env.example` or a typed policy module.
3. Remove duplicated configuration and magic values; use named constants for fixed domain rules and units for duration values.
4. Keep protocol and domain identifiers (route names, enum literals, HTTP status codes, schema field names, MIME types) explicit in code; these are contracts, not deployment configuration.
5. Add startup validation for missing, malformed, unsafe, or contradictory values; never fall back to known credentials.

**Acceptance:** No secrets or environment-specific endpoints are embedded in application code; operational and business-policy values have one documented source per owning service.

## Phase 8 — Verification and rollout

1. Add unit, integration, race, security, and migration checks for each invariant.
2. Inspect current duplicate attempts and existing challenge records before adding indexes or changing ownership.
3. Roll out compatibility reads before switching writes; monitor error rates and reconcile data before removing legacy paths.
4. Update API contracts, service ownership, setup instructions, and this roadmap as features land.

**Acceptance:** The desktop flow, gateway, services, database behavior, and operational documentation agree on the same contracts.

## Configuration-removal scope

“Remove hard-coded values” means eliminating embedded secrets, deployment endpoints, environment-specific settings, and unnamed tunable thresholds. Fixed domain contracts and algorithm constants remain explicit, named, and documented; moving every literal (for example, `true`, an HTTP status code, or an enum value) into environment variables would make the system less safe and harder to reason about.
