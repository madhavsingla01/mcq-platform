# TypeScript migration checklist

**Status** — In progress. The build and test pipeline checks the converted files in strict mode. Services and apps with a mixed source tree still contain JavaScript that needs migration.

## Audit

The initial source inventory at commit `687da8f` counted 756 JavaScript/JSX files and 15 TypeScript files across the platform, including tests and tooling. Only AI Integration had a production TypeScript build. The current inventory counts 104 TypeScript files and 684 JavaScript/JSX files. Counts include Vite configs, scripts and tests.

Run `npm run types:inventory` for the package totals or `npm run types:inventory -- --json` for every path. The inventory reads the current checkout, including newly created and renamed files. It excludes ignored dependencies and build output.

| Package | TypeScript | Remaining JavaScript |
| --- | ---: | ---: |
| Desktop web | 12 | 131 |
| Mobile web | 3 | 28 |
| Shared contracts | 11 | 0 |
| API Gateway | 9 | 22 |
| AI Integration | 15 | 1 |
| Attempt | 7 | 79 |
| Auth | 5 | 33 |
| Challenge | 4 | 16 |
| Media | 7 | 14 |
| Admin | 22 | 0 |
| Marketplace | 0 | 18 |
| Message | 0 | 39 |
| Parser | 0 | 87 |
| Quiz | 9 | 82 |
| Legacy Social | 0 | 67 |
| Social Comments | 0 | 4 |
| Social Feed | 0 | 4 |
| Social Interactions | 0 | 4 |
| Root tests and tooling | 0 | 55 |

## Completed

- [x] Admin Service runtime source compiles in strict mode without a JavaScript bridge. The unit suite also compiles as strict TypeScript. The System Health page validates its API response and displays connection status without database URLs. Admin user details omit stored session refresh credentials.
- [x] Quiz Service boot, database setup, legacy attempt relay, question model, and media validation compile in strict mode. Quiz authoring validates returned Media Service asset metadata before publication and preserves the existing cover storage path.
- [x] Root strict compiler settings, package type checks, CI enforcement, and lint rules for explicit `any`, type assertions, non-null assertions, and TypeScript suppression directives.
- [x] Gateway boot, proxy and WebSocket routing, request context, dependency health, rate limits, security middleware, audit logging, and a converted contract test.
- [x] Auth boot, configuration, MongoDB connection, logger, and access/refresh token claim narrowing.
- [x] Attempt boot, scoring strategies, and evaluator registry. Existing Mongoose models and attempt routes continue to provide their data.
- [x] Challenge boot, environment validation, ranking rules, and leaderboard cache.
- [x] Media boot, configuration, MongoDB connection, asset model, centralized errors, clip/reference policy, and the educational asset state machine.
- [x] AI Integration HTTP dependency responses enter as `unknown` and the identity adapter validates the fields it uses. Existing service-local build and runtime remain in use.
- [x] Both React entry points, desktop Axios and error normalization, media and challenge clients, answer choice and accessible playback components, competition standings, submission calendar, desktop error boundary, and mobile API client and auth store.
- [x] Version 1 Zod contracts for Gateway errors, users and sessions, quiz/challenge summaries, attempts and reveal permissions, standings, media, and submission activity. App consumers parse media responses, standings, calendars, and mobile login/bootstrap responses. Integration tests check actual Gateway responses against the schemas.
- [x] Per-service build and runtime image configuration for Gateway, Auth, Attempt, Challenge, Media, Admin, and Quiz. TypeScript is a development dependency. Each service builds inside its own directory and runs emitted JavaScript. Database schemas, collections, and indexes retain their existing names.

## Remaining migration sequence

- [ ] Finish Auth, Attempt, Challenge, and Media controllers, authorization middleware, repositories, lifecycle workers, and models. Dependency and request APIs passing through legacy JavaScript still need runtime validation and typed return values.
- [ ] Convert Quiz authoring, discovery, and draft/publication data contracts before completing builder and drag/reorder state. Convert Parser against the existing spreadsheet and PDF fixtures. Preserve attempt snapshot and review compatibility during both migrations.
- [ ] Convert Message and its socket event contracts, then the four Social services and Marketplace. Review cross-service imports and service-local database projections before changing persistence types.
- [ ] Complete both React app trees and convert applicable test and configuration files. Run the existing browser-level workflows for quiz authoring, timed attempts, and accessibility after their owning modules have been converted.
- [ ] Disable transitional `allowJs` in app and mixed-service configs once dependency graphs are converted. Review and remove obsolete service-local modules with no consumers, including dormant Gateway models. Verify full runtime validation coverage and enable type-aware linting for unsafe flows.
- [ ] Repeat fresh lockfile installs, production image builds, and the full end-to-end matrix before marking the migration complete.

## Verification

The dependency audit flagged older Mongoose lockfile entries in Auth, Attempt, Message, Parser, Quiz, and Social. Those entries now resolve to Mongoose 8.24.9 within the existing version ranges. Zod is pinned to 4.6.7. The existing Vite and SheetJS audit exceptions still apply.

The strict projects report zero compiler errors for the TypeScript currently included. The web apps and mixed services deliberately use `allowJs` with `checkJs: false` while their remaining modules are converted. A passing type check therefore applies to the TypeScript portion of those packages.

Run these commands from the platform directory. For production web builds, supply the desktop Vite configuration from its existing environment file or use the values configured in the quality workflow. For isolated integration tests, set `MONGOD_BINARY` if `mongod` is absent from PATH. The media suite uses FFmpeg and FFprobe.

| Command | Coverage |
| --- | --- |
| `npm run test:ci` | Strict compilation, type lint, contract and service tests, and both production web builds |
| `npm run test:integration` | Isolated MongoDB, the real Gateway and services, 134 end-to-end cases, and 42 lifecycle, messaging, and identity integration tests |
| `npm run test:media` | 13 media, access, review, and import cases against the isolated stack |
| `npm run test:invariants` | 12 attempt, identity, and standings invariants |
| `npm run test:security:production` | 1 isolated test covering origin, cookies, CSRF and refresh behavior in production Auth |
| `npm run test:concurrency` | 5 Gateway and Auth rate-limit checks |
| `npm run security:audit` | Passed with the repository's existing exceptions |
| `docker compose config --quiet` | Compose configuration validated |

Both Vite dev servers served the TypeScript entry point and imported shared contracts. Clean standalone Gateway, Admin, and Quiz installations built from their own lockfiles. The Gateway loaded its emitted code after development dependencies were removed, and the Admin and Quiz entry points passed syntax checks in the same production-only dependency layout. Docker image execution and manual browser and screen-reader passes remain unverified. The Docker daemon was unavailable on the development machine.

The isolated end-to-end runner creates its own administrator in the disposable database. When running the runner against an existing test environment, provide a dedicated test account using `QUIZFOCUS_TEST_ADMIN_EMAIL` and `QUIZFOCUS_TEST_ADMIN_PASSWORD`.
