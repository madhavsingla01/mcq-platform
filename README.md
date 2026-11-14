# QuizFocus - Universal MCQ Quiz Platform

QuizFocus is a focused MERN stack application for turning tabular MCQ files into interactive quizzes. It supports Excel, CSV, and JSON imports, smart column mapping, manual quiz creation, and taking/reviewing quizzes.

Start here for local setup. See the [modernization documentation](docs/README.md) for architecture, messaging contracts, database decisions, risks, and verification. The [Step 02 report](docs/enterprise-upgrade/18-step-02-report.md) records attempt ownership, gateway contracts and migration requirements. Older design and security notes live in the [workspace docs](../docs/README.md).

## Current Status

- Frontend URL: `http://localhost:5173`
- API Gateway Entrypoint: `http://localhost:5000`
- System Health Check: `http://localhost:5000/api/v1/health`
- Gateway liveness: `/api/v1/livez`. Readiness: `/api/v1/readyz` (503 when a dependency is degraded).
- Architecture: domain microservices, a dedicated Challenge Service, an administrative service, and an API Gateway
- Microservices:
  - **API Gateway** (`:5000`): Central proxy, route distributor, and security perimeter
  - **Auth Service** (`:5001`): User accounts, JWT cookies, profiles, and follower graphs
  - **Quiz Service** (`:5002`): Quiz authoring, question banks, drafts, search engine & dynamic trending hashtags
  - **Challenge Service** (`:5009`): Competitive challenge authoring, publication, discovery, and leaderboard reads
  - **Parser Service** (`:5003`): Spreadsheet uploads (.xlsx, .csv), column mapping & validation
  - **Attempt Service** (`:5004`): Quiz attempts, real-time response locking, timer strategies & scoring
  - **Social Service** (`:5005`): Community challenges, activity feeds, bookmarks & social interactions
  - **Message Service** (`:5006`): Direct messaging, inbox conversations & quiz challenge invites
  - **Media Service** (`:5007`): Secure image processing, WebP variants, thumbnails, URL validation & optimized delivery
  - **Admin Service** (`:5008`): Role-based administration, moderation, user controls, and audit logs
  - **AI Integration Service** (`:5014`): Authenticated AI integration boundary and service-to-service client; provider connectors are not configured

---

## 🚀 How to Start the Whole Website

### Prerequisites

1. **Node.js**: Use a supported LTS release for deployment. The Step 01 report records the runtime used for local verification.
2. **npm**: v9.0.0 or higher (`npm -v`)
3. **MongoDB**: Running locally on default port `27017`
   - *Note*: If MongoDB is already running as a background system service (default on Windows), you do **not** need to start it manually.
   - *Manual fallback*: If MongoDB is not running as a service, start it with:
     ```bash
     mongod --dbpath .mongo_data
     ```
     This directory contains local database files and is intentionally excluded from Git. Do not upload it to GitHub.

Binary images, audio, and video are ignored by Git. Keep user uploads in external/local media storage; test audio/video samples are generated in the system temporary directory when needed.

### Configure Authentication Secrets

All services that validate access tokens must use the same `JWT_SECRET` (at least 32 random bytes), including Challenge and Admin Services. Set it in each service's `.env` file. Set a separate strong `JWT_REFRESH_SECRET` in `services/auth-service/.env`. The example files leave these values blank so services fail safely until configured.

For Docker Compose, copy the root `.env.example` to `.env`, set both secrets and `CLIENT_URL`, then run `npm run docker:up`.


---

### Step-by-Step Launch (Standard Local Development)

#### 1. Install All Dependencies
Install `node_modules` across the web apps and all services in a single command:
```bash
npm run install:all
```

#### 2. Start All Microservices (Backend)
Start the API Gateway and domain microservices concurrently with real-time color-coded logging and health monitoring:
```bash
npm run services:all
```
> All microservices will boot and connect to MongoDB:
> - `[GATEWAY]` http://localhost:5000
> - `[AUTH]`    http://localhost:5001
> - `[QUIZ]`    http://localhost:5002
> - `[PARSER]`  http://localhost:5003
> - `[ATTEMPT]` http://localhost:5004
> - `[SOCIAL]`  http://localhost:5005
> - `[MESSAGE]` http://localhost:5006
> - `[MEDIA]`   http://localhost:5007
> - `[ADMIN]`   http://localhost:5008 (through the gateway at `/api/v1/admin`)
> - `[CHALLENGE]` http://localhost:5009 (through the gateway at `/api/v1/challenges`)

