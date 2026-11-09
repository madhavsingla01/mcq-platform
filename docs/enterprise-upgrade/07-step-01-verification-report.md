# Step 01 verification

## Messaging follow-up — November 8, 2026

The latest desktop request supersedes the earlier document-scrolling behavior described in the historical browser evidence below. The inbox list and conversation stream now have separate scroll containers within the viewport. The thread header and composer stay outside those scroll containers. The inbox All/Unread/Settings row and visible composer hint/counter were removed. Outgoing bubbles use a lighter orange background with dark brown text, and conversation search sits at the right edge of the thread header. Long member names truncate within the header.

This follow-up also fixes live deletion leaving quoted text in search results, clears revoked reply/edit targets, refreshes search results after a socket reconnect, and removes corrupted text from empty/deleted-message states. A shared deletion reducer applies the same rule to history and search, including when the original message is outside the current search page.

Validation for this follow-up uses disposable local data. All 134 existing regression checks passed, along with 14 chat/settings integration scenarios (15 Node test results including the parent suite) and 14 unit tests. Added scenarios verify successful live HTTP/WebSocket delivery, replies, edits, reactions, read receipts, typing, revocation, outsider socket denial, and fetching current state after reconnecting. The deletion regression test checks a search result containing only a quote of the revoked message. The desktop production build passes.

Fresh visual verification could not run in this session. Browser inventory was empty and both the browser access host and native computer-use connection were unavailable. The earlier screenshots and browser observations below are historical evidence, not verification of the current independent-scroll layout. Production network-fault, multi-instance and accessibility checks remain release work. No files in `apps/mobile-web` were changed.

The application passed its regression suite against a separate MongoDB process. The verifier generates its own signing keys and database directory, starts all ten backend processes on free ports, waits for readiness, and stops its own processes. The integration suite rejects database URIs other than the local verification database. The user database was outside the verification target.

| Check | Command or method | Result and limitation |
|---|---|---|
| Initial E2E | `npm test` before an isolated stack was available | API assertions failed to connect to port 5000. Static assertions still ran |
| Root regression | `npm run test:integration` | 134 existing checks passed on the disposable stack. Suite contains static and HTTP checks |
| Chat/settings integration | Same command, `tests/integration/chat-settings.test.mjs` | 11 scenarios passed in one integration suite. Auth, MongoDB persistence, same-time pagination, sender/membership validation, CSRF, privacy, dedupe, reactions, deletion, legacy direct share and session revocation use real HTTP and WebSocket calls |
| Focused tests | `npm run test:unit` | 13 passed. Gateway policy, request forwarding, settings validation, optimistic reconciliation, drafts, and bounded cache behavior |
| Quiz and media | `npm --prefix services/quiz-service test -- --runInBand`; `npm --prefix services/media-service test` | 67 quiz and 3 media tests passed |
| Desktop build | `npm run desktop:build` | Vite production build succeeds. Existing mixed static/dynamic `imageCompressor` warning |
| Compose | `docker compose config --quiet` | Configuration parsed. Images and production topology were not started |
| Source and scope | esbuild source parse and `git diff --check` on the changed areas | 581 JS/JSX/TS files parsed. The standalone mobile directory has no working tree or staged diff |
| MongoDB | `npm run db:check` and history query `explain('executionStats')` | Read-only diagnostic succeeded on verification DB. Query used `conversation_1_createdAt_-1__id_-1`, returning 20 rows from 20 keys and documents examined in the seeded thread |
| Advisory | Installed package metadata and `npm ls` | All ten backends resolve the patched `proxy-addr@2.0.8`. Other dependency findings remain in the risk register |
| Browser | Isolated desktop account via Vite and gateway | See final observed scenarios below. The standalone mobile source is outside scope |

## Historical browser evidence before the November 8 follow-up

- An unauthenticated thread URL redirected to login. Sign-in opened the same conversation and displayed its recent messages and unread count.
- On a 43-message test thread, history used document scrolling. The thread header, inbox and composer remained accessible. The composer stayed sticky at 1280 px and 390 px, with no horizontal overflow at 390 px.
- Searching for `Biology` produced one match. Loading earlier messages brought in the oldest test message.
- Enter submitted while Send with Enter was enabled. Recipient denial displayed an error and restored the draft. Retrying after restoring permission persisted one message, which still appeared once after reload.
- The 44 px Send with Enter switch responded to Space. With the option off, Enter inserted a newline. Settings navigation and browser back/forward preserved the per-thread draft.
- The review caught a clipped narrow layout, an invisible switch hit area, an inbox that disappeared on long pages, and low contrast on outgoing bubbles. Those paths were corrected. Screen reader interoperability on physical devices and all empty/loading variants were not exhaustively tested.

