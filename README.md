# QuizFocus - Universal MCQ Quiz Platform

QuizFocus is a focused MERN stack application for turning tabular MCQ files into interactive quizzes. It supports Excel, CSV, and JSON imports, smart column mapping, manual quiz creation, and taking/reviewing quizzes.

This README is the entry point. For implementation logic and the security roadmap, see [docs/SECURITY_AND_LOGIC.md](docs/SECURITY_AND_LOGIC.md). For recent documentation and runtime progress, see [docs/PROGRESS.md](docs/PROGRESS.md).

## Current Status

- Frontend dev URL: `http://127.0.0.1:5173`
- Backend health URL: `http://127.0.0.1:5000/api/v1/health`
- Local MongoDB URI: `mongodb://127.0.0.1:27017/mcq-platform`
- Server tests: Jest test suite is configured for Windows and Unix shells

## Feature Map

### Core Quiz Engine

- Multi-format upload for `.xlsx`, `.xls`, `.csv`, and `.json`
- Heuristic smart column detection with confidence scoring
- Manual mapping correction before quiz generation
- Interactive quiz attempts with navigation, review state, timing, and results
- Manual quiz builder for creating or editing quizzes without imports

### Organization

- User settings for account and profile management
- Clean and performant data persistence layer

## Data Persistence and Database Behavior

The application architecture has been verified to strictly persist the following entities. 

| Data                             | Storage                                             | When it is saved                            | Persistence behavior                             |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| User account                     | MongoDB (`users`)                                   | Registration / Profile Update               | Available for future login & profile view        |
| Quiz metadata                    | MongoDB (`quizzes`)                                 | Quiz creation or update                     | Permanently saved; available across reloads      |
| Questions and options            | MongoDB (`questions`) linked via `quizId`           | Quiz generation or editing                  | Preserved alongside the linked Quiz              |
| Correct answers and explanations | MongoDB (`questions` collection)                    | Import or quiz editing                      | Permanently saved inside Question documents      |
| Submitted attempts               | MongoDB (`attempts`)                                | Attempt completion                          | Available through attempt history & results      |
| In-progress answers              | MongoDB (`attempts`)                                | When selecting an answer (`isLocked: true`) | Recoverable after refresh from Dashboard         |
| Upload files & mappings          | Temporary disk storage (`uploads/temp`) & DB        | During upload                               | Only temporary; cleaned up after processing      |


## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS v4, Zustand |
| Backend | Node.js, Express, MongoDB, Mongoose |
| Parsing | SheetJS (`xlsx`), PapaParse |
| Auth | JWT in httpOnly cookies, bcrypt password hashing |
| Security | Helmet, CORS, validation middleware, rate limiting, role checks |
| Testing | Jest, babel-jest |

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- MongoDB Community Edition (native installation)

### Install Dependencies

```bash
cd server
npm install

cd ../client
npm install
```

### Configure Environment

PowerShell:

```powershell
Copy-Item server\.env.example server\.env
```

Bash:

```bash
cp server/.env.example server/.env
```

For local development this project currently uses:

```env
MONGO_URI=mongodb://127.0.0.1:27017/mcq-platform
```

Change `JWT_SECRET` and `JWT_REFRESH_SECRET` before any shared or production deployment.

The application uses native MongoDB on standard port `27017`. Ensure MongoDB Community Edition is installed and running locally.

To run the local database in a dedicated folder, use:

```powershell
mongod --dbpath .mongo_data
```

### Start The App

Backend:

```bash
cd server
npm run dev
```

Frontend:

```bash
cd client
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

## Verification

Backend health:

```bash
curl http://127.0.0.1:5000/api/v1/health
```

Server tests:

```bash
cd server
npm test
```

Client production build:

```bash
cd client
npm run build
```

## Project Structure

```text
mcq-platform/
|-- client/                    # React frontend
|   |-- src/
|   |   |-- api/               # Axios API clients
|   |   |-- components/        # Shared UI and feature components
|   |   |-- hooks/             # Custom React hooks
|   |   |-- pages/             # Route pages
|   |   |-- routes/            # React Router config
|   |   |-- store/             # Zustand stores
|   |   `-- utils/             # Client utilities
|   `-- index.html
|-- server/                    # Express backend
|   |-- src/
|   |   |-- config/            # Environment and service config
|   |   |-- controllers/       # Request handlers
|   |   |-- middleware/        # Auth, validation, rate limit, upload, errors
|   |   |-- models/            # Mongoose models
|   |   |-- routes/            # API route definitions
|   |   |-- services/          # Parser, quiz, activity logic
|   |   |-- utils/             # Shared server utilities
|   |   |-- app.js             # Express app setup
|   |   `-- server.js          # HTTP bootstrap
|   `-- tests/                 # Jest tests
|-- docs/                      # Project documentation
`-- README.md
```

## API Routes

All API routes are prefixed with `/api/v1`.

| Route | Description |
| --- | --- |
| `/auth/*` | Register, login, logout, refresh, session bootstrap, profile |
| `/upload/*` | File upload and upload history |
| `/parser/*` | Column detection and mapping |
| `/quiz/*` | Generated quiz and attempt flows |
| `/quizzes/*` | Quiz CRUD and public browsing |
| `/attempts/*` | Attempt tracking and scoring |
| `/users/*` | Public profiles |

## Core Logic Flow

1. A user uploads a supported file or creates a quiz manually.
2. The parser reads rows and headers, then the smart mapper scores likely question, option, answer, explanation, serial, and media columns.
3. The user accepts or edits the mapping.
4. The backend normalizes answers, creates quiz and question records, and stores source metadata.
5. Attempts track selected answers, timing, visits, flags, and suspicious activity signals.
6. Results and analytics are derived from stored attempts and questions.

## Security Baseline

Already implemented:

- httpOnly auth cookies with `sameSite=strict` and production-only `secure`
- Short-lived access tokens plus stored refresh tokens
- bcrypt password hashing
- Role-based admin route protection
- Ownership checks for quiz, attempt, and upload actions
- Helmet and restricted CORS origins
- Double-submit CSRF protection for cookie-authenticated unsafe requests
- Request body and Mongo ObjectId validation middleware
- Auth and upload rate limiters with separate buckets and standard rate-limit headers
- Upload size limits for guests and authenticated users
- Import file extension, content, and signature validation

Recommended next hardening work:

- Add refresh-token family rotation and reuse detection
- Add stronger schema validation with a shared validation library
- Add malware scanning for untrusted files
- Add audit logs for admin actions and sensitive profile/account changes
- Add security headers tuned for production static hosting
- Add automated dependency audit review in CI

See [docs/SECURITY_AND_LOGIC.md](docs/SECURITY_AND_LOGIC.md) for more detail.

## Troubleshooting

### MongoDB connection refused

If the server logs `ECONNREFUSED 127.0.0.1:27017`, check `server/.env`. Ensure you are running the native MongoDB server on standard port `27017` and that your connection string is correct:

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
- **Backend Routing:** Added dedicated `social.routes.js` and `social.controller.js` to manage feeds and interactions.
- **Frontend Restructuring:** 
  - Introduced dedicated `Explore`, `Notifications`, and `Create` top-level pages.
  - Added new `components/social` and `components/platform` component boundaries to handle social feeds (e.g., `SocialPostCard`).
  - Refactored `Settings` into segmented panels (`PublicProfileSettings.jsx`, `Security.jsx`, `UserInfo.jsx`).

## License

MIT
