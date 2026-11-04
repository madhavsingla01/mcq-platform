# 🏆 QuizFocus Challenges — Architecture, Mechanics, Routes & Roadmap

> **Document Type:** Master Domain Architecture & Technical Specification  
> **Status:** Active Production & Continuous Evolution  
> **Target Audience:** Backend Engineers, Frontend Architects, Security & Game Designers  
> **Repository:** `QuizFocus (mcq-platform)`  

---

## 📌 Executive Summary

In QuizFocus, a **Challenge** is not merely a quiz with a timer. While standard quizzes are asynchronous, open-ended practice instruments with unlimited questions and optional review, **Challenges are synchronized, competitive social arenas** with strict rules, time constraints, single-attempt locks, anti-cheat barriers, and deadline-quarantined leaderboards.

This document describes:
1. **What is inside Challenges** (core concepts, constraints, lifecycle, scoring & ranking mechanics).
2. **Current Features vs. Features Under Development**.
3. **All Connected Routes & API Contracts** (Gateway, Microservices, Desktop, and Mobile).
4. **End-to-End System Architecture** (cross-service data flow, persistence models, and caching).
5. **Anti-Cheat, Integrity & Administrative Oversight**.

---

## 1. 🔍 What's Inside Challenges?

### A. The Core Rules & Competitive Constraints

Every Challenge in QuizFocus conforms to strict invariants:

| Constraint | Quiz | Challenge | Rationale |
| :--- | :---: | :---: | :--- |
| **Max Question Count** | Unlimited | **Max 10 Questions** | High-velocity sprint testing; ensures rapid, fair competition without fatigue. |
| **Duration Limit** | Optional (`timeLimit: 0`) | **Mandatory Strict Timer** (`durationMinutes > 0`) | Enforces a hard, server-enforced countdown window. |
| **Deadline (`deadlineAt`)** | None | **Mandatory Future Timestamp** | Defines the exact cutoff point when the arena closes. |
| **Attempt Allowance** | Multiple retries allowed | **Strictly 1 Attempt per User** | Prevents memorization and trial-and-error exploits. |
| **Creator Practice Mode** | Normal attempt | **`isPractice: true`** | Allows creators to test their contest without corrupting official ranks. |
| **Instant Answer Feedback** | Configurable | **Disabled (`instantFeedback: false`)** | Prevents contestants from sharing verified answers with peers. |
| **Post-Quiz Review** | Immediate | **Quarantined until `deadlineAt`** | Questions and correct options cannot be scraped before deadline. |
| **Leaderboard Visibility** | Immediate / Dynamic | **Quarantined until `deadlineAt`** | Competitors cannot gauge needed scores or game the standings. |

---

### B. The Challenge Lifecycle

```
       ┌───────────┐
       │   Draft   │  Creator constructs challenge (Max 10 questions)
       └─────┬─────┘
             │ Creator publishes with durationMinutes & deadlineAt
             ▼
       ┌───────────┐
       │  Active   │  Open for single attempts; countdown running
       └─────┬─────┘  Scores & leaderboards QUARANTINED
             │
             │ Deadline passes (deadlineAt <= NOW)
             ▼
       ┌───────────┐
       │   Ended   │  Arena closed to new attempts; in-flight autosubmitted
       └─────┬─────┘  Leaderboard & answer explanations UNLOCKED
```

1. **Draft State:** Questions are drafted, mapped, and previewed. Maximum 10 questions enforced.
2. **Active State:** The contest is discoverable. Users can launch their single attempt. Server records start time and enforces timer mode `strict`.
3. **In-Flight Lock:** Once a user begins, an `attempt` document is created with `status: 'in_progress'`. If the user disconnects or refreshes, they can only resume their existing attempt within the allotted `durationMinutes`.
4. **Deadline Cutoff:** When `deadlineAt` passes, `cleanup.worker.js` and attempt queries automatically seal the contest, marks it as `ended`, and unlocks final standings.

---

### C. Ranking & Leaderboard Mechanics (`RankingService.js`)

