# Step 03 implementation report

**Status: partially complete.** The implemented identity and privacy changes passed local regression tests, including production Auth response headers. Deployment ingress and browser cookie handling, standalone mobile verification, and multi-replica behavior remain open.

## Architecture and changes

- [Identity architecture](21-identity-architecture.md) traces Auth, gateway, service-level authentication, Admin, Media and Socket.IO.
- [Authentication and sessions](22-authentication-and-sessions.md) documents refresh migration, session versions, cookie attributes, logout semantics, desktop retry behavior and existing limits.
- [Authorization matrix](23-authorization-policy-matrix.md), [resource privacy rules](24-resource-privacy-rules.md) and [service trust boundaries](25-service-trust-boundaries.md) describe policy by resource, the limits of issuer and database trust, and public storage exceptions.
- [Threat model](26-security-threat-model.md), [verification matrix](27-security-test-matrix.md) and [migration plan](28-security-migration-plan.md) record findings, passing and unexecuted checks, and rollback behavior.

Backend changes span Auth's controller, session service, user model, request validation and abuse middleware. Session verification was aligned in the gateway's downstream services. Challenge and Admin now reject empty CSRF pairs. Quiz and Attempt enforce challenge result sealing across their routed aliases. Social and Message recheck historical content references, Message revalidates idle sessions and Media applies current account checks to authenticated image actions. Existing URLs remain in place. The [API contract](04-api-contracts.md#step-03-identity-and-privacy) describes response changes.

Desktop changes cover its HTTP client, auth store, quiz details and Vite entry point. Protected requests retry once after a shared refresh. The quiz detail view clears stale analytics and shows when challenge results are sealed. The preview recovery guard reloads a stale bundle once per build. Verification used isolated test accounts and a local database. The standalone mobile app was excluded at the user's request.

## Follow-up verification and changes

The attached brief matched the prior Step 03 brief. This follow-up tested additional failure cases. Admin's middleware and user controller now distinguish explicit delegated memberships from copies of the global role. A global role change advances the account's session version and clears its refresh credential. A delegated user cannot promote an account or restore a suspended global admin. Admin overview, user detail and content detail apply audit and report permissions to embedded data. Existing membership records stay in place, and the provisioning script no longer creates a copy of the global role.

Auth now applies an independent address budget to login and registration, and derives refresh limits from the source address. It records internal request failures without logging raw exceptions or URLs. The desktop waits for confirmed sign-out, discards outdated bootstrap results and announces session and sign-in failures through existing feedback components. The sign-in redirect is validated before navigation. The authentication forms expose labels programmatically and use an orange keyboard focus outline.

The [verification matrix](27-security-test-matrix.md) records the passing commands and coverage boundaries. The [threat model](26-security-threat-model.md) rates remaining issues by risk. No production data migration or role updates were run. Step 04 stays at the handoff below.

## Step 04 handoff

The [collection ownership inventory](14-database-ownership.md) and [machine-readable model scan](architecture-inventory.json) describe the current MongoDB baseline. Confirm deployed collections and indexes with read-only access before introducing a migration. Use the existing MongoDB deployment and separate logical ownership from physical database placement.

1. Reconcile the duplicated User, Quiz/Challenge, Question and Attempt schemas. Confirm compatible defaults for missing versions and deadlines, authoritative role fields, unique competition attempts, and ownership across legacy aliases.
2. Audit orphaned attempts and references, duplicate or stale role memberships, image/clip references, and shared fields written by more than one service. Profile frequency before adding indexes.
3. Verify indexes for attempt owner and deadline lookups, conversation membership, notifications by recipient, username and email uniqueness, and refresh lookups by account ID. Benchmark the score-sorted discovery and overview queries with representative data.
4. Document and rehearse staged migration, read parity, least-privilege database access, backup restore and cleanup. Verify private images and parser artifacts before replacing their URL contract.
5. Preserve immutable question/asset snapshots, v1 API aliases and valid existing users. Carry forward the [open risks](26-security-threat-model.md), especially cross-origin sessions, shared keys, idle socket exposure and process-local abuse limits.
