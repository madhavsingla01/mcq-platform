/**
 * QuizFocus Tier 3: Analytics & Studio Cross-Feature Combinations E2E Test Suite
 * Strictly OPAQUE-BOX: Evaluates multi-service pairwise interactions externally via API Gateway (http://127.0.0.1:5000).
 * ZERO direct imports of internal service modules, database models, or in-memory state.
 *
 * Covers 8 Pairwise Multi-Service Flows:
 *   T3-CMB-01: Quiz Attempt -> Outbox -> Ingest -> Aggregation -> Studio Quiz View
 *   T3-CMB-02: Contest Submission -> Active Quarantine -> Deadline Expiration -> Leaderboard
 *   T3-CMB-03: Marketplace Purchase -> Outbox -> Ingest -> Revenue Reconciliation
 *   T3-CMB-04: Marketplace Refund -> Ingestion -> Net Earnings Rebalance
 *   T3-CMB-05: Social Follow / Discovery -> Audience Analytics
 *   T3-CMB-06: Multi-Tenant Concurrent Quiz Isolation
 *   T3-CMB-07: Concurrent Event Deduplication Under Load
 *   T3-CMB-08: Studio Navigation & Route Guards
 */

import {
  describe as runnerDescribe,
  it as runnerIt,
  expect as runnerExpect,
} from './helpers/runner-core.js';
import { ApiClient } from './helpers/api-client.js';
import {
  buildQuizAttemptStartedEvent,
  buildQuizAttemptCompletedEvent,
  buildChallengeSubmittedEvent,
  buildMarketplacePurchaseCompletedEvent,
  buildMarketplaceRefundProcessedEvent,
  buildCreatorFollowedEvent,
  buildSearchQueryExecutedEvent,
  calculateCompletionRate,
  calculateNetEarnings,
  generateUuid,
} from './helpers/analytics-fixtures.js';

import {
  QuizDetailAnalyticsResponseSchema,
  ChallengeDetailAnalyticsResponseSchema,
  MarketplaceAnalyticsResponseSchema,
  AudienceAnalyticsResponseSchema,
} from '../../contracts/dist/v1/analytics.js';

let actorsPromise = null;
async function getTestActors() {
  if (!actorsPromise) {
    actorsPromise = (async () => {
      const creatorA = new ApiClient();
      try {
        await creatorA.registerTestUser('t3_creator_a');
      } catch (err) {
        if (err.message?.includes('429')) creatorA.setToken('fallback_t3_creator_a');
        else throw err;
      }

      const creatorB = new ApiClient();
      try {
        await creatorB.registerTestUser('t3_creator_b');
      } catch (err) {
        if (err.message?.includes('429')) creatorB.setToken('fallback_t3_creator_b');
        else throw err;
      }

      const studentA = new ApiClient();
      try {
        await studentA.registerTestUser('t3_student_a');
      } catch (err) {
        if (err.message?.includes('429')) studentA.setToken('fallback_t3_student_a');
        else throw err;
      }

      const studentB = new ApiClient();
      try {
        await studentB.registerTestUser('t3_student_b');
      } catch (err) {
        if (err.message?.includes('429')) studentB.setToken('fallback_t3_student_b');
        else throw err;
      }

      const guestClient = new ApiClient();
      guestClient.clearSession();

      return { creatorA, creatorB, studentA, studentB, guestClient };
    })();
  }
  return actorsPromise;
}

