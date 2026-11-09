# Step 02 migration, rollout and rollback

No production database was contacted for verification. No destructive migration, collection rename, identifier replacement, bulk backfill, data rewrite or deployment was performed. `isRestricted` is an additive projection field in Attempt/Social's existing Quiz schemas. Existing true values are now respected. Tests seed and alter only a guarded loopback `quizfocus_verification` database.

## Rollout order

1. Back up and rehearse restore in staging. Capture existing version, index/capacity metrics and attempt counts. Use Step 01 read-only DB diagnostics. These deployment prerequisites are still outstanding.
2. Provision Admin access through a persisted `role: admin` or explicit AdminMembership/AdminRole before rollout. `ADMIN_EMAIL` is retained as legacy configuration but no longer grants permission. An email-only operator must be explicitly provisioned; it must not silently retain wildcard access.
3. Deploy Attempt's compatible route resolver and finalizer. Set Quiz's `ATTEMPT_SERVICE_URL` to the private Attempt origin; `.env.example` supplies loopback for local development and Compose supplies its service hostname. A bad origin or timeout fails configuration loading.
4. Cut over Quiz's relay and stop the old Quiz expiry process as part of the same controlled backend release. Drain both processes during this ownership handoff to avoid an old Quiz finalizer and new Attempt finalizer overlapping. The compatibility release is coordinated; rolling replicas independently across the boundary is not validated.
5. Deploy the selected gateway and Social/Quiz policy fixes, then desktop. Existing public paths, cookies, CSRF header names, ObjectIds, success data and legacy `message` fields remain. Test callers that treated timeouts as 502; the correct timeout status is now 504.
6. Run the full isolated/staging contract suite, smoke existing guest sessions and symbolic quiz codes, verify moderation takes effect across domains, and monitor real latency, 5xx/504s, relay failures, active/completed attempts and finalizer errors.

Canonical `/attempts` remains directly routed. Nested Quiz attempt URLs now incur a second HTTP hop with a 15s default relay deadline. There is no fallback to a second scoring implementation. A timeout does not prove a write failed; fetch current attempt state before retrying submission. Neither gateway nor relay automatically retries a mutation. Durable submission idempotency and race fencing remain separate work.

Public quiz details and trending tags now query current policy rather than use an uncoordinated local response cache. This intentionally trades some DB read cost for immediate moderation visibility on these paths. Query/load benchmarks and revision-aware cache invalidation are prerequisites to reintroducing that cache safely.

## Rollback

Retain additive fields, records and indexes. A coordinated backend rollback must restore exactly one expiry scheduler and compatible API routing. Do not independently restore Quiz's old finalizer while Attempt's new worker is running. Prefer a forward fix or temporarily pause attempt ingress during a failed ownership rollout. Do not roll back the Admin email fix or the restricted-content projection/read fixes. They close confirmed authorization defects.

Desktop progress-route correction is compatible with both the preceding backend and this one. Gateway structured error fields are additive; reverting only the envelope requires retaining HTTP status behavior expected by consumers. No rollback needs to delete content or remove the `isRestricted` field.

## Remaining work by program step

| Priority | Follow-up | Step |
|---|---|---|
| P0 release prerequisite | Supported runtime/dependency pass, backup restore, production ingress and secret handling | 19/20/22 |
| P1 | Dedicated sessions, rotation/reuse detection, policy/audience/issuer consistency, admin provisioning and passive socket restriction eviction | 03 |
| P1 | Field registry, inactive copied model removal, owner APIs, Mongo roles after real writer migration | 04 |
| P1 | Remove unmounted attempt code from Quiz and prove import/manual authoring equivalence | 06 |
| P1 | Consolidate legacy challenge definition APIs, single-winner attempt transitions, creator/deadline concurrency and result privacy matrix | 07 |
| P1 | Identity follow alias → Social owner, consistent social counters | 08 |
| P1 | Messaging V2 membership and group scope, attachment policy | 09/13 |
| P1 | Idempotent notifications/events, outbox/reconciliation, worker leases and replica fencing | 10/18 |
| P2 | Shared transport package when justified, logging interface, benchmarked caches | 16/17 |

Step 02 completes the chosen bounded implementation slice and records the remaining architecture debt. It does not establish production readiness or complete every future migration.
