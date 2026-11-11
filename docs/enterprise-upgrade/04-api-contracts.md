# Messaging API contracts

Quiz and challenge media uploads, private playback, and attempt question snapshots are documented in the [accessible multimedia API contract](20-accessible-media-worklog.md#gateway-api).

Base path `/api/v1/messages` through the gateway. Requests use the existing access-token cookie or supported Bearer token. Cookie-authenticated writes require the matching CSRF cookie/header. Common success shape is `{ success: true, data: ... }`. Common errors include `400` invalid input, `401` invalid session, `403` permission or CSRF failure, `404` absent or inaccessible thread/message, `409` idempotency or write conflict, `413` body too large, `429` budget exhausted and `5xx` service failure. Sender IDs from clients have no authority. Clients should use `X-Request-ID` for support.

| Method and path | Request | Authorized result and pagination | Consumers and compatibility |
|---|---|---|---|
| `GET /conversations` | `page` 1–10000, `limit` 1–100, default 30 | Participant inbox. `conversations`, `total`, page metadata, `otherParticipant`, latest visible preview and unread count | Desktop and mobile. Timestamp and ID order, newest first |
| `POST /start` | `recipientId` or `username` (`recipientUsername` accepted), optional `initialMessage`, `quizId`, `commentId`, `link`, `clientMessageId` | Active recipient and allowed DM policy. `conversation`, optional `message`, HTTP 200 | Both clients, Share dialog and Social legacy adapter. Invalid recipients fail explicitly |
| `GET /conversations/:conversationId` | `limit` 1–100, default 50, optional `before` or `after`, `q` max 100 | Membership required. `{ conversation, messages, total, pagination: { limit, hasMore, nextCursor, prevCursor } }`. `total` counts returned rows. First page selects latest messages, returned oldest to newest | Both clients. Older page uses `before=nextCursor`, newer page uses `after=prevCursor`. Cursor must belong to caller's visible thread |
| `POST /conversations/:conversationId/messages` | `text` up to 2000 chars or supported reference payload, optional `replyTo.messageId` and `clientMessageId` (8–100 safe characters) | Participant and recipient policy. HTTP 201 `{ message }`, including on a recognized retry. One sender key belongs to one conversation | Both clients. Reply display snapshot comes from stored source message |
| `PATCH /conversations/:conversationId/read` | Optional `messageIds`, up to 200 | Participant only. `{ unreadCount }`. Omitted IDs acknowledge up to 200 eligible rows. Empty array acknowledges none | Both clients. Only consented, acknowledged IDs are published as read receipts |
| `GET /unread-count` | No body | `{ unreadCount }` for caller's conversations | Sidebar and mobile header |
| `GET /search-users` | `q` max 100, optional | `{ users }`, public member card fields. Respects discovery opt-out and basic account eligibility | New-chat selectors. Search visibility does not itself authorize sending |
| `PATCH /:messageId` | `text` 1–2000 chars | Visible own, non-deleted message within 15 minutes. `{ message }` | Existing editing UI and socket equivalent |
| `DELETE /:messageId` | `mode=me` or `mode=everyone` (default) | `me` hides for caller. `everyone` requires sender and scrubs the message and quotes. `{ messageId, conversationId, mode, isDeleted }` | Existing UI. Tombstone keeps IDs and ordering |
| `POST /:messageId/reactions` | Nonempty `emoji` up to 32 chars | Visible, non-deleted message in member thread. `{ message }`. Same emoji toggles off, different emoji replaces user's reaction | Both clients |

`Message` includes `_id`, `conversation`, `sender`, `text`, `type`, `createdAt`, `updatedAt`, optional `clientMessageId`, `deliveryStatus`, edit/delete flags, and permitted media or reference metadata. `readBy` and `deletedFor` remain internal. The included clients use `deliveryStatus` and authorized receipt events. A reply accepts the ID only as authority, regardless of extra client preview fields.

The desktop app is the Step 01 client target. The standalone mobile source remains at its baseline. It continues to use v1 routes and accepts the existing `messages`, `conversation`, and `deliveryStatus` fields. Its UI does not consume the new history cursor or send retry key. External consumers using the raw internal arrays need to move to the public status/event contract.

The legacy `POST /api/v1/social/quizzes/:quizId/share-direct` retains HTTP 201 and `{ conversationId, messageId }`. It forwards verified identity headers to Messaging. `PATCH /api/v1/auth/me` validates supported preference fields. `GET /api/v1/auth/me/sessions` lists active tracked devices with IP, user-agent, and locale/time zone; location coordinates are not requested during sign-in. `POST /api/v1/auth/me/sessions/:sessionId/revoke` requires `currentPassword` to revoke one other device, and `POST /api/v1/auth/me/sessions/revoke` requires `currentPassword` to revoke all other sessions while preserving this browser. The desktop settings page refreshes its active-session list every three seconds while visible and notifies when a new device signs in. `GET /api/v1/health` and `/readyz` return 503 when dependencies are degraded. `/livez` tests gateway process availability.

Socket.IO `/socket.io` uses existing event names. Client sends `conversation:join`, `conversation:leave`, `typing:start`, `typing:stop`, `message:send`, `message:read`, `message:edit`, `message:delete`, `message:reaction`, and `presence:get`. Optional acknowledgements use `{ success, data }` or `{ success: false, error }`. Server events include `message:new`, `message:edited`, `message:deleted`, `message:reaction_update`, `message:read_status`, `conversation:updated`, `conversation:unread_cleared`, `typing:update` and `presence:update`. Conversation events are scoped to authorized subscriptions. Personal hide and inbox state use personal rooms.

Keep `/api/v1` while adding fields and optional behavior. Add a separately versioned contract only when membership or read semantics cannot be represented compatibly. Generate an OpenAPI spec alongside stable schema validation in Step 02 to keep one contract source.

## Step 03 identity and privacy

| Route | Contract |
|---|---|
| `POST /api/v1/auth/login` | Accepts username or email in `email` or `identifier`. Session stays in HttpOnly cookies |
| `GET /api/v1/auth/bootstrap` | Existing `{ authenticated, user }` envelope. May rotate a valid refresh credential. Rejected sessions return `authenticated: false` |
| `POST /api/v1/auth/refresh` | Only one use of the current refresh credential can succeed. A rejected refresh returns 401 without setting cookies |
| `POST /api/v1/auth/logout` | Clears the browser cookies. A valid session advances the account's revocation version |
| `GET /api/v1/quiz/:id/analytics` | Returns 403 while challenge results are sealed |
| `GET /api/v1/quiz/:id/attempts` and `/api/v1/quizzes/:id/attempts` | Return empty attempts and pagination with `quarantined: true` while sealed |
| Attempt result and history aliases | Guest session keys are internal. Uploader access to another participant's challenge attempt starts at the deadline |
| Notifications list and aliases | Unauthorized historical quiz/comment references are redacted |
| `PATCH /api/v1/social/notifications/:id/read` and alias | Returns the owned notification's `_id` and `readAt` only |
| `POST /api/v1/admin/users/:id/role` | Requires the caller's current global admin role. A role change revokes the target's earlier sessions. A concurrent role change returns 409 |
| `GET /api/v1/admin/overview`, `/users/:id`, and `/content/:id` within Admin | Embedded audit and report arrays are empty without the corresponding permission. Resource details remain available under their existing permissions |

See [authentication and sessions](22-authentication-and-sessions.md) and the [authorization matrix](23-authorization-policy-matrix.md).