#### 3. Start the Desktop Web App
In a second terminal window, launch the Vite React dev server:
```bash
npm run desktop:dev
```
> The frontend will be available at:
> **http://localhost:5173**

#### 4. Verify System Health
You can verify that all backend services are healthy and reachable by visiting:
```bash
curl http://localhost:5000/api/v1/health
```
or opening `http://localhost:5000/api/v1/health` in your browser. All services should report `status: "healthy"`.

---

### Alternative Option: Run with Docker Compose
If you prefer running everything in containerized isolation:
```bash
# Copy .env.example to .env and configure the required JWT secrets first.
# Build and run all microservices, API Gateway, MongoDB and the desktop app backend.
npm run docker:up

# View aggregated logs
npm run docker:logs

# Stop containers
npm run docker:down
```

---

### Developing an Individual Microservice in Isolation
If you are working on a single microservice, you can start only the services you need:
```bash
npm run gateway:dev    # API Gateway on :5000
npm run auth:dev       # Auth Service on :5001
npm run quiz:dev       # Quiz Service on :5002
npm run parser:dev     # Parser Service on :5003
npm run attempt:dev    # Attempt Service on :5004
npm run social:dev     # Social Service on :5005
npm run message:dev    # Message Service on :5006
npm run media:dev      # Media Processing Service on :5007
```


## Verification

The [TypeScript migration checklist](docs/typescript-migration.md) tracks strict compiler coverage and the remaining JavaScript. Run `npm run typecheck`, `npm run lint:types`, and `npm run contracts:test` from this directory. Both web apps use the repo's `contracts` directory at build time. The Gateway, Auth, Attempt, Challenge, Media, Admin, Quiz, and AI Integration services build inside their own directories and run the emitted JavaScript from `dist`.

Microservices health:

```bash
curl http://127.0.0.1:5000/api/v1/health
```

Run microservice unit tests:

```bash
npm --prefix services/quiz-service test
```

Desktop web production build:

```bash
npm run desktop:build
```

## Project Structure

