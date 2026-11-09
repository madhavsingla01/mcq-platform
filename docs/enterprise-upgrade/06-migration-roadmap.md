# Migration roadmap and database decision

## ADR-001 · Keep MongoDB for QuizFocus

**Status:** Accepted for Step 01. The application already uses Mongoose, ObjectId relationships, MongoDB aggregation pipelines and shared collections. Retaining MongoDB preserves existing records and lets chat add indexes without rewriting surrounding services. Measure contention and real query cost before changing database technology.

| Option | Fit for QuizFocus | Decision |
|---|---|---|
| Local or self-hosted MongoDB Community | Existing code and data work directly. No managed database subscription. You own disk, updates, backups and operations | Default for development and isolated verification |
| MongoDB Atlas Free | Same Mongoose APIs and a hosted option for a small pilot. 512 MB covers data plus indexes, with further operational limits | Optional development or demo target after measuring database size and access patterns |
| PostgreSQL through Supabase Free | Useful relational constraints, but a different query model and an application-wide migration. The free plan includes 500 MB per project | Consider for a future domain with a measured need for relational storage |
| Valkey | Open-source in-memory storage for ephemeral coordination and caching | Candidate when chat needs replicas. Durable chat stays in MongoDB |

Sources: [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) · [Supabase pricing](https://supabase.com/pricing) · [Valkey introduction](https://valkey.io/topics/introduction/) · [MongoDB pool options](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/)

Use matching `MONGO_URI` values for services that intentionally share platform collections and a separate media database as configured. Set the Admin URI aliases accordingly. For a hosted pilot use the provider's TLS URI in each service's untracked environment. Keep `JWT_SECRET` consistent across services and a separate refresh secret in Auth. Never place URIs or secrets in a Vite environment. The pool defaults to ten application connections per service process, with no minimum and a five-second pool wait. The driver's monitoring connections and the number of replicas count separately. Tune `MONGO_MAX_POOL_SIZE` per service process using pool wait, query latency, and peak concurrency. Compose's local MongoDB port binds to loopback.

```powershell
# Read-only check against the Auth service's configured database
npm run db:check
# To target an explicitly chosen staging URI, supply DATABASE_CHECK_URI in the shell environment.
```

## Step 01 rollout and rollback

1. Back up and rehearse restore on a separate environment. Use `db:check` to review index definitions, size and duplicate direct-pair count. Record dashboard latency and socket errors before rollout.
2. Create the additive `directKey` and `(sender, clientMessageId)` partial unique indexes and the message timestamp/ID index in staging. New writes use those keys. Existing rows without keys stay readable. Verify index build permissions and completion before enabling traffic, especially on a constrained tier. Messaging waits for its conversation and message models to initialize before listening.
3. Release Messaging and its compatible Social adapter together, then desktop. Mobile code remains outside this rollout. Keep v1 paths, cookie names, and IDs. Updated receipt serialization omits raw `readBy`. Test any additional client that assumed that field or the previous oldest-page default.
4. Monitor readiness, gateway 5xx and timeout rates, duplicate-key recovery, bounded-search latency, unread-count discrepancies, and socket reconnects. Use a small canary before any wider rollout.
5. Rollback can leave additive indexes and fields in place. Do not delete user content or undo redaction. Rolling back to a build with the legacy direct-share fallback or authorization bypass would reintroduce known defects. Use a forward fix or temporarily disable that route if necessary.

## Step 02 handoff

- **Prerequisites:** Capture the staging size, duplicate-pair count, and index plans. Agree on direct-message privacy, group membership semantics, read-receipt consent, and an audit/retention policy. Establish a reliable backup and restore path. Add a supported runtime/dependency validation job before a public rollout.
- **Modules:** `message-service/src/models`, `services/messaging.service.js`, `messagePolicy.js`, `message.routes.js`, socket handler, Social's compatibility route, and desktop message client/store. Coordinate Auth, Quiz, Challenge, and Media contracts where Messaging reads their metadata.
- **Schema expansion:** Add membership/read-state models only after agreeing on group and unread behavior. Detect ambiguous legacy pairs before backfilling. Keep IDs and messages. Backfill only unambiguous rows with bounded batches and an idempotent checkpoint. Do not merge duplicate conversations automatically.
- **Transition:** Shadow-read and compare unread counts/permissions. Keep v1 adapters during rollout. Introduce typed APIs and response validation with a rollback switch before switching authoritative reads. Validate privacy with two distinct sessions and concurrent traffic.
- **Following steps:** Stabilize group/membership writes and moderation before enabling group UI. Add durable event delivery and cross-replica coordination after the read model and client reconciliation are proven.