## Implementation and coverage map

| Code | Before and after | Compatibility and coverage |
|---|---|---|
| [Message controller](../../services/message-service/src/controllers/message.controller.js), [domain operations](../../services/message-service/src/services/messaging.service.js), [policy](../../services/message-service/src/services/messagePolicy.js), [socket handler](../../services/message-service/src/socket/socketHandler.js) | Separate REST and socket implementations could diverge. Both now use the same authorization and mutation rules | Existing routes and events retained. Real gateway/DB/socket tests cover cross-user privacy, spoofed senders, missing auth, invalid input and revocation |
| [Message model](../../services/message-service/src/models/Message.model.js), [conversation model](../../services/message-service/src/models/Conversation.model.js) | Timestamp-only paging and unguarded races now use stable ordering and partial unique keys | Old rows without keys remain readable. Integration tests cover concurrent start/send retries and equal timestamps |
| [Share UI](../../apps/desktop-web/src/components/social/ShareModal.jsx), [Social adapter](../../services/social-service/src/controllers/social.controller.js) | Demo contacts and fallback recipient selection are replaced by real contacts and explicit denial | Legacy response tested for success, blocked recipient, missing recipient and restricted preview |
| [Desktop Messages](../../apps/desktop-web/src/pages/Messages/Messages.jsx), [chat state](../../apps/desktop-web/src/pages/Messages/chatState.js), [layout](../../apps/desktop-web/src/components/layout/MainLayout.jsx) | Independent inbox/thread scrolling, simpler composer, cursor history/search, scoped unread acknowledgements, draft recovery and consistent quote revocation | Desktop routes kept. Current build/state/API checks and historical browser evidence are distinguished above |
| [Settings store](../../apps/desktop-web/src/store/settingsStore.js), [Messaging settings](../../apps/desktop-web/src/pages/Settings/components/MessagingSettings.jsx), [Auth preferences](../../services/auth-service/src/utils/preferences.js) | Browser-wide state and arbitrary preferences become account-scoped state and validated atomic updates | Unknown keys now receive 400. Concurrent patches, server privacy and keyboard preference were verified |
| [Gateway](../../services/api-gateway/src/server.js), [runtime policies](../../services/api-gateway/src/runtime.js), service health and DB configs | Constant healthy responses and unbounded waits become readiness, liveness, deadlines, request IDs and bounded pool waits | Degraded health returns 503. Gateway tests verify cookies, forwarded IP spoofing and dependency failures |
| [Verification harness](../../scripts/verify-stack.mjs), [database check](../../scripts/database-check.mjs), [quiz cache](../../services/quiz-service/src/services/cache/memory-cache.js) | Verification provisions disposable data, DB diagnostics inspect indexes, and the cache caps entries and collapses duplicate reads | New test accounts replace the hard-coded test identity. Cache tests verify expiry and invalidation |

## Running verification locally

From `mcq-platform/`, install the app and service dependencies, then run:

```powershell
npm run test:unit
# If mongod is not on PATH, provide the path to an installed MongoDB executable.
$env:MONGOD_BINARY = 'C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe'
npm run test:integration
npm run desktop:build
```

`npm run verify:serve` keeps an isolated backend up for browser checks. Read `.runtime/verification.json` for its gateway URL. Set `VITE_API_URL` to that gateway plus `/api/v1` and `VITE_DEV_PORT=5183` before starting the desktop Vite process bound to `127.0.0.1`. The verifier allows that origin for test cookies and sockets. Use synthetic accounts. Stop the preview processes when done.

## Evidence boundaries

The remaining gaps include production ingress and cookie behavior, long-running socket recovery under network faults, injected post-write database faults, replica load, backup/restore, full WCAG conformance, and the challenge concurrency/quarantine matrix. These checks are release work. See [risk register](05-security-and-risk-register.md) and [Step 02 prerequisites](06-migration-roadmap.md).
