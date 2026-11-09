# Security verification matrix

The integration commands start a loopback MongoDB with a new temporary database and independent signing keys. Set `MONGOD_BINARY` if MongoDB is outside PATH. The media suite also needs configured FFmpeg and FFprobe. Fixtures use generated users, quizzes and clips.

| Command or check | Result | Evidence |
|---|---|---|
| `npm run test:unit` | 28 passed | Includes local redirect safety, logout failure, and a session check that returns after successful logout |
| `npm run test:integration` | 134 legacy E2E tests and 32 Node tests passed | Includes identity, role revocation, audit permissions, privacy, quiz lifecycle, and messaging |
| `npm run test:security:production` | 1 passed | Production Auth behind the local gateway. Verifies allowed and blocked origins, CORS preflight, Secure and HttpOnly attributes, CSRF rejection, cookie expiry and refresh rate limits at HTTP level |
| `npm run test:media` | 7 passed in the previous Step 03 pass | Owner versus participant clip authorization, private alternatives, retries, snapshots, sealed timed results and legacy text/import |
| `npm run desktop:build` | Passed | Production assets generated |
| Desktop preview with the in-app Chromium browser | Passed | Disposable participant signed in and started the spoken sample. Explore stayed open during a rebuild. Opening the quiz recovered on the new bundle and showed the existing attempt |
| Desktop sign-in and registration in Chromium | Passed | An anonymous Admin request returned to sign-in with the requested path preserved. Keyboard Tab reached the named identifier field. Both forms exposed programmatic labels in the browser accessibility tree |
| Deployed TLS and browser cookie policy, mobile-web UI, multi-replica abuse limits and socket behavior | Unexecuted | Local HTTP header coverage does not exercise deployment ingress, browser cookie storage or multiple replicas |

The first integration run passed all 134 legacy tests and failed one new fixture. The fixture used a comment-like action to create a notification. It now uses the real reply notification path, and the rerun passed.

Run `npm run test:security` for the focused identity and architecture suites. They cover login by username, cookie attributes and invalid origins, legacy refresh migration, concurrent replay, invalid algorithms and claims, revoked access across five services, passive socket revocation, missing CSRF values, sealed quiz and attempt routes, and current privacy on notification list and mark-read. Separate regression coverage exercises unauthorized thread joins, message mutation, cached discovery restriction, import ownership and the normal quiz lifecycle. Exact route and assertion details are in `tests/integration/identity-security.test.mjs`, `platform-architecture.test.mjs`, `chat-settings.test.mjs` and `accessible-media.test.mjs`.