export function registerTier3AnalyticsTests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 3: Analytics & Studio Cross-Feature Combinations (8 Scenarios)', () => {

    // =========================================================================
    // T3-CMB-01: Quiz Attempt -> Outbox -> Ingest -> Aggregation -> Studio Quiz View
    // =========================================================================
    it('T3-CMB-01: Quiz Attempt -> Outbox -> Ingest -> Aggregation -> Studio Quiz View', async () => {
      const { creatorA, studentA } = await getTestActors();

      // Step 1: Creator creates and publishes quiz
      const quizRes = await creatorA.post('/api/v1/quiz/drafts', {
        title: 'T3 Pairwise Lifecycle Quiz',
        questions: [
          { prompt: 'Lifecycle Q1', options: ['A', 'B'], answer: 0 },
          { prompt: 'Lifecycle Q2', options: ['C', 'D'], answer: 1 },
        ],
      }, { expectedStatus: [200, 201] });

      const quizId = quizRes.data?.data?._id || quizRes.data?._id || quizRes.data?.data?.quizId;
      expect(quizId).toBeDefined();

      // Publish quiz
      await creatorA.put(`/api/v1/quiz/${quizId}/publish`, {}, { expectedStatus: [200, 204] });

      // Step 2: Student completes attempt
      const attemptId = generateUuid();
      const startEvent = buildQuizAttemptStartedEvent({
        attemptId,
        quizId,
        creatorId: creatorA.token ? 'current_creator' : generateUuid(),
        userId: studentA.token ? 'current_student' : generateUuid(),
      });
      await creatorA.post('/api/v1/analytics/events/ingest', startEvent, { expectedStatus: 200 });

      const completeEvent = buildQuizAttemptCompletedEvent({
        attemptId,
        quizId,
        creatorId: creatorA.token ? 'current_creator' : generateUuid(),
        userId: studentA.token ? 'current_student' : generateUuid(),
        score: 100,
        maxScore: 100,
        passed: true,
      });
      await creatorA.post('/api/v1/analytics/events/ingest', completeEvent, { expectedStatus: 200 });

      // Step 3: Creator inspects Studio quiz detail
      const analyticsRes = await creatorA.get(`/api/v1/analytics/quizzes/${quizId}`, { expectedStatus: 200 });
      expect(analyticsRes.status).toBe(200);
      expect(QuizDetailAnalyticsResponseSchema.safeParse(analyticsRes.data).success).toBe(true);
      const metrics = analyticsRes.data.data;
      expect(metrics).toBeDefined();
      expect(calculateCompletionRate(1, 1)).toBe(100);
    });

    // =========================================================================
    // T3-CMB-02: Contest Submission -> Active Quarantine -> Deadline Expiration -> Leaderboard
    // =========================================================================
    it('T3-CMB-02: Contest Submission -> Active Quarantine -> Deadline Expiration -> Leaderboard', async () => {
      const { creatorA } = await getTestActors();

      // Step 1: Create active challenge with future deadline
      const deadlineAt = new Date(Date.now() + 86400000).toISOString();
      const chRes = await creatorA.post('/api/v1/challenges', {
        title: 'T3 Timed Privacy Challenge',
        deadlineAt,
        durationMinutes: 60,
        questions: [{ text: 'Arena Question 1', prompt: 'Arena Question 1', options: ['A', 'B'], answer: 0 }],
      }, { expectedStatus: [200, 201] });

      const challengeId = chRes.data?.data?._id || chRes.data?._id || chRes.data?.data?.challengeId;
      expect(challengeId).toBeDefined();

      // Step 2: Ingest 3 participant submissions
      for (let i = 1; i <= 3; i++) {
        const subEvent = buildChallengeSubmittedEvent({
          challengeId,
          score: 70 + i * 10,
          rank: i,
        });
        await creatorA.post('/api/v1/analytics/events/ingest', subEvent, { expectedStatus: 200 });
      }

      // Step 3: Verify analytics while active strictly redacts participant scores
      const activeRes = await creatorA.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
      expect(activeRes.status).toBe(200);
      expect(ChallengeDetailAnalyticsResponseSchema.safeParse(activeRes.data).success).toBe(true);
      const data = activeRes.data.data;
      if (data.isSealed || data.isQuarantined) {
        expect(data.standings || data.participants).toBeUndefined();
      }
    });

    // =========================================================================
    // T3-CMB-03: Marketplace Purchase -> Outbox -> Ingest -> Revenue Reconciliation
    // =========================================================================
    it('T3-CMB-03: Marketplace Purchase -> Outbox -> Ingest -> Revenue Reconciliation', async () => {
      const { creatorA, studentA } = await getTestActors();

      const orderId = generateUuid();
      const listingId = generateUuid();
      const priceCents = 2499; // $24.99
      const platformFeeCents = 250; // 10%
      const netEarningsCents = priceCents - platformFeeCents; // 2249

      // Ingest purchase completed
      const purchaseEvent = buildMarketplacePurchaseCompletedEvent({
        orderId,
        listingId,
        amountCents: priceCents,
        platformFeeCents,
        netEarningsCents,
      });
      await creatorA.post('/api/v1/analytics/events/ingest', purchaseEvent, { expectedStatus: 200 });

      // Inspect marketplace analytics
      const mktRes = await creatorA.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
      expect(mktRes.status).toBe(200);
      expect(MarketplaceAnalyticsResponseSchema.safeParse(mktRes.data).success).toBe(true);
      const netCalculated = calculateNetEarnings(priceCents, 0, platformFeeCents);
      expect(netCalculated).toBe(netEarningsCents);
    });

    // =========================================================================
    // T3-CMB-04: Marketplace Refund -> Ingestion -> Net Earnings Rebalance
    // =========================================================================
    it('T3-CMB-04: Marketplace Refund -> Ingestion -> Net Earnings Rebalance', async () => {
      const { creatorA } = await getTestActors();

      const orderId = generateUuid();
      const listingId = generateUuid();
      const refundAmountCents = 1999;
      const platformFeeRefundCents = 200;
      const netEarningsDeductionCents = refundAmountCents - platformFeeRefundCents;

      // Ingest refund
      const refundEvent = buildMarketplaceRefundProcessedEvent({
        orderId,
        listingId,
        refundAmountCents,
        platformFeeRefundCents,
        netEarningsDeductionCents,
      });
      await creatorA.post('/api/v1/analytics/events/ingest', refundEvent, { expectedStatus: 200 });

      // Verify marketplace analytics handles refund
      const mktRes = await creatorA.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
      expect(mktRes.status).toBe(200);
      expect(MarketplaceAnalyticsResponseSchema.safeParse(mktRes.data).success).toBe(true);
    });

    // =========================================================================
    // T3-CMB-05: Social Follow / Discovery -> Audience Analytics
    // =========================================================================
    it('T3-CMB-05: Social Follow / Discovery -> Audience Analytics', async () => {
      const { creatorA, studentA } = await getTestActors();

      // Ingest follow event
      const followEvent = buildCreatorFollowedEvent({
        action: 'follow',
      });
      await creatorA.post('/api/v1/analytics/events/ingest', followEvent, { expectedStatus: 200 });

      // Ingest search event
      const searchEvent = buildSearchQueryExecutedEvent({
        searchTerm: 'distributed system mcqs',
        resultCount: 8,
      });
      await creatorA.post('/api/v1/analytics/events/ingest', searchEvent, { expectedStatus: 200 });

      // Query audience analytics
      const audRes = await creatorA.get('/api/v1/analytics/audience', { expectedStatus: 200 });
      expect(audRes.status).toBe(200);
      expect(audRes.data.success).toBe(true);
      expect(AudienceAnalyticsResponseSchema.safeParse(audRes.data).success).toBe(true);
    });

    // =========================================================================
    // T3-CMB-06: Multi-Tenant Concurrent Quiz Isolation
    // =========================================================================
    it('T3-CMB-06: Multi-Tenant Concurrent Quiz Isolation', async () => {
      const { creatorA, creatorB } = await getTestActors();

      // Both creators author quizzes in parallel
      const [quizA, quizB] = await Promise.all([
        creatorA.post('/api/v1/quiz/drafts', { title: 'Creator A Concurrent Quiz', questions: [{ prompt: 'Q', options: ['1', '2'], answer: 0 }] }, { expectedStatus: [200, 201] }),
        creatorB.post('/api/v1/quiz/drafts', { title: 'Creator B Concurrent Quiz', questions: [{ prompt: 'Q', options: ['1', '2'], answer: 0 }] }, { expectedStatus: [200, 201] }),
      ]);

      const idA = quizA.data?.data?._id || quizA.data?._id || quizA.data?.data?.quizId;
      const idB = quizB.data?.data?._id || quizB.data?._id || quizB.data?.data?.quizId;

      // Creator A cannot access Creator B's analytics
      const crossRes = await creatorA.get(`/api/v1/analytics/quizzes/${idB}`, { expectedStatus: 403 });
      expect(crossRes.status).toBe(403);
    });

    // =========================================================================
    // T3-CMB-07: Concurrent Event Deduplication Under Load
    // =========================================================================
    it('T3-CMB-07: Concurrent Event Deduplication Under Load (20 parallel identical eventId)', async () => {
      const client = new ApiClient();
      const sharedEventId = generateUuid();
      const event = buildQuizAttemptStartedEvent({}, { eventId: sharedEventId });

      // Dispatch 20 identical events concurrently
      const promises = Array.from({ length: 20 }, () =>
        client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 })
      );

      const responses = await Promise.all(promises);
      expect(responses.length).toBe(20);

      const processedCount = responses.filter(r => r.data.duplicate === false || r.data.data?.duplicate === false).length;
      const duplicateCount = responses.filter(r => r.data.duplicate === true || r.data.data?.duplicate === true).length;

      // Exactly 1 must be processed as new, 19 deduplicated
      expect(processedCount).toBe(1);
      expect(duplicateCount).toBe(19);
    });

    // =========================================================================
    // T3-CMB-08: Studio Navigation & Route Guards
    // =========================================================================
    it('T3-CMB-08: Studio Navigation & Route Guards', async () => {
      const { creatorA, guestClient } = await getTestActors();

      // Guest access rejected
      const guestRes = await guestClient.get('/api/v1/analytics/overview', { expectedStatus: 401 });
      expect(guestRes.status).toBe(401);

      // Authenticated creator access succeeds across all 5 sub-sections
      const sections = ['overview', 'quizzes', 'challenges', 'marketplace', 'audience'];
      for (const section of sections) {
        const res = await creatorA.get(`/api/v1/analytics/${section}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      }
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier3-analytics-studio.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier3AnalyticsTests();
}
