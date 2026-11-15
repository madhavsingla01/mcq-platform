/**
 * ============================================================================
 * QuizFocus Studio & Analytics Microservice — Comprehensive 4-Tier E2E Test Suite
 * (Tiers 1 through 4 per TEST_INFRA.md)
 * ============================================================================
 *
 * Runner: Node.js Native Test Runner (`node:test`)
 * Target Path: mcq-platform/tests/e2e-analytics-studio.test.mjs
 *
 * Structure:
 * - Tier 1: Feature Coverage (40 tests across 8 domains)
 * - Tier 2: Boundary & Corner Cases (40 tests: input validation & tenant isolation)
 * - Tier 3: Cross-Feature Combinations (8 Pairwise Multi-Service Flows)
 * - Tier 4: Real-World Application Scenarios (5 Comprehensive User Journeys)
 *
 * Total Test Count: 93 Tests.
 * All tests are opaque-box, contract-enforcing, and collision-proof.
 */

import { describe, it } from 'node:test';
import { expect } from './e2e/helpers/runner-core.js';
import { registerTier1AnalyticsTests } from './e2e/tier1-analytics-studio.test.js';
import { registerTier2AnalyticsTests } from './e2e/tier2-analytics-studio.test.js';
import { registerTier3AnalyticsTests } from './e2e/tier3-analytics-studio.test.js';
import { registerTier4AnalyticsTests } from './e2e/tier4-analytics-studio.test.js';

describe('QuizFocus Studio & Analytics Microservice — E2E Test Suite (Tiers 1-4)', () => {
  registerTier1AnalyticsTests({ describe, it, expect });
  registerTier2AnalyticsTests({ describe, it, expect });
  registerTier3AnalyticsTests({ describe, it, expect });
  registerTier4AnalyticsTests({ describe, it, expect });
});
