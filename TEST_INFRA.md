# QuizFocus MCQ Platform — E2E Test Infrastructure (Tiers 1–4)

## Overview
This document specifies the End-to-End (E2E) testing infrastructure designed and implemented for the QuizFocus MCQ Platform. The test harness provides opaque-box, requirement-driven verification covering the complete Feature Inventory (F1 through F12) defined in `PROJECT.md` and `ORIGINAL_REQUEST.md`.

---

## Directory & File Structure
```
mcq-platform/
├── tests/
│   └── e2e/
│       ├── runner.js                         # Master CLI test runner & reporter
│       ├── tier1-feature-coverage.test.js    # Tier 1: Feature Coverage (>=5 tests per feature F1-F12)
│       ├── tier2-boundary-corner.test.js     # Tier 2: Boundary & Corner Cases (>=5 tests per feature F1-F12)
│       ├── tier3-cross-feature.test.js       # Tier 3: Pairwise & Cross-Feature Combinations
│       ├── tier4-application-scenarios.test.js # Tier 4: Real-World Student & Educator User Journeys
│       └── helpers/
│           ├── runner-core.js                # Core test runner engine (describe, it, expect matchers)
│           ├── api-client.js                 # HTTP client with cookie jar, CSRF, JWT, and session isolation
│           └── static-checker.js             # AST / CSS design tokens / JSON manifest inspector
├── TEST_INFRA.md                             # This infrastructure specification
└── TEST_READY.md                             # Test execution status & defect escalation report
```

---

## Test Execution Commands

### Run Full E2E Test Suite (All Tiers 1–4)
```powershell
node mcq-platform/tests/e2e/runner.js
```

### Run by Specific Tier
```powershell
# Tier 1: Feature Coverage (F1 to F12)
node mcq-platform/tests/e2e/runner.js --tier=1

# Tier 2: Boundary & Corner Cases (F1 to F12)
node mcq-platform/tests/e2e/runner.js --tier=2

# Tier 3: Cross-Feature Combinations
node mcq-platform/tests/e2e/runner.js --tier=3

# Tier 4: Real-World Application Scenarios
node mcq-platform/tests/e2e/runner.js --tier=4
```

### Filter by Feature or Keyword
```powershell
# Run only tests covering Feature F5 (Feedback & Reports)
node mcq-platform/tests/e2e/runner.js --grep="F5"

# Run with verbose output (display each passing test with execution latency)
node mcq-platform/tests/e2e/runner.js --verbose
```

---

## Test Methodology: 4-Tier Strategy

| Tier | Name | Target Scope | Minimum Requirements | Implemented Tests |
|---|---|---|---|---|
| **Tier 1** | **Feature Coverage** | Primary operations and happy path across F1 to F12 | $\ge 5$ test cases per feature | **60 Tests** |
| **Tier 2** | **Boundary & Corner Cases** | Edge inputs, zero/negatives, max limits, unicode, latex, attacks | $\ge 5$ test cases per feature | **60 Tests** |
| **Tier 3** | **Cross-Feature Combinations** | Pairwise interactions across auth, quiz, scoring, history, settings | Multi-service combinations | **8 Scenarios** |
| **Tier 4** | **Real-World Scenarios** | Realistic end-to-end user journeys from registration to review | Full student & educator flows | **6 Journeys** |
| **Total** | | **Complete Opaque-Box E2E Suite** | | **134 Tests** |

---

## Feature Coverage Matrix (F1 through F12)

| Feature | Description | Tier 1 Tests | Tier 2 Boundaries | Tier 3 Combos | Tier 4 Journeys |
|---|---|---|---|---|---|
| **F1** | Strict Orange & Dark Neutral Palette | F1-1 to F1-5 (5) | F1-B1 to F1-B5 (5) | Combo 7 | Journey 1 |
| **F2** | Apple-Inspired Animation & Interaction Polish | F2-1 to F2-5 (5) | F2-B1 to F2-B5 (5) | Combo 7 | Journey 1 |
| **F3** | Microservices Security Hardening | F3-1 to F3-5 (5) | F3-B1 to F3-B5 (5) | Combo 1, 5, 6 | Journey 1, 5 |
| **F4** | Performance Bottleneck Remediation | F4-1 to F4-5 (5) | F4-B1 to F4-B5 (5) | Combo 2, 8 | Journey 2 |
| **F5** | Wire Feedback & Issue Reporting | F5-1 to F5-5 (5) | F5-B1 to F5-B5 (5) | Combo 4, 5 | Journey 5 |
| **F6** | Wire Attempt History & Profile Endpoints | F6-1 to F6-5 (5) | F6-B1 to F6-B5 (5) | Combo 1, 3, 4 | Journey 1, 3, 4 |
| **F7** | Wire Preferences & Privacy Persistence | F7-1 to F7-5 (5) | F7-B1 to F7-B5 (5) | Combo 1, 2, 3, 7 | Journey 1, 6 |
| **F8** | Fix Dead-End Routes & Redundant Requests | F8-1 to F8-5 (5) | F8-B1 to F8-B5 (5) | Combo 3, 4, 8 | Journey 3, 4 |
| **F9** | Fix Render Container Builds & Port Binding | F9-1 to F9-5 (5) | F9-B1 to F9-B5 (5) | Combo 8 | Journey 2 |
| **F10** | Configure Cross-Domain CORS & Cookies | F10-1 to F10-5 (5) | F10-B1 to F10-B5 (5) | Combo 6 | Journey 1 |
| **F11** | Vercel Deployment Readiness & Config | F11-1 to F11-5 (5) | F11-B1 to F11-B5 (5) | Combo 7 | Journey 2 |
| **F12** | Root Test Runner & Gateway Tests | F12-1 to F12-5 (5) | F12-B1 to F12-B5 (5) | Combo 6, 8 | Journey 2, 4 |

---

## Authoritative Expected Output Derivation
All test assertions in this suite are directly derived from:
1. `PROJECT.md` § Architecture, § Feature Inventory (F1 to F12), and § Interface Contracts.
2. `ORIGINAL_REQUEST.md` § Requirements (R1 to R4) and § Acceptance Criteria.
3. Live HTTP REST API entry points proxied via API Gateway (Port 5000) and direct microservice endpoints.
4. CSS variables, design tokens, and AST inspection of frontend components and manifest files.

Zero facade tests or tautologies are included. Failed assertions strictly pinpoint unimplemented or defective requirements slated for completion in Milestones M1, M2, M3, and M4.
