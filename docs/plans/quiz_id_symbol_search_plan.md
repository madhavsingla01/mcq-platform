# ⚡ Quiz Symbolic Identifiers & Fast Search Optimization Plan

> **Goal**: Assign every quiz a unique, human-memorable code starting with a distinctive symbol (e.g., `!QZ-XXXXXX`), alongside `@username` for users, enabling instant $O(1)$ index-based searching and direct quiz joining.  
> **Status**: Ready for User Review & Sign-Off  
> **Scope**: Backend (`quiz-service`, `api-gateway`), Database (MongoDB), Desktop Web (`desktop-web`), Mobile Web (`mobile-web`).

---

## 1. Executive Summary & Problem Diagnosis

### Current Search Bottlenecks:
1. **Full-Collection Regex Scans**: Currently, when a user types in search, the server executes regex queries across `title`, `description`, `category`, and `tags` in Quizzes, alongside full scans in `User.name`, `username`, and `bio`. This causes noticeable keystroke lag as the database grows.
2. **Long, Non-Typable MongoDB ObjectIds**: Quiz URLs rely on 24-character hexadecimal IDs (e.g. `/quiz/671d1e4c9f1a2b3c4d5e6f7a`), making it impossible for students or teachers to quickly share, remember, or verbally dictate a quiz code in a classroom or chat.
3. **No Prefix Disambiguation**: The search engine cannot distinguish whether the user intends to find a user, a specific quiz, or a topic until it scans all collections.

### The Solution:
- **`@` for Users / Creators** (e.g. `@alex`, `@sarah_dev`) — Fast-path to user profile.
- **`!` for Quizzes** (e.g. `!QZ-7K9M2P` or custom slug `!bio101`) — Instant direct jump to quiz.
- **`#` for Hashtags / Topics** (e.g. `#biology`, `#neet`, `#gate2027`) — Topic aggregation feed.

---

## 2. Symbol Selection & Code Format

| Option | Format Example | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- | :---: |
| **Option A (Recommended)** | **`!QZ-88214`** or **`!bio101`** | • Single keystroke (`Shift+1` or mobile symbol)<br>• Zero collision with `#hashtags`<br>• Discord bot / command bar standard<br>• Instant $O(1)$ prefix routing | Requires symbol key on keyboard | **⭐ Recommended** |
| **Option B** | **`#QZ-88214`** | • Kahoot / Game PIN style familiarity<br>• Looks like a ticket / issue number | Collides with `#hashtag` syntax; requires regex lookahead | Viable Alternative |
| **Option C** | **`~QZ-88214`** or **`$QZ-88214`** | • Unique ASCII characters | Clunky to type on mobile keyboards | Not recommended |

### Proposed Code Structure:
`!<PREFIX>-<NANOID>`
- **Standard Auto-Generated**: `!QZ-7K9M2P` (6 characters from Base32 alphabet: letters and numbers, excluding ambiguous `0`, `O`, `1`, `I` for foolproof readability).
- **Custom Creator Shortcode** (Optional for creators): e.g. `!neet-bio-24`, `!python-basics`.

---

## 3. High-Speed Architecture: Prefix Routing Engine

```
                             User Input
                                 │
                 ┌───────────────┴───────────────┐
                 │  Does query start with symbol?│
                 └───────────────┬───────────────┘
          ┌──────────────────────┼──────────────────────┐
          │ Starts with `@`      │ Starts with `!`      │ Starts with `#` or text
          ▼                      ▼                      ▼
┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────┐
│  USER FAST-PATH   │  │  QUIZ FAST-PATH   │  │ MULTI-FIELD SEARCH  │
│ - Skip Quiz query │  │ - Skip User query │  │ - Title/Category    │
│ - Skip Tags query │  │ - Skip Tags query │  │ - Tag Aggregation   │
│ - Direct B-Tree   │  │ - Direct B-Tree   │  │ - Creator regex     │
│   Index on @user  │  │   Index on !code  │  │                     │
│   Latency: ~2ms   │  │   Latency: ~2ms   │  │   Latency: ~40ms    │
└───────────────────┘  └───────────────────┘  └─────────────────────┘
```

---

## 4. Phase-by-Phase Technical Implementation Plan

### Phase 1: Database Schema & Auto-Generation Hook (`services/quiz-service`)
1. **Schema Update (`Quiz.model.js`)**:
   ```javascript
   quizCode: {
     type: String,
     unique: true,
     sparse: true,
     uppercase: true,
     trim: true,
     index: true, // Unique sparse B-tree index
   }
   ```
2. **Collision-Proof Code Generator**:
   - Generate `!QZ-` + 6 random alphanumeric characters from unambiguous set `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.
   - Pre-validate/Pre-save Mongoose hook to generate `quizCode` for new quizzes automatically if not provided.
