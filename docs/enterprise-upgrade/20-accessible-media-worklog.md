# Accessible quiz media

The Manual Quiz Builder and Challenge Builder share media authoring controls. Each prompt and choice can include visible text, one audio clip, one video, and one image. The Quiz Player and Results in desktop-web share playback and text alternatives. Animated images wait for the participant to start them.

## Authoring and review

1. Select **Add media** for the prompt or **Media** on an answer row. Upload a file or import an image from a direct public HTTPS link. Add a transcript or image description when the visible item text needs more detail. Use the single review checkbox to confirm the chosen text alternative. **Label and language** lets authors customize the default label and identify the language.
2. For video with meaningful audio, upload synchronized WebVTT captions. For essential visuals omitted from the audio, describe them in the main narration or attach a described video and its own captions. Identify a signed-language video separately from a gesture demonstration.
3. Review what a participant hears, sees, and reads. A gesture-matching question can describe that the fingers bend, pause, and straighten in sequence. Keep the name of the gesture out of the description when identifying it is part of the assessment. Revise the assessment if an equivalent description changes what it measures.
4. Save an incomplete draft and return later. The existing clip remains in place during replacement. The editor reports processing on the relevant item and provides cancel, retry, and removal controls. Publishing locates the first incomplete item in the editor. The server independently validates ownership, readiness, labels, required text, caption timing, described video, and the author's equivalence review.

