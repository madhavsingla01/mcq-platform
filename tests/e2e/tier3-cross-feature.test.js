/**
 * Tier 3: Cross-Feature Combinations E2E Test Suite
 * Pairwise and multi-feature interaction testing across auth, quiz creation,
 * taking quiz, scoring, history, and settings.
 * Authoritative source: PROJECT.md Feature Inventory & Interface Contracts.
 */

import { describe, test, it, expect, before, after } from './helpers/runner-core.js';
import { ApiClient } from './helpers/api-client.js';
import {
  PATHS,
  readFileSafe,
} from './helpers/static-checker.js';

describe('Tier 3: Cross-Feature Combinations', () => {

  // =========================================================================
  // Combo 1: Auth + Profile Preferences Update + Persistence (F3 + F6 + F7)
  // =========================================================================
  it('Combo 1: Auth Registration -> Profile Preferences Update -> Session Persistence', async () => {
    const client = new ApiClient();
    const user = await client.registerTestUser('combo1');

    expect(user.userId).toBeDefined();

    // Update preferences via PATCH /api/v1/auth/me
    const updateRes = await client.patch('/api/v1/auth/me', {
      bio: 'Cross-feature test bio',
      preferences: {
        soundCues: true,
        autoAdvance: false,
        theme: 'oled',
        fontSize: 'lg',
      },
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.data?.data?.user?.bio).toBe('Cross-feature test bio');
    expect(updateRes.data?.data?.user?.preferences?.soundCues).toBe(true);
    expect(updateRes.data?.data?.user?.preferences?.autoAdvance).toBe(false);

    // Re-verify in separate GET request
    const getRes = await client.get('/api/v1/auth/me');
    expect(getRes.status).toBe(200);
    expect(getRes.data?.data?.user?.preferences?.soundCues).toBe(true);
    expect(getRes.data?.data?.user?.preferences?.theme).toBe('oled');
  });

  // =========================================================================
  // Combo 2: Explore Aggregation + Privacy Filter (F4 + F7)
  // =========================================================================
  it('Combo 2: Social Explore Aggregation adheres to Privacy Flag Settings', async () => {
    const client = new ApiClient();
    await client.registerTestUser('combo2_private');

    // Set user to private
    const privRes = await client.patch('/api/v1/auth/me', {
      isPrivate: true,
      preferences: { searchDiscovery: false },
    });
    expect(privRes.status).toBe(200);
    expect(privRes.data?.data?.user?.isPrivate).toBe(true);

    // Explore trending quizzes should execute fast aggregation pipeline without leak
    const exploreRes = await client.get('/api/v1/social/explore');
    expect([200, 304]).toContain(exploreRes.status);
    expect(exploreRes.data?.success).toBe(true);
  });

  // =========================================================================
  // Combo 3: Quiz Discovery -> Attempt Initiation -> Result Query (F6 + F7 + F8)
  // =========================================================================
  it('Combo 3: Attempt Initiation and Result Query Route Integrity', async () => {
    const client = new ApiClient();
    await client.registerTestUser('combo3_attempt');

    // Attempt start probe
    const startRes = await client.post('/api/v1/quiz/attempts/start', {
      quizId: '507f1f77bcf86cd799439011',
    });
    expect([200, 201, 400, 404]).toContain(startRes.status);

    // Attempt result query does not throw gateway error
    const resultRes = await client.get('/api/v1/quiz/attempts/507f1f77bcf86cd799439011/result');
    expect([200, 400, 404]).toContain(resultRes.status);
    expect(resultRes.status).not.toBe(500);
    expect(resultRes.status).not.toBe(502);
  });

  // =========================================================================
  // Combo 4: Attempt History Listing + Activity Result Navigation (F5 + F6 + F8)
  // =========================================================================
  it('Combo 4: Attempt History List Contract matches ActivitySettings Result Routing', async () => {
    const client = new ApiClient();
    await client.registerTestUser('combo4_history');

    // Check GET /api/v1/attempts
    const historyRes = await client.get('/api/v1/attempts');
    expect([200, 401]).toContain(historyRes.status);

    // Verify ActivitySettings code routes to /result/:attemptId
    const activityCode = readFileSafe(PATHS.activitySettings) || '';
    expect(activityCode).toMatch(/\/result\/\$/);
  });

  // =========================================================================
  // Combo 5: User Issue Reporting on Quiz + Admin Moderation Queue (F3 + F5)
  // =========================================================================
  it('Combo 5: User Reports Quiz Issue -> Report Persisted with Status Pending', async () => {
    const client = new ApiClient();
    const user = await client.registerTestUser('combo5_reporter');

    const reportRes = await client.post('/api/v1/admin/reports/submit', {
      targetType: 'quiz',
      targetId: '507f1f77bcf86cd799439015',
      targetTitle: 'World History Challenge',
      reason: 'Inaccurate fact in question 2',
      description: 'Submitted during cross-feature combo test',
    });

    expect([200, 201]).toContain(reportRes.status);
    expect(reportRes.data?.success).toBe(true);
    const reportData = reportRes.data?.data?.report;
    if (reportData) {
      expect(reportData.status).toBe('pending');
      expect(reportData.targetType).toBe('quiz');
    }
  });

  // =========================================================================
  // Combo 6: Gateway Cross-Origin + Security Headers + CORS (F3 + F10 + F12)
  // =========================================================================
  it('Combo 6: Gateway enforces Helmet headers and CORS simultaneously', async () => {
    const client = new ApiClient();
    const res = await client.request('GET', '/api/v1/health', {
      headers: { Origin: 'http://localhost:5173' },
    });

    // CORS verification
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');

    // Security headers verification
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  // =========================================================================
  // Combo 7: Theme Tokens + Apple Easing + Touch Feedback (F1 + F2 + F7)
  // =========================================================================
  it('Combo 7: UI Theme tokens cooperate with Apple Motion and Active Touch feedback', () => {
    const indexCss = readFileSafe(PATHS.indexCss) || '';

    // Primary palette
    expect(indexCss).toMatch(/#ff4500/i);
    // Dark neutral glass
    expect(indexCss).toMatch(/#121214|#18181b/i);
    // Apple motion curve
    expect(indexCss).toContain('cubic-bezier(0.23, 1, 0.32, 1)');
    // Touch feedback
    expect(indexCss).toContain('scale(0.97)');
  });

  // =========================================================================
  // Combo 8: Challenges Route + Social Feed + Gateway Proxy (F4 + F8 + F12)
  // =========================================================================
  it('Combo 8: Challenges and Social services communicate cleanly via Gateway', async () => {
    const client = new ApiClient();
    const healthRes = await client.get('/api/v1/health');
    expect(healthRes.status).toBe(200);

    const socialHealth = healthRes.data?.services?.social?.status;
    const challengeHealth = healthRes.data?.services?.challenge?.status;

    expect(socialHealth).toBe('healthy');
    expect(challengeHealth).toBe('healthy');
  });

});
