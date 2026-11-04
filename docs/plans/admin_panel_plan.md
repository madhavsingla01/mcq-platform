# QuizFocus Admin Panel — Complete Implementation Plan

QuizFocus ab sirf MCQ quiz website nahi hai. Tumhara current direction ek social challenge platform hai, jahan platform-created challenges, user-created challenges, participation, leaderboards aur creator profiles important hain.

Isliye admin panel ko sirf users ki list aur dashboard charts tak limited nahi rakhna chahiye. Iska primary purpose hona chahiye: platform manage karna, users aur content moderate karna, challenge integrity maintain karna, aur system health monitor karna.

Main plan ko tumhari existing MERN + microservices architecture ke according design kar raha hoon.

## 1. Admin panel ka overall structure

# QuizFocus Control Center
Platform operations · Moderation · System health

Users — Accounts, roles, suspensions  
Challenges — Review, status, integrity  
Moderation — Reports, appeals, actions  
System Health — Services, errors, latency  

UI direction: pure black background, subtle borders, orange primary actions, compact tables, minimal decoration.

Admin panel ko normal QuizFocus user interface se logically separate rakho. User-facing app ka focus challenges aur discovery par rahe; admin interface ka focus operational tasks par.

### Recommended routes

| Route | Purpose |
| --- | --- |
| `/admin` | Overview dashboard |
| `/admin/users` | User management |
| `/admin/content` | Quizzes aur challenges |
| `/admin/reports` | User-submitted reports |
| `/admin/moderation` | Moderation queue and decisions |
| `/admin/categories` | Topics and discovery taxonomy |
| `/admin/leaderboards` | Challenge-result investigations |
| `/admin/announcements` | Platform announcements |
| `/admin/audit-logs` | Administrative action history |
| `/admin/system` | Services, jobs, failures and health |
| `/admin/settings` | Admin access and platform configuration |

---

# 2. Module-by-module detailed plan

## Module 1 — Admin dashboard
Admin login ke baad ye first screen hogi. Iska purpose har user ki activity detail mein dikhana nahi, balki platform ki current condition aur pending work quickly samajhna hai.

### Overview
- Total users (Registered accounts)
- Active challenges (Currently running)
- Pending reports (Need moderation)
- Service status (Live health check)

Dashboard sections:
Recent admin actions · New user registrations · Challenge creation trends · Failed background jobs · Moderation queue · Service incidents

Required behavior:
- Date range filters: 24 hours, 7 days, 30 days.
- Counts ke liye server-side aggregation, na ki browser mein saare users fetch karna.
- Har metric ki clear definition.
- Dashboard cards par click karne se related filtered page open ho.
- Service failure ho to stale metrics ko live data ki tarah present na karo.

## Module 2 — User management
Admin users search aur account-level issues resolve kar sake.

### User listing
| Column | Purpose |
| --- | --- |
| User | Username, display name |
| Email | Authorized admins ke liye, need-based access |
| Joined | Registration date |
| Status | Active, suspended, deleted |
| Role | User ya assigned admin role |
| Activity | Relevant platform activity summary |
| Actions | View, suspend, restore |

Features:
- Username, email aur user ID se search.
- Status, role, registration date ke filters.
- Server-side pagination and sorting.
- User detail page with profile, public content, challenge participation summaries and moderation history.
- Account suspension aur restoration with reason.
- Account deletion/anonymization request workflow according to retention policy.

## Module 3 — Quiz and challenge management
Core module for QuizFocus. Quizzes and timed Challenges are distinct.

### A. Content listing
Filters:
- Content type: quiz / challenge.
- Visibility: public / private / unlisted.
- Status: draft, published, scheduled, active, completed, cancelled.
- Creator, Created date, Reports/moderation status.

### B. Content detail view
- Title, description, creator and creation time.
- Question count, topic, visibility.
- Challenge duration and deadline.
- Participation count and current lifecycle status.
- Reported questions or content.

### C. Admin actions
- Remove from public discovery (Restrict reported content)
- Restore visibility (Post-review)
- Soft removal with mandatory reason
- Review challenge result & eligibility checks
- Cancel running challenge (Emergency reason required)

## Module 4 — Reports and moderation
- High priority module for user-generated content.
- Report categories: Spam, Harassment/Abuse, Inappropriate content, Impersonation, Cheating/suspicious leaderboard, Copyright/DMCA, Other.
- Moderation queue statuses: `pending`, `in_review`, `action_taken`, `dismissed`, `appealed`, `closed`.
- Repeat-safe actions (idempotent).
- Appeals workflow separate from initial moderator.

## Module 5 — Challenge integrity and leaderboard investigations
Respect established challenge rules:
- Max 10 questions.
- Creator-defined duration.
- 1 attempt per user.
- Score descending, then completion time ascending.
- Answers & standings hidden until deadline lock.
- Unfinished attempts auto-submit at expiry.
- Creator practice attempt excluded from official leaderboard.

Controlled leaderboard recalculation with:
1. Incident ticket reason.
2. Affected challenge ID.
3. Old and proposed standings snapshot.
4. Authorization.
5. Recalculation record & audit log.

## Module 6 — Categories and discovery management
- Create, rename, archive categories.
- Topic/tag taxonomies.
- Merging duplicate or misspelled categories.
- Featured & official platform challenge configuration.

## Module 7 — Announcements and platform communication
- Platform-wide or targeted announcements (maintenance, competitions, policy updates).
- Title, body, audience, schedule, expiry date.

## Module 8 — Admin account and role management
RBAC roles:
- **Super Admin**: Full operational access and role management.
- **Moderator**: Reports, content review, policy moderation.
- **Support**: User lookup, non-sensitive troubleshooting.
- **Content Manager**: Categories, taxonomy, official challenges.
- **Operations**: System health, jobs, diagnostics.

## Module 9 — Audit logs
Append-only immutable audit trail capturing:
- `actorId`, `action`, `targetType`, `targetId`, `reason`, `requestId`, `before`, `after`, `createdAt`.
- Logs cannot be edited or deleted via UI or normal APIs.

## Module 10 — System health and background jobs
Microservices monitoring:
- API Gateway (5000), Auth (5001), Quiz (5002), Parser (5003), Attempt (5004), Social (5005), Message (5006), Media (5007), Admin (Proposed 5008).
- Latency, error rates, database connectivity, and job queues.

---

# 3. Architecture — Dedicated Admin Microservice

```
  ┌────────────────────────────────────────────────────────┐
  │         Desktop Web (Admin Layout: /admin/*)           │
  └───────────────────────────┬────────────────────────────┘
                              │ HTTP / Cookies
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                 API Gateway (:5000)                    │
  │               /api/v1/admin/* Proxy                    │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │              Admin Service (:5008)                     │
  │   RBAC · Audit Logs · Moderation · System Health       │
  └───────────┬───────────────┼───────────────┬────────────┘
              │               │               │
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │ auth-service │ │ quiz-service │ │attempt-servic│
      │    (:5001)   │ │    (:5002)   │ │    (:5004)   │
      └──────────────┘ └──────────────┘ └──────────────┘
```