The app verifies required fields, asset types, and cue timing bounds. Authors review caption synchronization, accuracy, meaningful audio, and equivalent difficulty. [W3C guidance on transcripts](https://www.w3.org/WAI/media/av/transcripts/)

## Data flow

- **Quiz Service** owns manual drafts, publish checks, and question editing. Shared Question documents preserve their text and scoring fields. Each option has an opaque stable `optionId`. The editor uses that ID when moving choices and their attachments. The existing scoring API accepts the corresponding option label from the attempt snapshot. **Challenge Service** delegates multimedia validation to Quiz Service and keeps its strict timer, challenge rules, and sealed review policy.
- **Media Service** owns multipart upload, validation, processing, and file delivery. It stores metadata in MongoDB and uses the existing filesystem volume for bytes. FFprobe checks container, tracks, codecs, dimensions, and duration. FFmpeg emits AAC in M4A and H.264/AAC in MP4 with metadata removed. The existing image API remains available for cover and profile images.
- **Attempt Service** freezes questions, options, scoring keys, and media references at attempt start. Shuffling moves whole option records and preserves the stored order on resume. Scoring and permitted review use the frozen data. An attempt created before snapshots existed freezes the currently available version at its first snapshot-aware read.
- **Delivery** uses the quiz access policy or an owned attempt. Media Service checks the current account and content access when issuing a grant and serving bytes. Registered grants are bound to the viewer. Anonymous attempt grants are bound to the scoped guest cookie. The access response carries opaque UUIDs and playback metadata. Author filenames, paths, review flags, and correctness keys are excluded from participant media metadata.
- **Retention** checks current questions, embedded questions, saved challenge drafts, and attempt snapshots before removing a clip. Reference and removal leases guard concurrent attach/delete operations. Processing leases support recovery after an interrupted job. Cleanup handles old unreferenced assets and temporary uploads.

## Gateway API

All routes use the existing `/api/v1` Gateway prefix and response envelope. Creator routes require a current account. Cookie-authenticated writes require the matching CSRF header.

| Route | Request and result |
|---|---|
| `GET /media/clip-capabilities` | Limits, accepted extensions, output MIME types, and processor availability |
| `POST /media/clips` | Multipart `file`, `kind` (`audio`, `video`, `image`, `captions`), and optional `uploadRequestId`. Returns 202 for queued media or 201 when ready. The same creator and request ID recover the same accepted upload. |
| `POST /media/clips/image-url` | JSON `url` and optional `uploadRequestId`. Imports a copy of a public HTTPS image and returns the same private asset metadata as a file upload. The server checks the resolved destination for each redirect. |
| `GET /media/clips/:id` | Owner-only asset status and playback metadata |
| `POST /media/clips/:id/retry` | Owner-only retry for failed processing when the original upload is available. Returns 202. |
| `DELETE /media/clips/:id` | Owner-only removal of an unreferenced asset. `pending=true` checks active references when cancelling a replacement. A save in progress or retained reference returns 409. |
| `POST /media/clips/validate-references` | Creator `assetIds` array. Returns owned asset metadata and briefly leases those IDs for a save. |
| `POST /media/clips/access` | `assetIds` and optional `quizId` or `attemptId`. Preview without a context requires asset ownership. Returns a map of authorized clips with five-minute playback grants. |
| `GET` or `HEAD /media/clips/:id/content` | Viewer-bound grant in `access` query parameter. Supports 206 for a single byte range and 416 for an invalid range. Responses are private and uncached. |
| `POST /quiz/media-validation` | Creator `questions` array and optional `draft` boolean. Runs the shared publish policy. Missing alternatives return 422 with `errors[]` entries containing `path` and `message`. Challenge Service uses this contract. |
| `GET /attempts/:id/questions` | Authorized participant's frozen questions, ordered options, media alternatives, and snapshot format revision. Scoring keys and authoring state are removed. |
| `GET /attempts/submission-calendar` | Signed-in participant's completed attempts grouped by UTC date. Returns an inclusive `start`, `end`, and populated `days` as `{ date, count }` over 364 days. |

Existing draft, publish, challenge, submission, and Results routes remain in use. Each prompt or option can carry `accessibilityMedia[]` with `kind`, `assetId`, `label`, `transcript`, `language`, `purpose`, `signedLanguage`, `captionAssetId`, `captionLanguage`, `describedAssetId`, and `describedCaptionAssetId`. Drafts also carry `pendingAssetId`, `pendingTarget`, `uploadRequestId`, `uploadState`, and author review flags. Each quiz can refer to up to 512 distinct assets.

## Configuration

| Media Service setting | Default or expected value |
|---|---|
| `MONGO_URI` | Existing Media Service metadata database |
| `MEDIA_CONTENT_MONGO_URI` | Application MongoDB used by Auth, Quiz, and Attempt. Use a read-only account in a separated environment. Falls back to `MONGO_URI` when the domains use the same database. |
| `MEDIA_STORAGE_PATH` | Existing durable Media Service volume. Deliver clips through the Gateway. |
| `MEDIA_FFMPEG_PATH`, `MEDIA_FFPROBE_PATH` | `ffmpeg` and `ffprobe` on PATH, or absolute paths. The container installs FFmpeg. |
| `MEDIA_CLIP_MAX_FILE_SIZE` | 104857600 bytes (100 MiB) |
| `MEDIA_MAX_FILE_SIZE` | Maximum bytes for an uploaded or linked image, typically 12582912 bytes (12 MiB). JPEG, PNG, WebP, and GIF are stored as WebP. Images are limited to 40 million decoded pixels and animations to 120 frames. |
| `MEDIA_CAPTION_MAX_FILE_SIZE` | 262144 bytes (256 KiB) |
| `MEDIA_CLIP_MAX_DURATION_SECONDS` | 300 |
| `MEDIA_PROCESS_TIMEOUT_MS` | 120000 |
| `MEDIA_ABANDONED_DAYS` | 7 |

Use an FFmpeg build that can encode H.264 with `libx264` and AAC. Supported inputs are MP3, WAV, Ogg, M4A, MP4, and WebM with supported codecs. WebVTT uploads use plain UTF-8 timed cues. Configure `MEDIA_SERVICE_URL` on Quiz Service and `QUIZ_SERVICE_URL` on Challenge Service. Compose sets these routes and mounts the volume. Restart Media Service after changing its environment and check `GET /api/v1/media/clip-capabilities` for `processorReady`.

## Samples and reproducible verification

- **Spoken arithmetic** has a spoken prompt and four audio answers with reviewed transcripts. **Match a hand motion** has a silent animated hand prompt and four different option videos. Each transcript describes the repeated sequence. The animation is a gesture demonstration.
- The [sample fixtures](../../tests/fixtures/media/README.md) contain the playable media and provenance. Run `npm run verify:serve -- --media` to start a disposable local MongoDB and seed both quizzes. The command prints creator and participant credentials, the Gateway URL, and quiz paths. Set the desktop preview's `VITE_API_URL` to that Gateway, then run `npm run preview -- --host 127.0.0.1 --port 5183 --strictPort` from `apps/desktop-web` after building.
- `npm run test:media` exercises real WAV, MP4, and VTT through the Gateway with separate creator, participant, and outsider accounts. It covers upload validation, concurrent idempotency, incomplete drafts, old-clip retention, stable IDs, shuffle, frozen content, private access, byte ranges, scoring, contest release, and CSV import. Set `MONGOD_BINARY` when MongoDB is outside PATH and set the two processor paths when FFmpeg is outside PATH.
- `npm run test:media:ui` uses the actual React components in jsdom. It checks keyboard radio selection, independence of media controls, playback error focus, transcript fallback, described-track switching, upload retry, stable reordering, and axe-core DOM rules. The DOM check excludes contrast, which needs rendered styling.
- Regression commands are `npm run test:unit`, `npm run test:integration`, `npm --prefix services/quiz-service test`, `npm --prefix services/media-service test`, `npm run desktop:build`, and `docker compose config --quiet`.

| Command | Observed result |
|---|---|
| `npm run test:media` | 7 passed, including the parent test and six Gateway scenarios |
| `npm run test:media:ui` | 3 passed, including the axe-core DOM check |
| `npm run test:unit` | 26 passed |
| `npm run test:integration` | 134 existing checks and 23 Node integration results passed |
| `npm --prefix services/quiz-service test` | 67 passed |
| `npm --prefix services/media-service test` | 3 passed |
| `npm run desktop:build` | Production build passed |
| `docker compose config --quiet` | Compose configuration valid |

The media integration run used FFmpeg and FFprobe 9.0.2 on Windows. The desktop build and verifier use the repository's existing Node and MongoDB setup.

## Observed browser and accessibility evidence

The Windows in-app Chromium browser ran separate creator and participant sessions against the disposable Gateway. The creator uploaded the spoken prompt and four WAV choices in the Manual Builder, saved a draft, and published. The participant opened the instructions, played media by keyboard, changed an answer, cancelled and reopened the submit dialog with the keyboard, and scored 100%. Option playback left the selected answer in place. The Results heading received focus after submission.

The gesture quiz ran at a measured 400 CSS px viewport with no document-level horizontal overflow. All five videos fit. Starting another clip paused the prompt, and the description stayed available independently of playback. The participant scored 100%. The captioned quiz ran muted with both WebVTT tracks reporting loaded, switched to the described version without changing the selected answer, moved focus to the next question heading, and scored 100% across two questions.

Checks targeted WCAG 2.2 AA criteria for prerecorded alternatives and captions, keyboard operation, focus order and visibility, reflow, names and roles, and status messages. Actual screen-reader output, a display-off run, physical-phone playback, Safari and Firefox controls, and a full WCAG 2.2 AA conformance evaluation are still open. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Calculated contrast for the added media UI was 17.14:1 for body text on the clip surface, 11.38:1 for the transcript control on that surface, 6.55:1 for the focus outline on the control surface, and 21:1 for captions. The control boundary measures 3.16:1 on the control surface.

## Development errors

Vite explicitly optimizes the shared Markdown and math dependencies before lazy Quiz navigation. Fresh requests to Quiz and the three emitted optimized dependency URLs returned 200. The error boundary reload action refreshes an outdated module graph. The active authenticated browser's unread-count endpoint returned `success: true`. The isolated Messaging regression suite also covered unread counts. The earlier authenticated 500 was not reproduced.

The local Media Service on port 5007 was restarted with its configured content database and FFmpeg tools. The desktop Gateway returned `processorReady: true`. The Media Service development command watches its source and environment file for changes.

## Implementation entry points

| Area | Files |
|---|---|
| Manual Builder | `apps/desktop-web/src/pages/Create/ManualBuilder.jsx`, `src/utils/builderMediaState.js`, `src/components/media/MediaEditor.jsx` |
| Player and Results | `apps/desktop-web/src/components/media/AccessibleMedia.jsx`, `src/components/platform/question/`, `src/components/platform/options/OptionCard.jsx`, `src/components/quiz/SubmitConfirmationModal.jsx`, `src/hooks/useQuizAttemptController.js`, `src/pages/Result/Result.jsx` |
| Media ownership and processing | `services/media-service/src/controllers/clip.controller.js`, `src/services/clipAccess.service.js`, `src/services/clipPolicy.js`, `src/services/clipProcessing.service.js`, `src/models/MediaAsset.model.js` |
| Publish and attempt rules | `services/quiz-service/src/services/questionMediaPolicy.js`, `src/services/questionMedia.service.js`, `services/challenge-service/src/services/mediaValidation.service.js`, `services/attempt-service/src/services/questionSnapshot.service.js`, and the respective controllers and models |
| Verification | `tests/integration/accessible-media.test.mjs`, `tests/media-accessibility-unit.test.mjs`, `tests/media-accessibility-ui.test.mjs`, `tests/fixtures/media/`, `scripts/verify-stack.mjs` |
