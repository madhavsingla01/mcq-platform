# Messaging V2 architecture proposal

Step 01 keeps the existing process and data layout. The changes establish one authorization and mutation path for REST and sockets. Group features and replica-aware delivery remain proposals.

| Responsibility | Owner | Boundary |
|---|---|---|
| Conversation, membership, message lifecycle and read state | Messaging | Own chat collections and authorize every read, subscription and mutation |
| Identity, sessions and account preferences | Auth | Validate current identity and provide only required projections |
| Follows, blocks and feed | Social | Provide relationship checks or a clearly owned read projection |
| Quiz and challenge previews | Quiz and Challenge | Provide authorized public metadata. Attempt and Challenge enforce timer, eligibility and result rules when links open |
| Media | Media | Validate and store uploads. Chat should reference assets and use a participant-aware access path for private attachments |
| Inbox, notifications and moderation | Messaging, Social and Admin | Messaging emits typed durable events. Notification and moderation consumers own their records and enforce retention and permission rules |

## Data candidates for Step 02

Keep current `Conversation` and `Message` identifiers. Retain direct keys for existing direct-message compatibility. A `ConversationMembership` collection with a unique `(conversationId,userId)` key becomes useful when groups, membership changes or per-user inbox state require it. Prefer a last-read `(createdAt,messageId)` cursor per membership when read semantics are contiguous. Define exceptions for per-message hiding, read-receipt opt-out, and messages viewed out of order before replacing current `readBy`. Do not silently recalculate consent or shared receipts from private read state. Evaluate a bounded outbox separate from `Message` once durable cross-service delivery is required.

## Realtime strategy for Step 04

Keep authorized Socket.IO rooms and the existing JWT cookie boundary. Authenticate handshakes, reject untrusted origins, expire credentials and recheck membership on state changes. Treat event deliveries as hints until the server has persisted the record. Use monotonic event IDs or an ordered cursor for reconnect catch-up, with idempotent application of updates by message ID and event version. Query REST on gaps and after offline periods. Bound event payloads, per-account mutation budgets and queued delivery. Separate ephemeral typing/presence from durable messages and moderation actions.

One Messaging process is the current deployment target. When load measurements justify replicas, compare a compatible shared Socket.IO adapter and edge routing against a single process with sufficient headroom. Polling across replicas also needs routing affinity. Valkey is a candidate for ephemeral coordination. Pub/sub alone cannot replay missed events, so plan a stored cursor or outbox separately. [Valkey overview](https://valkey.io/topics/introduction/)

Trace gateway request ID, authorization result, MongoDB operation latency, duplicate-key recovery, delivery backlog, and socket handshake/rejoin failures. Use low-cardinality metric labels and never include conversation text, search terms or credentials. Add OpenTelemetry when cross-service tracing has an owner and a collection target. [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
