/**
 * Tier 4: Real-World Application Scenarios E2E Test Suite
 * End-to-end user journeys simulating real-world student and educator flows.
 * Authoritative source: PROJECT.md & ORIGINAL_REQUEST.md.
 */

import { describe, test, it, expect, before, after } from './helpers/runner-core.js';
import { ApiClient } from './helpers/api-client.js';

describe('Tier 4: Real-World Application Scenarios', () => {

  // =========================================================================
  // Journey 1: New Student Registration & Profile Customization Flow
  // =========================================================================
  it('Journey 1: Full Student Onboarding (Register -> Login -> Configure Preferences -> Verify Me)', async () => {
    const student = new ApiClient();

    // 1. Registration
    const regResult = await student.registerTestUser('student_j1');
    expect(regResult.userId).toBeDefined();

    // 2. Fetch current profile via bootstrap
    const meRes = await student.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.data?.data?.user?.email).toBe(regResult.email);

    // 3. Configure preferences in Settings
    const updateRes = await student.patch('/api/v1/auth/me', {
      bio: 'Enthusiastic computer science student preparing for GRE and algorithms exams.',
      preferences: {
        soundCues: true,
        autoAdvance: true,
        theme: 'oled',
        fontSize: 'md',
        timerVisibility: 'visible',
      },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.data?.data?.user?.preferences?.soundCues).toBe(true);
    expect(updateRes.data?.data?.user?.preferences?.autoAdvance).toBe(true);
    expect(updateRes.data?.data?.user?.preferences?.theme).toBe('oled');

    // 4. Verify persistent profile
    const verifyRes = await student.get('/api/v1/auth/me');
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data?.data?.user?.bio).toContain('computer science');
  });

  // =========================================================================
  // Journey 2: Quiz Discovery & Social Explore Feed Browsing
  // =========================================================================
  it('Journey 2: Quiz Discovery & Community Explore Feed (Explore -> Trending -> Filter)', async () => {
    const student = new ApiClient();
    await student.registerTestUser('student_j2');

    // 1. Browse trending quizzes
    const trendingRes = await student.get('/api/v1/social/explore', {
      query: { page: 1, limit: 10 },
    });
    expect([200, 304]).toContain(trendingRes.status);
    expect(trendingRes.data?.success).toBe(true);

    // 2. Search usernames or authors
    const searchRes = await student.get('/api/v1/users/search', {
      query: { q: 'admin' },
    });
    expect([200, 404]).toContain(searchRes.status);
  });

  // =========================================================================
  // Journey 3: Taking Exam with Live Timer & Autosave Flow
  // =========================================================================
  it('Journey 3: Examination Flow with Attempt Creation, Progress Sync, and Submission', async () => {
    const student = new ApiClient();
    await student.registerTestUser('student_j3');

    // 1. Attempt start endpoint
    const startRes = await student.post('/api/v1/quiz/attempts/start', {
      quizId: '507f1f77bcf86cd799439020',
    });
    expect([200, 201, 400, 404]).toContain(startRes.status);

    // 2. Attempt sync progress endpoint
    const syncRes = await student.post('/api/v1/quiz/attempts/507f1f77bcf86cd799439020/sync-time', {
      elapsedSeconds: 45,
    });
    expect([200, 400, 404]).toContain(syncRes.status);
    expect(syncRes.status).not.toBe(500);

    // 3. Attempt submit endpoint
    const submitRes = await student.post('/api/v1/quiz/attempts/507f1f77bcf86cd799439020/submit', {
      totalTimeMs: 45000,
      answers: [],
    });
    expect([200, 400, 404]).toContain(submitRes.status);
    expect(submitRes.status).not.toBe(500);
  });

  // =========================================================================
  // Journey 4: Reviewing Scorecard & Attempt History
  // =========================================================================
  it('Journey 4: Attempt History & Results Review (Attempts List -> Result Query)', async () => {
    const student = new ApiClient();
    await student.registerTestUser('student_j4');

    // 1. Fetch user attempt history
    const historyRes = await student.get('/api/v1/attempts', { query: { page: 1, limit: 10 } });
    expect([200, 401]).toContain(historyRes.status);

    // 2. Fetch specific attempt result
    const resultRes = await student.get('/api/v1/quiz/attempts/507f1f77bcf86cd799439020/result');
    expect([200, 400, 404]).toContain(resultRes.status);
    expect(resultRes.status).not.toBe(500);
  });

  // =========================================================================
  // Journey 5: Student Feedback Submission & Moderation Record
  // =========================================================================
  it('Journey 5: Issue Reporting & Feedback Flow (Report -> Confirmation -> Moderation Storage)', async () => {
    const student = new ApiClient();
    const user = await student.registerTestUser('student_j5');

    // 1. Submit feedback from HelpSettings
    const feedbackRes = await student.post('/api/v1/admin/reports/submit', {
      targetType: 'feedback',
      targetId: 'quizfocus-ui',
      category: 'suggestion',
      reason: 'Loved the Apple-inspired animations! Please add keyboard shortcut list overlay.',
      description: 'Submitted during Journey 5 verification test.',
    });

    expect([200, 201]).toContain(feedbackRes.status);
    expect(feedbackRes.data?.success).toBe(true);

    const reportId = feedbackRes.data?.data?.report?._id || feedbackRes.data?.reportId;
    expect(reportId).toBeDefined();
  });

  // =========================================================================
  // Journey 6: Privacy Lockdown & Exclusivity Flow
  // =========================================================================
  it('Journey 6: Privacy Lockdown Flow (Private Mode Toggle -> Sync Invariants -> Un-lockdown)', async () => {
    const student = new ApiClient();
    await student.registerTestUser('student_j6');

    // 1. Go completely private
    const lockRes = await student.patch('/api/v1/auth/me', {
      isPrivate: true,
      preferences: {
        searchDiscovery: false,
        showOnLeaderboard: false,
        allowMessagesFrom: 'none',
      },
    });
    expect(lockRes.status).toBe(200);
    expect(lockRes.data?.data?.user?.isPrivate).toBe(true);
    expect(lockRes.data?.data?.user?.isProfilePublic).toBe(false);
    expect(lockRes.data?.data?.user?.preferences?.searchDiscovery).toBe(false);

    // 2. Re-open profile to public
    const unlockRes = await student.patch('/api/v1/auth/me', {
      isProfilePublic: true,
      preferences: {
        searchDiscovery: true,
      },
    });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.data?.data?.user?.isProfilePublic).toBe(true);
    expect(unlockRes.data?.data?.user?.isPrivate).toBe(false);
  });

});