```text
mcq-platform/
|-- apps/
|   |-- desktop-web/           # React 18 / Vite desktop web app (:5173)
|   `-- mobile-web/            # Mobile-first web app (:5174)
|-- services/                  # Domain microservices and gateway
|   |-- api-gateway/           # :5000 - Central proxy & security perimeter
|   |-- auth-service/          # :5001 - Users, JWT auth & profiles
|   |-- quiz-service/          # :5002 - Quiz CRUD, questions, search engine & dynamic hashtags
|   |-- parser-service/        # :5003 - File upload, spreadsheet parser & static storage
|   |-- attempt-service/       # :5004 - Attempts, response locking & timers
|   |-- social-service/        # :5005 - Challenges, activity feeds & bookmarks
|   |-- message-service/       # :5006 - Direct messaging & chat conversations
|   `-- media-service/         # :5007 - Image processing, storage metadata & delivery
|-- scripts/                   # install-all.js, start-all-services.js
|-- docs/                      # Architecture and security documentation
`-- README.md
```


## API Routes

All API routes are prefixed with `/api/v1`.

| Route | Description |
| --- | --- |
| `/auth/*` | Register, login, logout, refresh, session bootstrap, profile |
| `/upload/*` | File upload and upload history |
| `/api/v1/media/images` | Authenticated image upload, processing, and metadata creation |
| `/api/v1/media/validate-url` | Authenticated HTTPS image URL parsing and validation |
| `/api/v1/media/assets` | Owner-scoped media listing and deletion |
| `/parser/*` | Column detection and mapping |
| `/quiz/*` | Generated quiz, attempt flows, and challenge leaderboard |
| `/quizzes/*` | Quiz CRUD and public browsing |
| `/challenges/*` | Competitive challenge creation, discovery, detail, and leaderboards |
| `/attempts/*` | Attempt tracking, autosave, and scoring |
| `/users/*` | Public profiles and creator directories |
| `/social/*` | Activity feeds, likes, bookmarks, comments, notifications, shares |
| `/messages/*` | Direct messages and quiz invitation conversations |
| `/search/*` | Universal search across quizzes, creators, and dynamic trending hashtags |
| `/admin/*` | Administrative controls, moderation, reports, and audit logs |

Image variants are delivered through the gateway at `/media/assets/:id/:variant` (outside the `/api/v1` prefix). Uploads are limited to 12 MiB by default and accept JPEG, PNG, WebP, GIF, AVIF, TIFF, and SVG source files. The media service decodes and re-encodes accepted uploads as WebP image and thumbnail variants, and stores ownership, source size/type, dimensions, content hash, variant sizes, and processing status in its dedicated `mcq_media` database. Files use the shared `uploads-data` volume.

Configure the gateway with `MEDIA_SERVICE_URL` and the media service with `MONGO_URI`, `JWT_SECRET`, `MEDIA_STORAGE_PATH`, and `MEDIA_MAX_FILE_SIZE`. URL validation checks HTTPS and supported image URL syntax; it does not fetch or re-host remote URLs. Audio and video processing are not implemented.

## Core Logic Flow

1. A user uploads a supported dataset (.xlsx, .xls, .csv, .json) or creates a quiz manually. Current media upload flows cover images; audio/video uploads are not available yet.
2. The parser reads rows and headers, then the smart mapper scores likely question, option, answer, explanation, serial, and media columns.
3. The user accepts or edits the mapping.
4. The backend normalizes answers, creates quiz and question records, and stores source metadata.
5. Attempts track selected answers, timing, visits, flags, and anti-cheat signals.
6. Results and analytics are derived from stored attempts and questions.

## Security Baseline

Already implemented:

- HTTP-only authentication cookies with `SameSite=Lax` for local development and `SameSite=None; Secure` in production
- Short-lived access tokens plus stored refresh tokens with `tokenVersion` revocation
- bcrypt password hashing
- Role-based admin route protection
- Ownership checks for quiz, attempt, comment, message, and upload actions
- Helmet and restricted CORS origins
- Double-submit CSRF protection for cookie-authenticated unsafe requests
- Request body and Mongo ObjectId validation middleware
- NoSQL Injection sanitization stripping `$` and `.` operators
- SQL injection detection for query strings
- XSS content sanitization
- HTTP Parameter Pollution (HPP) query defense
- Anti-cheat question delivery: answer stripping for active participants and challenge quarantine before deadlines
- Auth and upload rate limiters with separate buckets and standard rate-limit headers
- Upload size limits for guests and authenticated users
- Import file extension, content, and signature validation
- Raw uploads are quarantined until validation; uploaded images are decoded, re-encoded as WebP, and stored with owner, size, MIME type, dimensions, hash, purpose, and timestamps

Recommended next hardening work:

- Add refresh-token family rotation and reuse detection
- Add stronger schema validation with a shared validation library
- Add malware scanning for untrusted files
- Add audit logs for admin actions and sensitive profile/account changes
- Add security headers tuned for production static hosting
- Add automated dependency audit review in CI

See the [current security and risk register](docs/enterprise-upgrade/05-security-and-risk-register.md) for verified coverage and remaining work.

## Troubleshooting

### MongoDB connection refused

If a service logs `ECONNREFUSED 127.0.0.1:27017`, check its `services/<name>/.env`. Ensure the configured MongoDB instance is running and that the connection string is correct:

```env
MONGO_URI=mongodb://127.0.0.1:27017/mcq-platform
```

### Nodemon starts with duplicate args

`npm run dev` should print:

```text
nodemon
starting `node src/server.js`
```

If it prints `node src/server.js src/server.js`, make sure `server/package.json` uses `"dev": "nodemon"` because `server/nodemon.json` already defines the command.

### Tests fail because Jest shim is parsed as JavaScript

On Windows, the test script should call the Jest JavaScript entry point:

```json
"test": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js --forceExit --detectOpenHandles"
```

## Documentation Progress

The current documentation pass:

- Corrected runtime ports and local setup notes
- Corrected React version and smart mapper wording
- Added core logic flow, security baseline, hardening backlog, and troubleshooting
- Added dedicated progress and security/logic docs under `docs/`
- Implemented CSRF, stricter import signature validation, scoped rate-limit buckets, and matching docs updates

### Recent System Refactoring (October 2026)

- **Database Cleanup:** Successfully transitioned from inconsistent Docker/Redis configurations to a streamlined native MongoDB setup on standard port `27017`.
- **Feature Removal & Simplification:** Stripped obsolete experimental features (e.g., Live Sessions, Leaderboards, AI integration, Community/Social following) to focus heavily on the core tabular MCQ file-to-quiz conversion.
- **Persistence Audit:** Verified data relationships. Questions are securely embedded directly in the `Quiz` documents, and answers are snapshotted natively into `Attempt` objects.
- **Bug Fixes:** Resolved React ErrorBoundary crashes caused by stale references (`sharedSessionShareCode`, `handlePageChange`) and fixed missing CSRF `xsrfHeaderName` token attachments in Axios.

### Pivot to Social & Engagement (Late October 2026)

- **Social Data Layer:** Reintroduced and formalized social interaction models including `Activity`, `Notification`, `QuizComment`, `QuizInteraction` (Likes/Bookmarks), and `QuizShare`.
- **Backend Routing:** Added dedicated `social.routes.js`, `social.controller.js`, `message.routes.js`, and `message.controller.js` to manage feeds, interactions, and direct messaging.
- **Frontend Restructuring:** 
  - Introduced dedicated `Explore`, `Notifications`, and `Create` top-level pages.
  - Added new `components/social` and `components/platform` component boundaries to handle social feeds (e.g., `SocialPostCard`).
  - Refactored `Settings` into segmented panels (`PublicProfileSettings.jsx`, `Security.jsx`, `UserInfo.jsx`).

### Creation Studio & Challenge Governance (October 2026)

- **Minimalist Creation Studio (`/create`):** Redesigned the creation hub into an ultra-clean, minimal 3-card entry point (`Quiz`, `Challenge`, `Import`) styled strictly in orange and black.
- **Competitive Challenge Studio (`/create/challenge`):** Full challenge authoring suite supporting strict duration limits (auto-submit on timer expiry), finalization deadlines, public/invite access rules, and pre-deadline answer quarantine.
- **Share Modal Redesign:** Replaced legacy share dialog with a dual-column layout featuring one-click copy links, external social integrations (WhatsApp, X, Telegram, LinkedIn, Reddit), interactive connection selection, and message previews.
- **Explore Page Streamlining:** Redesigned explore feeds with instant creator/quiz filtering pills and uncluttered search.
- **Card Layout & Typography:** Implemented line-clamp title handling and defensive layout wrappers to prevent overflow and card stretching.

### Database Performance, Scalability & Search Optimization (October 2026)

- **Interactive Numbered Pagination (`/explore`):**
  - Contract updated across `/api/quiz` and `/api/social/explore` to return `{ total, page, limit, pages, hasMore, hasNext, hasPrev }`.
  - Frontend interactive numbered pagination with smooth scroll and loading transition feedback.
- **Server-Side Search & Filters:**
  - Multi-attribute regex search supporting `search` and `q`.
  - Case-insensitive difficulty normalization (`easy`/`beginner` -> `Beginner`, `medium`/`intermediate` -> `Intermediate`, `hard`/`advanced` -> `Advanced`).
  - Sorting support for `popular`, `top`/`rating`, `newest`, `oldest`, `questions`, and alphabetical `title`.
  - Strict access controls preventing draft and private quiz leakage.
- **Compound Schema Indexes:**
  - `Quiz.model.js`: Added compound indexes `{ visibility: 1, category: 1, createdAt: -1 }`, `{ visibility: 1, difficulty: 1, createdAt: -1 }`, `{ visibility: 1, category: 1, difficulty: 1, createdAt: -1 }`, and weighted text index on title, tags, category, and description.
  - `Attempt.model.js`: Added index `{ quizId: 1, status: 1, createdAt: -1 }` (for quiz analytics) and `{ quizId: 1, status: 1, isPractice: 1, score: -1, totalTime: 1 }` (for leaderboards).
  - `Conversation.model.js` & `Message.model.js`: Added compound indexes `{ participants: 1, lastMessageAt: -1 }` and `{ conversation: 1, createdAt: -1 }`.
- **Targeted Optimizations & Caching:**
  - **In-Memory TTL Cache (`MemoryCache`):** Lightweight caching engine with TTL and pattern invalidation (`delPattern`) for public quiz details and competitive challenge leaderboards.
  - **Database-Level Comment Pagination:** Replaced unbounded in-memory slicing with MongoDB-level pagination for top-level comments and targeted reply fetching.
  - **Cursor-Based Message Pagination:** Implemented `before`/`after` cursor pagination for chat history.
  - **Test Suite Expansion:** 9 test suites passing with 86 unit and integration tests (`npm test`).

## License

MIT
