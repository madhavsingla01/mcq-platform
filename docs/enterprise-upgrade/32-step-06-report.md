# Step 06 report: quiz imports and duplicate safety

## Status

The scoped import-integrity and duplicate-privacy changes below are implemented. This is not a claim that the full quiz-engine or question-bank roadmap is complete; outstanding coverage and feature gaps are listed at the end.

## Verified architecture

- The Parser service owns upload persistence, file validation, parsing, and column mapping.
- The Quiz service owns quiz generation and question persistence. Parser and Quiz contain separate copies of upload/hash helpers and models; both duplicate lookup paths were updated.
- The desktop import journey is `Upload.jsx` → parser upload/parse/map routes → `Mapping.jsx` → Quiz `POST /quiz/generate`.
- Quiz/Question persistence remains in existing collections. No migration, index change, or database reset was performed.

## Changes

- File-hash duplicate lookup now requires an uploader and queries only that uploader's quizzes. It no longer returns another account's quiz title or identifier, regardless of that quiz's visibility.
- In-process generation locks are scoped by uploader and file hash. Guest generation has no stable quiz owner, so guests do not receive duplicate matches or share an in-flight generated quiz.
- Column mapping rejects missing answer mappings, unknown headers, non-array/insufficient option mappings, and reuse of the same column for multiple fields. The Mapping screen provides an immediate answer-column validation message; the API remains authoritative.
- Imported rows whose answers cannot be mapped to an actual option are skipped instead of persisting questions with no correct option. Boolean values now match both `true`/`false` and `yes`/`no` option text.
- Excel parsing now passes the configured data-row limit to SheetJS as it reads worksheets, rather than relying only on truncation after conversion.
- If bulk question insertion fails after quiz metadata was created, the generation path removes only that newly created quiz and its question rows. Failed cleanup is surfaced as an `AggregateError` and logged; it is not silently treated as successful.
- Added unit regressions for owner-scoped matching and locking, column mapping validation, Excel row caps, boolean answer normalization, and partial question-write rollback. Added a real API integration case for invalid headers, same-owner duplicate suggestions, cross-owner privacy, and private quiz denial.
- Added real JSON and XLSX import journeys through upload, parse, map, quiz generation, attempt, and scoring. Fixtures are generated in memory and use the isolated verification database.

## Verification

| Check | Result |
|---|---|
| `npm run test:ci` | Passed: 31 root tests, 136 service tests (Gateway 2, Attempt 19, Parser 30, Quiz 77, Social 5, Media 3), four UI tests, desktop and mobile production builds |
| `npm run test:media` | Passed: 13 isolated API/media tests, including CSV, JSON, XLSX, and owner-scoped duplicate regression journeys |
| `npm run test:integration` | Passed: 40 isolated API/database integration tests |
| `npm run security:audit` | Passed: zero critical; five existing high findings remain under exact exceptions expiring 2027-01-31 |
| `git diff --check` | Passed; Git reported existing LF/CRLF conversion warnings only |

The isolated database suites used the installed MongoDB 9.0 binary and test-owned temporary data; no application database was targeted. The latest media integration test process took about 10.5 seconds and the full integration test process about 13.6 seconds; neither time includes the full CI workflow.

## Remaining risks and deferred scope

- The generation lock is process-local. Concurrent requests handled by separate Quiz service replicas can still race; the current code does not establish a cross-replica uniqueness guarantee. A unique database key is not added because existing shared-file ownership, guest records, and legacy rows need a migration/compatibility plan first.
- Guests intentionally do not get duplicate reuse, since current generated quizzes do not store a stable guest-session ownership key.
- No reusable question-bank collection/API or cross-quiz semantic question deduplication was introduced. Neither has a stable ownership/privacy contract in the existing model, and approximate matching could silently discard meaningful question variants.
- Malicious archive/zip-bomb cases, browser-level creator journeys, and a multi-replica import stress test remain unverified. CSV, JSON, and XLSX imports have isolated API lifecycle coverage; legacy XLS is not independently covered.
- The existing SheetJS `xlsx` dependency still has high npm advisories (prototype pollution and ReDoS) with no npm fix. The dependency audit passes only because of the Step 05 time-bounded exception; row caps are defense in depth, not remediation for the library advisories.
- Parallel Quiz/Question model copies remain technical debt. No data migration was needed for these targeted changes.

## Step 07 handoff

Step 07 should focus on challenge lifecycle and integrity: test concurrent attempt starts/submissions across replicas, server-time enforcement and deadline finalization against persisted data, and challenge snapshot immutability. Preserve the existing ten-question maximum, mandatory timer, pre-deadline result sealing, creator-practice exclusion, and exact-rank tie rules.
