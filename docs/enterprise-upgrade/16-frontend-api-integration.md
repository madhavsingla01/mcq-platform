# Frontend API integration and state ownership

Desktop has one Axios transport in `apps/desktop-web/src/api/axios.js`, with same-origin `/api/v1`, credentials, CSRF names, guest-session headers and a single-flight refresh queue. Domain service modules call that transport. Socket.IO uses the browser origin with `/socket.io`. The inspected desktop services do not construct internal backend-port URLs. Vite proxies API/media/uploads/socket paths to the configured gateway origin. Production ingress must provide those paths too.

The unchanged mobile client uses `apps/mobile-web/src/api/client.js`, same-origin gateway paths, cookies/CSRF plus optional local token and guest ID, and rejects legacy response bodies directly. Additive gateway fields preserve `message` and `success` for this client. Mobile source was inspected read-only. No visual or behavioral mobile certification is implied, and no mobile files were modified under the user's prior instruction.

| Consumer/state | Authority | Step 02 behavior and validation |
|---|---|---|
| AuthStore | Identity is authoritative. Store holds current user/session hints | End-service token verification remains. Integration tests exercise login, bootstrap, protected access and logout. Existing single-refresh-token and optional-auth semantics remain |
| Quiz store/attempt controller | Server owns quiz questions, attempts, elapsed bounds and scoring | Existing start/submit/result URLs preserved. Desktop `AttemptService.syncAttemptState` now uses `/sync-progress`, preventing a sync from reaching the submit handler. Executable transport test checks routes and payloads |
| Challenge pages/builder | Challenge/Quiz own definitions, Attempt owns execution | No visual changes. Legacy URLs continue working; real publication/participation/quarantine/deadline/rank tests added |
| Feed/social/profile component state | Social/API projections | Restricted content removed from affected public reads. Admin moderation test checks Explore, tags and non-owner profile lists |
| Message component state | Message owns persisted records, local state holds optimistic rows and drafts | Existing service module retained. Its send error uses the compatible normalized failure message; drafts/retry behavior remains. Existing HTTP/WS suite runs |
| Notifications | Social module | Existing `/notifications` gateway alias retained and tested with real like-generated notification |
| Settings | Identity preferences, account-scoped desktop settings store | No contract changes. Existing concurrent preference/privacy tests run |
| API failures | Server or transport status | `error.apiFailure` adds `{status,code,message,requestId}` to the existing Axios error. Legacy `error.response.data.message` stays intact. No second API client |

There is no global server-state cache migration. Local form state and per-thread drafts remain local; server data must be reloaded through owner APIs after reconnect/navigation. Quiz and challenge state continue using the existing stores/hooks. Request cache duplication, stale async responses, uniform cancellation and refresh/retry semantics need later targeted reviews, not a whole-state rewrite here.

The orange/black styling, route navigation, loading/error controls and responsive CSS are unchanged by this architecture step. The production desktop build and frontend transport unit test validate compilation and API integration. Browser tools were unavailable during the preceding messaging follow-up, and this step does not claim a new visual pass. Full browser journeys, assistive technology and production ingress cookies remain unexecuted release checks.
