# QuizFocus repository redundancy audit

**Reviewed:** 2026-11-09  
**Scope:** service source, gateway, desktop/mobile clients, manifests, tests and active import graphs.  
**Method:** exact-copy findings are based on byte-identical source; dead-code findings require no production import/caller in the observed source graph. This is an evidence-ranked cleanup backlog, not permission to delete code without validating runtime/build references.

## Executive summary

The largest maintenance risks are duplicated authentication policy and duplicated live business logic. These are not interchangeable with harmless boilerplate: session checks, scoring, parsing and transport clients can drift in behavior. The API Gateway also contains copied models/helpers with no observed imports, while several services contain unreferenced copied parser/quiz stacks. Identical Mongoose schemas across services are often intentional local projections and should not be consolidated blindly.

No redundant production code was deleted as part of this audit. Findings below identify candidates and safe follow-up actions; changes to unrelated implementations require their own tests and rollout plan.

## Ranked findings

### P1 — Session-token validation is duplicated across eight services

`verifySessionToken` and `isCurrentSession` are identical in:

- `services/admin-service/src/utils/sessionToken.js`
- `services/attempt-service/src/utils/sessionToken.js`
- `services/auth-service/src/utils/sessionToken.js`
- `services/challenge-service/src/utils/sessionToken.js`
- `services/message-service/src/utils/sessionToken.js`
- `services/parser-service/src/utils/sessionToken.js`
- `services/quiz-service/src/utils/sessionToken.js`
- `services/social-service/src/utils/sessionToken.js`

These enforce JWT algorithm and claim restrictions, token version, and session revocation checks. They are used in live auth middleware and the messaging Socket.IO authorization path. The identity integration tests cover invalid-token and cross-service session/CSRF behavior.

**Why it matters:** a security fix applied to only some copies creates service-dependent identity policy.  
**Safe action:** first add a parity test that imports every copy and tests the same malformed/expired/current/revoked cases. Later extract the pure claim validator into a versioned shared package while retaining service-local user/session lookups. Avoid changing signing keys or session policy in the extraction.  
**Risk:** high; security behavior and independently deployed packages make uncoordinated upgrades unsafe.

### P2 — Gateway model and utility copies are dead by the observed import graph

The active gateway imports `runtime.js` and `contracts.js` for health, proxy and edge behavior. No production gateway imports were found for copied model files including:

- `services/api-gateway/src/models/Question.model.js`
- `services/api-gateway/src/models/Quiz.model.js`
- `services/api-gateway/src/models/User.model.js`
- `services/api-gateway/src/models/Attempt.model.js`
- `services/api-gateway/src/models/Activity.model.js`
- `services/api-gateway/src/models/QuizComment.model.js`

No production imports were found for gateway utility copies including `detectAnswer.js`, `fileCleaner.js`, `generateId.js`, `logger.js`, `normalizeColumns.js`, and `parserHelpers.js`.

**Safe action:** confirm there are no scripts, packaging steps, or external imports before deleting these files; then verify gateway tests and build.  
**Risk:** low to moderate. This is the clearest low-risk cleanup category, but the audit does not establish external consumer absence.

### P2 — Unreferenced copied parser/quiz service stacks

The Social service mounts its Social router; its active controllers do not import the copied parser/quiz stacks. Candidate unused trees include:

- `services/social-service/src/services/parser/`
- `services/social-service/src/services/quiz/attemptTracking.service.js`
- `services/social-service/src/services/quiz/quizGenerator.service.js`
- `services/social-service/src/services/quiz/scoring/`
- `services/social-service/src/services/quiz/timer/`
- `services/social-service/src/services/upload/fileHash.service.js`

The Parser service mounts its parser routes and uses `ParserRegistry`; no Parser controller callers were found for its copied quiz tracking, generation, scoring, or timer code.

**Safe action:** use dependency-aware removal one tree at a time; include dynamic imports, test imports and packaging scripts in the search; rerun each affected service's tests. Do not remove the Parser service's active parser implementation.  
**Risk:** low to moderate after a full import/test check.

