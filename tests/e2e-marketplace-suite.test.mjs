/**
 * ============================================================================
 * QuizFocus Phase 4 — Comprehensive 4-Tier E2E Test Suite
 * Educational Resource Upload & Marketplace Ingestion (Features F1 through F15)
 * ============================================================================
 *
 * Runner: Node.js Native Test Runner (`node:test`)
 * Target Path: mcq-platform/tests/e2e-marketplace-suite.test.mjs
 *
 * Structure:
 * - Tier 1: Feature Coverage (75 tests — 5 per feature for F1 through F15)
 * - Tier 2: Boundary & Corner Cases (75 tests — 5 per feature for F1 through F15)
 * - Tier 3: Cross-Feature Combinations (15 Pairwise Interactions: C1 through C15)
 * - Tier 4: Real-World Application Scenarios (8 Multi-Step Scenarios: S1 through S8)
 *
 * Total Test Count: 173 Tests.
 * All tests are self-contained, offline-safe, and verify genuine product implementations.
 */

import { describe, it } from 'node:test';
import { expect } from './e2e/helpers/runner-core.js';
import { registerTier1Tests } from './e2e/tier1-feature-coverage.test.js';
import { registerTier2Tests } from './e2e/tier2-boundary-corner.test.js';
import { registerTier3Tests } from './e2e/tier3-cross-feature.test.js';
import { registerTier4Tests } from './e2e/tier4-application-scenarios.test.js';

describe('QuizFocus Phase 4 — Educational Resource Upload & Marketplace Ingestion E2E Test Suite', () => {
  registerTier1Tests({ describe, it, expect });
  registerTier2Tests({ describe, it, expect });
  registerTier3Tests({ describe, it, expect });
  registerTier4Tests({ describe, it, expect });
});