Rankings use a hybrid **Competition Ranking (1, 1, 3)** or **Dense Ranking (1, 1, 2)** model with zero tolerance for practice tampering:

1. **Practice Exclusion:** Any attempt where `userId === quiz.uploader` is tagged with `isPractice: true` and filtered out of official standings.
2. **Primary Sort Key:** `score` descending (higher total points rank higher).
3. **Secondary Tie-Breaker:** `totalTimeMs` ascending (fastest completion time wins ties).
4. **Tie Resolution:** Contestants who achieve the exact same score in the exact same millisecond share the rank.

---

## 2. 🚀 Feature Matrix: Implemented vs. Under Development

### ✅ Fully Implemented Features

- [x] **Challenge Creation Engine:**
  - Dedicated `/create/challenge` UI with mandatory duration and future deadline pickers.
  - Server-side validation enforcing $N \le 10$ questions and $T_{\text{duration}} > 0$.
- [x] **Strict Anti-Exploit Sanitization:**
  - `sanitizeQuestionsForClient`: Strips correct option indices and explanations for all active challenges.
  - `sanitizeAttemptForClient`: Conceals contestant scores, mistakes, and reviews until the final deadline has expired.
- [x] **Single-Attempt Guard:**
  - Rejects second attempt creation attempts (`forceNew: true` blocked on challenges).
  - Creator bypass (`isPractice: true`) allowing organizers to test question layouts safely.
- [x] **Leaderboard Quarantine:**
  - `GET /api/v1/attempts/quiz/:id/leaderboard` returns an empty array with `"Leaderboard and ranks are quarantined until the finalization deadline."` while contest is live.
  - Automatic reveal once `deadlineAt` has passed.
- [x] **Hot-Read In-Memory Caching:**
  - 15-second localized caching for contest leaderboards to protect MongoDB against refresh storms during reveal.
- [x] **Mobile Arena Client (`apps/mobile-web` — :5174):**
  - Dedicated mobile `/challenges` tab with Daily Streak Tracker, Trending Challenges, and Top Creators list.
- [x] **Symbolic Quiz Codes (`!QZ-XXXXXX`):**
  - Fast 1-click/1-tap sharing and direct prefix lookup (`!`) for instantaneous challenge jumps.
- [x] **Admin Moderation & Restrictions:**
  - Dedicated `/admin/content` panel allows operators to restrict compromised or reported challenges from public discovery with an audited reason.

---

### ⏳ Features Under Active Development / Roadmap

| Feature | Target Milestone | Description |
| :--- | :---: | :--- |
| **Real-Time Live Standings Reveal Ceremony** | `CP-15` | Socket.IO event broadcast that pushes live podium standings and confetti animations to all connected contestants the moment the deadline timer hits zero. |
| **Private Challenge Access & Approval Queue** | `CP-16` | Implementation of `accessType: 'invite_only'` with creator approval dashboard (`inviteAccessType: 'approval'`) and 6-digit secret room codes. |
| **Tab-Blur & Focus Integrity Telemetry** | `CP-17` | Detection and logging of window blur events (`visibilitychange`), devtools inspection, and suspicious speed anomalies ($< 1.5\text{s}$ per complex question). |
| **Creator Challenge Badges & Trophies** | `CP-18` | Gold, Silver, and Bronze badge awards permanently pinned to user profiles for top 3 leaderboard finishers. |
| **Scheduled Push & In-App Reminders** | `CP-19` | Notification alerts sent 30 minutes before a bookmarked challenge deadline closes. |

---

## 3. 🌐 Connected Routes & API Map

### A. Backend API Routes (API Gateway :5000 & Microservices)

```
                            ┌──────────────────────────────────┐
                            │       API Gateway (:5000)        │
                            └────────────────┬─────────────────┘
                                             │
             ┌───────────────────────────────┼───────────────────────────────┐
             ▼                               ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
    │  quiz-service   │             │ attempt-service │             │  admin-service  │
    │     (:5002)     │             │     (:5004)     │             │     (:5008)     │
    └─────────────────┘             └─────────────────┘             └─────────────────┘
```