### P2 — Live parser, scoring and timer logic is copied across services

Exact or near-exact copies are present in Attempt, Parser, Quiz and Social services. Examples include `ParserRegistry.js`, `csvParser.js`, `jsonParser.js`, `TimerStrategyFactory.js`, `BaseQuestionEvaluator.js`, `TrueFalseEvaluator.js`, and `excelParser.js` (the latter has at least two exact-copy groups). Attempt and Quiz import parser/timer components in live controller paths; Parser uses its registry in its active parser controller. Some corresponding Social and Parser quiz/timer copies appear unused.

**Why it matters:** bug fixes and supported format behavior may diverge; scoring drift can change quiz outcomes.  
**Safe action:** separate live versus unused copies first. For live code, add cross-service behavioral parity tests, then share only pure parsing/evaluation primitives in a versioned package. Keep persistence, route policy, upload authorization and service adapters local.  
**Risk:** medium to high; independently deployed consumers may update at different times.

### P2 — Desktop and mobile API transports are near-copies, not equivalent implementations

- `apps/desktop-web/src/api/axios.js`
- `apps/mobile-web/src/api/client.js`

Both configure `/api/v1`, cookie/CSRF handling, locale/timezone and guest-session headers. Desktop additionally owns refresh-client and retry/session-expiration behavior; mobile has different exports and interceptor behavior.

**Safe action:** add mobile transport contract coverage first. Share only proven-common header/cookie primitives, leaving refresh and platform-specific error handling in separate adapters.  
**Risk:** medium; deduplication can silently alter authentication/session behavior.

### P3 — Repeated utility/template files

Exact-copy groups include `logger.js`, `fileCleaner.js`, `generateId.js`, `normalizeColumns.js`, `parserHelpers.js`, and `detectAnswer.js` across multiple services. Some helpers are live (for example parser normalization/helper imports in Quiz); others are orphaned copies.

**Safe action:** inventory callers per file, remove confirmed orphans, and only package stable pure behavior used by multiple live owners. Avoid centralizing service-specific logging/configuration as if identical.  
**Risk:** low to medium for genuinely pure helpers; higher for apparent copies with different usage or deployment constraints.

### P3 — Identical Mongoose schemas are not automatically redundant

Exact copies include `Question.model.js`, `QuizComment.model.js`, and `Activity.model.js` in several service directories. Live Social, Quiz and Attempt handlers import their local models. The Gateway copies are a separate dead-code finding above.

**Safe action:** keep service-local schemas/projections when a service reads shared collections; add schema/index/contract parity checks and designate field ownership. Do not create a shared Mongoose package that gives every service an implicit write surface.  
**Risk:** high if consolidation couples independently owned data or obscures projection drift.

### P3 — Empty desktop social service stubs

These files were zero bytes and had no observed callers at audit time:

- `apps/desktop-web/src/services/social/comments.service.js`
- `apps/desktop-web/src/services/social/feedProfile.service.js`
- `apps/desktop-web/src/services/social/quizInteractions.service.js`

They are empty placeholders, not duplicate implementations. They may be retained and filled for the social domain API split or removed only after checking IDE/codegen conventions.

## Recommended remediation order

1. Establish session-token parity tests; only then plan a shared validator.
2. Remove confirmed gateway dead files in a separate reviewed change.
3. Inventory and remove unreferenced Social/Parser copied stacks.
4. Add scoring/parser parity tests before considering shared package extraction.
5. Add mobile transport tests before any client transport consolidation.
6. Track schema parity and service field ownership; do not merge model copies by default.

## Scope limitations

This is a source and import-graph audit of the repository state reviewed on 2026-11-09. It does not prove that no external deployment script, undocumented downstream package, or operator workflow references a candidate. No repository-wide duplicate-removal run was used as the basis for deletion. Each cleanup must verify the exact target in a focused change and report tests actually executed.