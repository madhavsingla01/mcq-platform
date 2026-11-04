# QuizFocus Admin Control Center — Operational Guide

> **Microservice:** `services/admin-service` (Port 5008)  
> **API Gateway Proxy:** `http://localhost:5000/api/v1/admin/*`  
> **Frontend Route:** `http://localhost:5173/admin`  
> **Target Audience:** Platform Administrators, Moderators, Operations Staff  

---

## 1. Quick Access & Login

1. **Direct URL:** [http://localhost:5173/admin](http://localhost:5173/admin)
2. **From Desktop App:** Look for the **"Admin Panel"** link in the left sidebar (marked with an orange `ShieldCheck` icon).
3. **Authorization:** Access is strictly gated by `role: 'admin'`. Non-admin accounts attempting to visit `/admin/*` are automatically redirected to `/dashboard`.

---

## 2. Managing Admin Roles & Accounts

### Promoting a User to Administrator
To grant an account full Super Admin access, run the promotion utility:

```powershell
# From mcq-platform root:
node services/auth-service/src/scripts/make-admin.js <user-email-or-username>

# Examples:
node services/auth-service/src/scripts/make-admin.js madhav1@gmail.com
node services/auth-service/src/scripts/make-admin.js ram@gmail.com
```

### Pre-configured Admin Roles
The RBAC engine pre-seeds four system roles:

| Role Slug | Name | Permissions | Responsibility |
| :--- | :--- | :--- | :--- |
| `super_admin` | Super Admin | `*` (Universal) | Operational authority, role assignments, security controls |
| `moderator` | Moderator | `manage_content`, `restrict_content`, `manage_reports`, `suspend_users`, `view_audit_logs` | Content inspection, report resolution, abusive user suspension |
| `content_manager` | Content Manager | `manage_content`, `manage_categories` | Challenge curations, taxonomy, featured quizzes |
| `support` | Support | `manage_users`, `manage_reports` | Non-destructive account troubleshooting |

---

## 3. Core Modules & Operational Workflows

### Module 1: Platform Overview (`/admin`)
- **KPI Metrics:** Registered accounts, active challenges running, pending reports requiring review, and overall service status.
- **7-Day Trend:** Real-time chart displaying daily user registration volume.
- **Audit Feed:** Instant preview of the latest administrative decisions.

### Module 2: User Accounts (`/admin/users`)
- **Instant Search:** Find accounts by Display Name, `@username`, Email, or `USR-XXXXXX` symbolic code.
- **Status Filter:** Toggle between `All`, `Active`, and `Suspended`.
- **Account Suspension:**
  - Click **Suspend** on any user row.
  - Enter a **mandatory operational reason** (e.g. *"Spamming comments in challenge #104"*).
  - Confirming invalidates all active JWT tokens for that user immediately, preventing further requests.
- **Account Restoration:** One-click restoration clears the suspension flag and re-enables login.

### Module 3: Quizzes & Challenges (`/admin/content`)
- **Symbolic Codes:** Copy any quiz's unique code (e.g. `!QZ-K9B8X2`) with 1 click.
- **Discovery Restriction:**
  - If a quiz or challenge violates policy or receives legitimate DMCA/spam complaints, click **Restrict**.
  - A modal prompts for an audited reason.
  - Once restricted, the quiz is excluded from Explore feeds, search results, and challenge arenas while remaining accessible to its author for inspection.
- **Visibility Restoration:** One-click post-review restoration brings the content back into discovery feeds.

### Module 4: Moderation Queue (`/admin/reports`)
- Triage community-submitted reports categorized into:
  - `Spam`, `Harassment`, `Inappropriate`, `Impersonation`, `Cheating`, `Copyright / DMCA`, `Other`.
- **Resolution Outcomes:**
  - **Dismiss:** Closes report as benign or false report.
  - **Restrict Content:** Automatically restricts the reported quiz/challenge and closes report.
  - **Suspend Creator:** Automatically suspends the reported user and closes report.
  - **Warning:** Logs an audited warning note without immediate state alteration.

### Module 5: Immutable Audit Trail (`/admin/audit-logs`)
- Every administrative action (`user_suspend`, `content_restrict`, `report_resolved`, `role_change`) is permanently stored in `admin_audit_logs`.
- **Schema-level Immutability:** Mongoose update and delete hooks throw hard errors—audit records cannot be edited or erased via UI or API.
- **Metadata Inspector:** Click any row to expand a live JSON snapshot showing the actor's IP, target entity ID, and exact state before and after the action.

### Module 6: System Health (`/admin/system`)
- **Microservices Ping Matrix:** Real-time polling across all 9 application services:
  - API Gateway (`:5000`), Auth (`:5001`), Quiz (`:5002`), Parser (`:5003`), Attempt (`:5004`), Social (`:5005`), Message (`:5006`), Media (`:5007`), Admin (`:5008`).
- **Telemetry:** Displays round-trip latency in milliseconds (`ms`), status (`healthy`, `degraded`, `offline`), and memory heap consumption.
- **Database States:** Verifies connection states across Admin, Auth, Quiz, and Attempt MongoDB databases.