#### 1. Dedicated Challenge Service (`challenge-service` :5009 via Gateway)
- `POST /api/v1/challenges`  
  *Payload:* `{ title, durationMinutes, deadlineAt, questions (max 10), accessType, tags }`.  
  *Action:* Validates $\le 10$ questions, required future deadline, generates `!QZ-XXXXXX`, saves to `quizzes` collection and shared `questions` collection.
- `GET /api/v1/challenges`  
  *Query:* `?status=active|ended&category=...&search=...&page=1&limit=12`.  
  *Response:* Paginated challenge directory sorted by deadline urgency and creation.
- `GET /api/v1/challenges/:idOrCode`  
  *Resolution:* Accepts either MongoDB `ObjectId` or symbolic `!QZ-XXXXXX`.  
  *Security:* Strips answers and explanations until `deadlineAt` expires unless caller is creator.
- `PUT /api/v1/challenges/:idOrCode`  
  *Action:* Edits challenge metadata (creator/admin only).
- `DELETE /api/v1/challenges/:idOrCode`  
  *Action:* Deletes challenge and cleans up associated questions.
- `GET /api/v1/challenges/overview`  
  *Response:* Aggregated daily streak, active attempts resume cards, trending challenges, and creator standings.
- `GET /api/v1/challenges/:idOrCode/leaderboard`  
  *Response:* Quarantined standings until `deadlineAt` expires; dense ranking with score DESC and totalTimeMs ASC tie-breaking. 15-second localized memory cache.

#### 2. Challenge Execution & Attempts (`attempt-service` :5004 via Gateway)
- `POST /api/v1/quiz/attempts` or `POST /api/v1/attempts/start`  
  *Action:* Initiates contest attempt. Rejects second attempts. Enforces server timestamping and strict countdown.
- `PUT /api/v1/quiz/attempts/:id`  
  *Action:* Real-time answer autosave heartbeat.
- `POST /api/v1/quiz/attempts/:id/submit`  
  *Action:* Finalizes attempt. Computes score and `totalTimeMs`.
- `GET /api/v1/quiz/attempts/:id/result`  
  *Behavior:* Returns score breakdown only after deadline expires.

#### 3. Challenge Discovery & Fast Jumps (`api-gateway` / `quiz-service`)
- `GET /api/v1/search/universal?q=!QZ-...`  
  *Performance:* B-tree fast-path lookup resolving challenge by symbolic code in $< 5\text{ms}$.

#### 4. Challenge Operations & Moderation (`admin-service` :5008 via Gateway)
- `GET /api/v1/admin/content?type=challenge`  
  *Action:* Admin overview of all published challenges.
- `POST /api/v1/admin/content/:id/restrict`  
  *Action:* Restricts a fraudulent or broken challenge from public discovery with mandatory audited reason.
- `POST /api/v1/admin/content/:id/restore`  
  *Action:* Restores public visibility post-review.

---

### B. Frontend Routes