3. **Database Migration / Backfill Script**:
   - Create and run `scripts/backfill-quiz-codes.js` to assign a unique `!QZ-XXXXXX` code to all existing quizzes in the MongoDB database.

### Phase 2: Route & Controller Resolution
1. **Dual Resolution on `/api/v1/quiz/:id`**:
   - Support both Mongo ObjectId and symbolic `quizCode`:
     ```javascript
     const isCode = req.params.id.startsWith('!') || req.params.id.startsWith('#');
     const filter = isCode
       ? { quizCode: req.params.id.toUpperCase().replace(/^#/, '!') }
       : { _id: req.params.id };
     ```
2. **Dedicated Fast-Lookup Endpoint**:
   - `GET /api/v1/quizzes/code/:code` -> returns quiz preview in `< 5ms`.
3. **Prefix-Accelerated `universalSearch` in `search.controller.js`**:
   - **If `q.startsWith('!')`**:
     - Query ONLY `Quiz.find({ quizCode: new RegExp('^' + escapeRegex(cleanCode), 'i') })`.
     - Skip User collection and hashtag aggregation entirely.
   - **If `q.startsWith('@')`**:
     - Query ONLY `User.find({ username: new RegExp('^' + escapeRegex(cleanUsername), 'i') })`.
     - Skip Quiz collection and hashtag aggregation entirely.
   - **If normal text**: Standard multi-target ranking search.

### Phase 3: Desktop Web UI Enhancements (`apps/desktop-web`)
1. **Global Search Modal (`GlobalSearchModal.jsx`)**:
   - Update placeholder: `"Type ! for quiz code, @ for creators, # for topics..."`.
   - Quick Filter syntax chips:
     - `[! Quizzes]`
     - `[@ Creators]`
     - `[# Hashtags]`
   - Direct Jump Banner: When query matches full `!QZ-XXXXXX`, show highlighted *"Direct Jump to Quiz (Press Enter)"* card.
2. **Quiz Cards & Detail Badges**:
   - Add a subtle G2 squircle pill badge `!QZ-XXXXXX` on every quiz card with a 1-click copy icon.
   - Click to copy with Sonner toast notification (*"Quiz Code !QZ-7K9M2P copied to clipboard!"*).
3. **In-Chat Auto Expansion (`Messages.jsx`)**:
   - When a user sends a message containing `!QZ-XXXXXX`, automatically render the interactive Quiz Preview card with a "Play Quiz" button.

### Phase 4: Mobile Web UI Enhancements (`apps/mobile-web`)
1. **Mobile Search View (`MobileExplore.jsx` & `MobileMessages.jsx`)**:
   - Touch-friendly syntax chips (`! Quiz Code`, `@ Creators`, `# Topics`).
   - 1-tap copy quiz code on quiz cards.
   - Fast direct join dialog (type or paste code to jump straight to quiz attempt).
2. **Mobile Chat Integration (`MobileMessages.jsx`)**:
   - Quiz card badges and instant code expansion.

---

## 5. End-to-End Verification & Benchmark Criteria
1. **Migration Verification**: Verify 100% of quizzes in MongoDB have a unique `!QZ-` code.
2. **Latency Benchmark**: Measure search response times before vs after prefix optimization (target: `< 10ms` on prefix search).
3. **Dual URL Resolution**: Verify `/quiz/!QZ-XXXXXX` loads identical quiz attempt as `/quiz/<objectId>`.
4. **Desktop & Mobile UI Check**: Verify badge display, 1-click copy, and search dropdown suggestions across both frontends.