#### Desktop Web Client (`apps/desktop-web` — Port 5173)
- `/challenges` &rarr; [`Challenges.jsx`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/src/pages/Challenges/Challenges.jsx): Full challenge arena with streak tracker, featured banners, and category tabs.
- `/challenges/:quizId` &rarr; [`Quiz.jsx`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/src/pages/Quiz/Quiz.jsx): Direct challenge taking link.
- `/create/challenge` &rarr; [`ManualBuilder.jsx`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/src/pages/Create/ManualBuilder.jsx): Dedicated challenge creator posting to `/api/v1/challenges` with question cap and deadline scheduling.
- `/quiz/:quizId` &rarr; [`Quiz.jsx`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/src/pages/Quiz/Quiz.jsx): Strict contest arena with persistent ticking timer.
- `/result/:attemptId` &rarr; [`Result.jsx`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/src/pages/Result/Result.jsx): Result review screen (quarantine banner shown if contest is ongoing).
- `/admin/content` &rarr; [`AdminContent.jsx`](file:///c:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/src/pages/Admin/AdminContent.jsx): Administrator moderation and restriction table.

#### Mobile Web Client (`apps/mobile-web` — Port 5174)
- `/challenges` &rarr; Dedicated bottom-tab destination optimized for 48px touch targets, compact cards, and streak tracking.
- `/quiz/:id` &rarr; Mobile contest taking with floating countdown pill and swipe prevention.

---

## 4. 🏛️ Architecture & Data Model Deep Dive

### Challenge Data Schema (`Quiz.model.js`)

```javascript
{
  title: { type: String, required: true },
  quizCode: { type: String, unique: true, sparse: true, uppercase: true }, // e.g. !QZ-ABC123
  isChallenge: { type: Boolean, default: true, index: true },
  
  // Timing & Lifecycle
  durationMinutes: { type: Number, required: true, min: 1 }, // Contest timer
  deadlineAt: { type: Date, required: true, index: true },     // Final cutoff
  challengeStatus: {
    type: String,
    enum: ['draft', 'active', 'ended'],
    default: 'active',
    index: true
  },
  
  // Privacy & Access Control
  accessType: { type: String, enum: ['public', 'invite_only'], default: 'public' },
  inviteAccessType: { type: String, enum: ['invitation', 'approval', null], default: null },
  
  // Operational Moderation
  isRestricted: { type: Boolean, default: false, index: true },
  restrictedReason: { type: String, default: null },
  restrictedAt: { type: Date, default: null },
  restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Strict Competition Settings
  settings: {
    timeLimit: { type: Number },      // Mirrored from durationMinutes
    timerMode: { type: String, default: 'strict' },
    instantFeedback: { type: Boolean, default: false },
    allowReview: { type: Boolean, default: false }
  },
  
  totalQuestions: { type: Number, max: 10 }, // Hard limit
  totalAttempts: { type: Number, default: 0 },
  avgScore: { type: Number, default: 0 }
}
```

### Attempt Data Schema (`Attempt.model.js`)

```javascript
{
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  
  isPractice: { type: Boolean, default: false, index: true }, // True for contest creator
  
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  totalTimeMs: { type: Number, default: 0 }, // Tie-breaker precision in milliseconds
  
  score: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'timed_out', 'abandoned'],
    default: 'in_progress',
    index: true
  },
  
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId },
    selectedOption: { type: Number },
    timeSpentMs: { type: Number }
  }]
}
```

---

## 5. 🛡️ Security, Anti-Tamper & Competitive Integrity

1. **Client-Side Blind Execution:**
   - Contestants receive zero answer data in HTTP payloads. Correct options and explanations reside solely in backend storage until `deadlineAt` has passed.
2. **Server-Side Expiry Guard:**
   - Client-side timer pauses or clock skew do not grant extra time. Attempts submitted after `startedAt + durationMinutes + gracePeriod (15s)` are rejected or flagged as `timed_out`.
3. **Single Attempt Atomic Lock:**
   - MongoDB unique index and query checks guarantee a user can only possess one competitive attempt per challenge ID.
4. **Creator Disqualification:**
   - Organizers cannot win their own challenges. Any attempt where `attempt.userId === quiz.uploader` is stamped with `isPractice: true` and excluded from `calculateRankings()`.
5. **Operator Emergency Restriction:**
   - If a challenge is found to contain leaked questions or copyright infringement, admins can restrict it with 1 click via `/admin/content`. The restriction immediately removes the challenge from search and feeds across all web clients.

---

## 6. 📝 Summary & Quick Reference

| Aspect | Implementation Details |
| :--- | :--- |
| **Microservice Owners** | `quiz-service` (port 5002), `attempt-service` (port 5004), `admin-service` (port 5008) |
| **Primary Route** | `/challenges` (Desktop & Mobile) |
| **API Endpoints** | `/api/v1/social/challenges-overview`, `/api/v1/attempts/quiz/:id/leaderboard`, `/api/v1/quizzes` |
| **Key Invariant** | Max 10 questions, strict timer, 1 attempt, rankings revealed strictly post-deadline. |
