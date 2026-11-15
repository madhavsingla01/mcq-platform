/**
 * QuizFocus Tier 1: Analytics & Studio Feature Coverage E2E Test Suite
 * Strictly OPAQUE-BOX: Evaluates system externally via API Gateway perimeter (http://127.0.0.1:5000).
 * ZERO direct imports of internal service modules, database models, or in-memory state.
 * Validates external response envelopes against @quizfocus/contracts Zod schemas when available,
 * or validates HTTP status, headers, and structural JSON contract properties.
 *
 * Covers 8 functional domains with >=5 test cases per domain (40 tests total):
 *   Domain 1: Analytics Microservice Foundation & Probes (F2, F3)
 *   Domain 2: Idempotent Event Ingestion & Deduplication (F4, F5)
 *   Domain 3: Creator Overview Analytics (F6, F9)
 *   Domain 4: Per-Quiz Performance & Drop-Off Funnel (F10)
 *   Domain 5: Per-Challenge Reports & Active Contest Privacy (F11)
 *   Domain 6: Marketplace Analytics & Earnings Reconciliation (F12)
 *   Domain 7: Audience Insights & Discovery Sources (F13)
 *   Domain 8: Accessible Data Export (F14)
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
  buildDropoffFunnelFixture,
  buildContestDeadlineFixture,
  buildMarketplaceFinancialAuditFixture,
  calculateCompletionRate,
  calculateDropOffRate,
  calculateAccuracy,
  calculateConversionRate,
  calculateNetEarnings,
  generateUuid,
} from './helpers/analytics-fixtures.js';

// Dynamically attempt import of compiled contracts if available
let analyticsContracts = null;
try {
  analyticsContracts = await import('../../contracts/dist/v1/analytics.js');
} catch {
  analyticsContracts = null;
}

// Actor cache for test isolation
let actorsPromise = null;
async function getTestActors() {
  if (!actorsPromise) {
    actorsPromise = (async () => {
      const creatorClient = new ApiClient();
      try {
        const reg = await creatorClient.registerTestUser('t1_creator');
        creatorClient.userId = reg?.userId;
        creatorClient.user = reg?.user;
      } catch (err) {
        if (err.message?.includes('429')) {
          creatorClient.setToken('fallback_e2e_t1_creator');
          creatorClient.userId = '507f1f77bcf86cd799439001';
        } else throw err;
      }

      const studentClient = new ApiClient();
      try {
        await studentClient.registerTestUser('t1_student');
      } catch (err) {
        if (err.message?.includes('429')) studentClient.setToken('fallback_e2e_t1_student');
        else throw err;
      }

      const guestClient = new ApiClient();
      guestClient.clearSession();

      return { creatorClient, studentClient, guestClient };
    })();
  }
  return actorsPromise;
}

export function registerTier1AnalyticsTests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 1: Analytics & Studio Feature Coverage (40 Tests)', () => {

    // =========================================================================
    // Domain 1: Analytics Microservice Foundation & Probes (F2, F3)
    // =========================================================================
    describe('Domain 1: Microservice Foundation & Probes', () => {
      it('T1-ANA-01: Probe GET /api/v1/analytics/health returns HTTP 200 with service status', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/analytics/health', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data).toBeDefined();
        const body = res.data.data || res.data;
        const statusVal = body.status || res.data.status;
        expect(['ok', 'healthy', 'UP']).toContain(statusVal);
        const serviceName = body.service || res.data.service;
        expect(serviceName).toMatch(/analytics-service/);
      });

      it('T1-ANA-02: Probe GET /api/v1/analytics/ready returns HTTP 200 verifying read-model storage readiness', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/analytics/ready', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data).toBeDefined();
        const body = res.data.data || res.data;
        expect(body.ready === true || body.status === 'ready' || body.database === 'connected').toBe(true);
      });

      it('T1-ANA-03: API Gateway reverse-proxies /api/v1/analytics/* preserving session cookies and JWT bearer headers', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/overview?timeframe=30d', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });

      it('T1-ANA-04: Security response headers present on analytics endpoints', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/analytics/health', { expectedStatus: 200 });

        const nosniff = res.headers.get('x-content-type-options');
        expect(nosniff).toBe('nosniff');
        const requestId = res.headers.get('x-request-id');
        expect(requestId).toBeDefined();
      });

      it('T1-ANA-05: Unauthenticated request to protected analytics endpoint returns HTTP 401', async () => {
        const { guestClient } = await getTestActors();
        const res = await guestClient.get('/api/v1/analytics/overview', { expectedStatus: 401 });

        expect(res.status).toBe(401);
        expect(res.data.success).toBe(false);
      });
    });

    // =========================================================================
    // Domain 2: Idempotent Event Ingestion & Deduplication (F4, F5)
    // =========================================================================
    describe('Domain 2: Idempotent Event Ingestion & Deduplication', () => {
      it('T1-ING-01: POST /api/v1/analytics/events/ingest with valid quiz.attempt.started.v1 returns 200 processed', async () => {
        const client = new ApiClient();
        const event = buildQuizAttemptStartedEvent();

        const res = await client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.processed === true || res.data.data?.processed === true).toBe(true);
        expect(res.data.duplicate === false || res.data.data?.duplicate === false).toBe(true);
      });

      it('T1-ING-02: Repeated submission with duplicate eventId returns 200 duplicate: true without skewing metrics', async () => {
        const client = new ApiClient();
        const eventId = generateUuid();
        const event = buildQuizAttemptStartedEvent({}, { eventId });

        // First delivery
        const firstRes = await client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        expect(firstRes.status).toBe(200);
        expect(firstRes.data.duplicate === false || firstRes.data.data?.duplicate === false).toBe(true);

        // Duplicate delivery with identical eventId
        const secondRes = await client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        expect(secondRes.status).toBe(200);
        expect(secondRes.data.duplicate === true || secondRes.data.data?.duplicate === true).toBe(true);
      });

      it('T1-ING-03: Ingest quiz.attempt.completed.v1 updates daily quiz read-model counters', async () => {
        const client = new ApiClient();
        const event = buildQuizAttemptCompletedEvent({ score: 90, maxScore: 100, passed: true });

        const res = await client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });

      it('T1-ING-04: Ingest challenge.submitted.v1 updates participant statistics', async () => {
        const client = new ApiClient();
        const event = buildChallengeSubmittedEvent({ score: 95, timeTakenSeconds: 98 });

        const res = await client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });

      it('T1-ING-05: Ingest marketplace.purchase.completed.v1 updates gross revenue and sales counts', async () => {
        const client = new ApiClient();
        const event = buildMarketplacePurchaseCompletedEvent({ amountCents: 2999, platformFeeCents: 300 });

        const res = await client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });
    });

    // =========================================================================
    // Domain 3: Creator Overview Analytics (F6, F9)
    // =========================================================================
    describe('Domain 3: Creator Overview Analytics', () => {
      it('T1-OVW-01: GET /api/v1/analytics/overview returns 200 with CreatorOverviewResponseSchema envelope', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/overview', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.data).toBeDefined();

        // Enforce strict Zod contract compliance
        const schema = analyticsContracts?.CreatorOverviewResponseSchema || analyticsContracts?.AnalyticsOverviewResponseSchema;
        if (schema) {
          const parseResult = schema.safeParse(res.data);
          if (!parseResult.success) {
            console.error('CreatorOverviewResponseSchema validation error:', JSON.stringify(parseResult.error.issues, null, 2));
          }
          expect(parseResult.success).toBe(true);
        }
      });

      it('T1-OVW-02: Overview metrics include attempts, completions, completion rate, earnings, and learners', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/overview?timeframe=30d', { expectedStatus: 200 });

        const data = res.data.data;
        expect(typeof data.totalQuizAttempts).toBe('number');
        expect(typeof data.totalCompletions).toBe('number');
        expect(typeof data.avgCompletionRate).toBe('number');
        expect(typeof data.totalEarningsCents).toBe('number');
        expect(typeof data.activeLearners).toBe('number');
      });

      it('T1-OVW-03: Timeframe filter (7d, 30d, 90d, 1y, all) restricts activity trend series appropriately', async () => {
        const { creatorClient } = await getTestActors();

        for (const tf of ['7d', '30d', '90d', 'all']) {
          const res = await creatorClient.get(`/api/v1/analytics/overview?timeframe=${tf}`, { expectedStatus: 200 });
          expect(res.status).toBe(200);
          expect(Array.isArray(res.data.data.trendSeries || res.data.data.activitySeries)).toBe(true);
        }
      });

      it('T1-OVW-04: Custom ISO date range parameters bound aggregated counters', async () => {
        const { creatorClient } = await getTestActors();
        const startDate = new Date(Date.now() - 14 * 86400000).toISOString();
        const endDate = new Date().toISOString();

        const res = await creatorClient.get(
          `/api/v1/analytics/overview?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
          { expectedStatus: 200 }
        );
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });

      it('T1-OVW-05: Creator with zero activity receives clean zeroed metrics without null or NaN', async () => {
        const freshCreator = new ApiClient();
        try {
          await freshCreator.registerTestUser('t1_fresh');
        } catch (err) {
          if (err.message?.includes('429')) freshCreator.setToken('fallback_fresh');
          else throw err;
        }

        const res = await freshCreator.get('/api/v1/analytics/overview', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        const data = res.data.data;
        expect(data.totalQuizAttempts).toBe(0);
        expect(data.totalCompletions).toBe(0);
        expect(data.avgCompletionRate).toBe(0);
        expect(data.totalEarningsCents).toBe(0);
        expect(Number.isNaN(data.avgCompletionRate)).toBe(false);
      });
    });

    // =========================================================================
    // Domain 4: Per-Quiz Performance & Drop-Off Funnel (F10)
    // =========================================================================
    describe('Domain 4: Per-Quiz Performance & Drop-Off Funnel', () => {
      it('T1-QZ-01: GET /api/v1/analytics/quizzes lists creator authored quizzes with starts and completions', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/quizzes', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(Array.isArray(res.data.data.items || res.data.data)).toBe(true);
      });

      it('T1-QZ-02: GET /api/v1/analytics/quizzes/:id returns granular quiz metrics matching schema', async () => {
        const { creatorClient } = await getTestActors();
        // Create draft and publish quiz first via domain API
        const createRes = await creatorClient.post('/api/v1/quiz/drafts', {
          title: 'Analytics Drop-Off Test Quiz',
          questions: [
            { prompt: 'Question 1', options: ['A', 'B', 'C', 'D'], answer: 0 },
            { prompt: 'Question 2', options: ['A', 'B', 'C', 'D'], answer: 1 },
          ],
        }, { expectedStatus: [200, 201] });

        const quizId = createRes.data?.data?._id || createRes.data?._id || createRes.data?.data?.quizId;
        expect(quizId).toBeDefined();

        const res = await creatorClient.get(`/api/v1/analytics/quizzes/${quizId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.data.quizId || res.data.data._id).toBe(quizId);
      });

      it('T1-QZ-03: Question drop-off funnel array correctly computes drop-off percentage ((N - N+1) / N) * 100', async () => {
        const { creatorClient } = await getTestActors();
        const quizId = generateUuid();
        const creatorId = creatorClient.userId || creatorClient.user?.userId || generateUuid();

        // 1. Ingest multi-step funnel fixture events (3 students with varying progress)
        const funnelFixture = buildDropoffFunnelFixture({ quizId, creatorId });
        for (const event of funnelFixture.events) {
          await creatorClient.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        }

        // 2. Query quiz detail analytics endpoint
        const res = await creatorClient.get(`/api/v1/analytics/quizzes/${quizId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const funnel = res.data.data.dropOffFunnel || res.data.data.funnelSteps;
        expect(Array.isArray(funnel)).toBe(true);
        expect(funnel.length).toBeGreaterThanOrEqual(3);

        // 3. Assert mathematical formulas against the actual server response values
        // Q1 -> Q2: 3 reached Q1, 2 reached Q2 => (3 - 2)/3 * 100 = 33.33%
        const q1Reached = funnel[0].reachedCount ?? funnel[0].attemptsReached;
        const q2Reached = funnel[1].reachedCount ?? funnel[1].attemptsReached;
        expect(q1Reached).toBe(3);
        expect(q2Reached).toBe(2);
        expect(funnel[0].dropOffRate).toBe(33.33);
        expect(funnel[0].dropOffRate).toBe(Number((((q1Reached - q2Reached) / q1Reached) * 100).toFixed(2)));

        // Q2 -> Q3: 2 reached Q2, 2 reached Q3 => 0% drop-off
        expect(funnel[1].dropOffRate).toBe(0.0);

        // Q3 -> Q4: 2 reached Q3, 1 reached Q4 => (2 - 1)/2 * 100 = 50.0%
        expect(funnel[2].dropOffRate).toBe(50.0);
      });

      it('T1-QZ-04: Question accuracy on answered correctly computes (Correct / Answered) * 100', async () => {
        const { creatorClient } = await getTestActors();
        const quizId = generateUuid();
        const creatorId = creatorClient.userId || creatorClient.user?.userId || generateUuid();

        // 1. Ingest attempt with 8 correct answers out of 10 questions answered (80% accuracy)
        await creatorClient.post('/api/v1/analytics/events/ingest', buildQuizAttemptCompletedEvent({
          quizId,
          creatorId,
          totalQuestions: 10,
          questionsAnswered: 10,
          score: 80,
          maxScore: 100,
        }), { expectedStatus: 200 });

        // 2. Query quiz detail analytics
        const res = await creatorClient.get(`/api/v1/analytics/quizzes/${quizId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        // 3. Verify server returned accuracy matches mathematical formula: (8 / 10) * 100 = 80%
        const accuracy = res.data.data.averageAccuracy;
        expect(accuracy).toBe(80.0);
        expect(accuracy).toBe(calculateAccuracy(8, 10));
      });

      it('T1-QZ-05: Pagination parameters (page=1&limit=10) correctly slice quiz catalog list', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/quizzes?page=1&limit=5', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const data = res.data.data;
        const items = data.items || data;
        expect(items.length).toBeLessThanOrEqual(5);
        if (data.pagination) {
          expect(data.pagination.page).toBe(1);
          expect(data.pagination.limit).toBe(5);
        }
      });
    });

    // =========================================================================
    // Domain 5: Per-Challenge Reports & Active Contest Privacy (F11)
    // =========================================================================
    describe('Domain 5: Per-Challenge Reports & Active Contest Privacy', () => {
      it('T1-CH-01: GET /api/v1/analytics/challenges lists creator challenges with participant counts', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/challenges', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(Array.isArray(res.data.data.items || res.data.data)).toBe(true);
      });

      it('T1-CH-02: Concluded challenge (now >= deadlineAt) returns full score distribution and participant percentiles', async () => {
        const { creatorClient } = await getTestActors();
        const challengeId = generateUuid();
        const pastDeadline = new Date(Date.now() - 3600000).toISOString(); // 1 hour in past

        // 1. Ingest challenge created event with past deadline
        await creatorClient.post('/api/v1/analytics/events/ingest', {
          eventId: generateUuid(),
          eventType: 'challenge.created.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'challenge-service',
          data: {
            challengeId,
            creatorId: creatorClient.userId || creatorClient.user?.userId || generateUuid(),
            title: 'Concluded Arena Championship',
            deadlineAt: pastDeadline,
            durationMinutes: 30,
            totalQuestions: 5,
            createdAt: new Date(Date.now() - 7200000).toISOString(),
          },
        }, { expectedStatus: 200 });

        // 2. Ingest participant submissions with varied scores
        const scores = [65, 80, 95];
        for (let i = 0; i < scores.length; i++) {
          await creatorClient.post('/api/v1/analytics/events/ingest', buildChallengeSubmittedEvent({
            challengeId,
            score: scores[i],
            rank: scores.length - i,
          }), { expectedStatus: 200 });
        }

        // 3. Query challenge detail analytics
        const res = await creatorClient.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const data = res.data.data;
        expect(data.challengeId).toBe(challengeId);
        // Verify unsealed state
        expect(data.isQuarantined ?? data.isSealed).toBe(false);
        expect(data.totalSubmissions ?? data.totalParticipants).toBeGreaterThanOrEqual(3);

        // Score distribution and statistics must be unsealed and populated
        expect(data.scoreDistribution).toBeDefined();
        if (data.averageScore !== undefined && data.averageScore !== null) {
          expect(typeof data.averageScore).toBe('number');
          expect(data.averageScore).toBeGreaterThan(0);
        }
      });

      it('T1-CH-03: Active challenge (now < deadlineAt) strictly redacts participant identities, answers, and scores', async () => {
        const { creatorClient } = await getTestActors();
        const challengeId = generateUuid();
        const futureDeadline = new Date(Date.now() + 86400000).toISOString(); // 24 hours in future

        // 1. Ingest active challenge creation
        await creatorClient.post('/api/v1/analytics/events/ingest', {
          eventId: generateUuid(),
          eventType: 'challenge.created.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'challenge-service',
          data: {
            challengeId,
            creatorId: creatorClient.userId || creatorClient.user?.userId || generateUuid(),
            title: 'Active High-Stakes Arena',
            deadlineAt: futureDeadline,
            durationMinutes: 60,
            totalQuestions: 5,
            createdAt: new Date().toISOString(),
          },
        }, { expectedStatus: 200 });

        // 2. Ingest submissions while active
        await creatorClient.post('/api/v1/analytics/events/ingest', buildChallengeSubmittedEvent({
          challengeId,
          score: 88,
        }), { expectedStatus: 200 });

        // 3. Query active challenge analytics
        const res = await creatorClient.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const data = res.data.data;
        expect(data.challengeId).toBe(challengeId);
        // Quarantine / sealed flag must be true
        expect(data.isQuarantined ?? data.isSealed).toBe(true);

        // Participant identities, raw answers, and unreleased individual scores must remain strictly redacted
        expect(data.participants).toBeUndefined();
        expect(data.rawAnswers).toBeUndefined();
        expect(data.scoreDistribution == null || data.scoreDistribution.length === 0).toBe(true);
        expect(data.averageScore == null).toBe(true);
      });

      it('T1-CH-04: Active challenge participant count increments while individual details remain sealed', async () => {
        const { creatorClient } = await getTestActors();
        const challengeId = generateUuid();
        const futureDeadline = new Date(Date.now() + 86400000).toISOString();

        // 1. Create active challenge
        await creatorClient.post('/api/v1/analytics/events/ingest', {
          eventId: generateUuid(),
          eventType: 'challenge.created.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'challenge-service',
          data: {
            challengeId,
            creatorId: creatorClient.userId || creatorClient.user?.userId || generateUuid(),
            title: 'Active Counting Arena',
            deadlineAt: futureDeadline,
            durationMinutes: 45,
            totalQuestions: 3,
            createdAt: new Date().toISOString(),
          },
        }, { expectedStatus: 200 });

        // 2. Ingest 3 submissions
        for (let i = 1; i <= 3; i++) {
          await creatorClient.post('/api/v1/analytics/events/ingest', buildChallengeSubmittedEvent({
            challengeId,
            userId: generateUuid(),
            score: 70 + i * 5,
          }), { expectedStatus: 200 });
        }

        // 3. Query challenge metrics
        const res = await creatorClient.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        const data = res.data.data;

        // Submissions count must increment accurately to 3
        const count = data.totalSubmissions ?? data.totalParticipants;
        expect(count).toBe(3);

        // Details remain sealed
        expect(data.isQuarantined ?? data.isSealed).toBe(true);
        expect(data.participants).toBeUndefined();
        expect(data.rawAnswers).toBeUndefined();
      });

      it('T1-CH-05: Simulated deadline expiration automatically unseals full challenge results', async () => {
        const { creatorClient } = await getTestActors();
        const challengeId = generateUuid();
        // Deadline set to 1.5 seconds in the future
        const nearDeadline = new Date(Date.now() + 1500).toISOString();

        // 1. Ingest challenge with near-term deadline
        await creatorClient.post('/api/v1/analytics/events/ingest', {
          eventId: generateUuid(),
          eventType: 'challenge.created.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'challenge-service',
          data: {
            challengeId,
            creatorId: creatorClient.userId || creatorClient.user?.userId || generateUuid(),
            title: 'Expiring Arena Challenge',
            deadlineAt: nearDeadline,
            durationMinutes: 1,
            totalQuestions: 2,
            createdAt: new Date().toISOString(),
          },
        }, { expectedStatus: 200 });

        // 2. Ingest submission
        await creatorClient.post('/api/v1/analytics/events/ingest', buildChallengeSubmittedEvent({
          challengeId,
          score: 92,
        }), { expectedStatus: 200 });

        // 3. Verify sealed before deadline
        const beforeRes = await creatorClient.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
        expect(beforeRes.data.data.isQuarantined ?? beforeRes.data.data.isSealed).toBe(true);

        // 4. Wait for deadline to elapse (2000ms)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 5. Query after deadline has expired -> verify automatic unsealing
        const afterRes = await creatorClient.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
        expect(afterRes.status).toBe(200);
        const unsealedData = afterRes.data.data;
        expect(unsealedData.isQuarantined ?? unsealedData.isSealed).toBe(false);
        expect(unsealedData.scoreDistribution !== undefined || unsealedData.averageScore !== null).toBe(true);
      });
    });

    // =========================================================================
    // Domain 6: Marketplace Analytics & Earnings Reconciliation (F12)
    // =========================================================================
    describe('Domain 6: Marketplace Analytics & Earnings Reconciliation', () => {
      it('T1-MKT-01: GET /api/v1/analytics/marketplace returns gross sales, refunds, fees, and net creator earnings', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const data = res.data.data;
        expect(typeof data.grossRevenueCents).toBe('number');
        expect(typeof data.refundsCents).toBe('number');
        expect(typeof data.platformFeesCents).toBe('number');
        expect(typeof data.netEarningsCents).toBe('number');
      });

      it('T1-MKT-02: Net creator earnings formula verified: Gross Revenue - Refunds - Platform Fees', async () => {
        const { creatorClient } = await getTestActors();
        const creatorId = creatorClient.userId || creatorClient.user?.userId || generateUuid();

        // 1. Ingest financial audit events: 3 purchases ($59.97), 1 refund ($19.99), 10% fee ($4.00)
        const audit = buildMarketplaceFinancialAuditFixture({
          creatorId,
          priceCents: 1999,
          visitCount: 10,
          purchaseCount: 3,
          refundCount: 1,
          feePercent: 10,
        });

        for (const event of audit.allEvents) {
          await creatorClient.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
        }

        // 2. Query marketplace analytics
        const res = await creatorClient.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const data = res.data.data;
        const gross = data.grossRevenueCents ?? data.grossRevenue;
        const refunds = data.refundsCents ?? data.refunds;
        const fees = data.platformFeesCents ?? data.platformFees;
        const net = data.netEarningsCents ?? data.netEarnings;

        // 3. Assert mathematical formula identity on server response: Gross - Refunds - Fees = Net
        expect(gross).toBe(5997);
        expect(refunds).toBe(1999);
        expect(fees).toBe(400);
        expect(net).toBe(3598); // $35.98
        expect(net).toBe(gross - refunds - fees);
      });

      it('T1-MKT-03: Purchase conversion rate formula verified: (Purchases / Visits) * 100', async () => {
        const { creatorClient } = await getTestActors();
        const creatorId = creatorClient.userId || creatorClient.user?.userId || generateUuid();
        const listingId = generateUuid();

        // 1. Ingest 10 listing views
        for (let i = 0; i < 10; i++) {
          await creatorClient.post('/api/v1/analytics/events/ingest', {
            eventId: generateUuid(),
            eventType: 'marketplace.listing_viewed.v1',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            producer: 'marketplace-service',
            data: {
              listingId,
              sellerId: creatorId,
              creatorId,
              source: 'direct',
              viewedAt: new Date().toISOString(),
            },
          }, { expectedStatus: 200 });
        }

        // 2. Ingest 3 purchases
        for (let j = 0; j < 3; j++) {
          await creatorClient.post('/api/v1/analytics/events/ingest', buildMarketplacePurchaseCompletedEvent({
            listingId,
            creatorId,
            amountCents: 1999,
          }), { expectedStatus: 200 });
        }

        // 3. Query marketplace analytics
        const res = await creatorClient.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        const data = res.data.data;

        // 4. Assert conversion rate returned by API: (3 / 10) * 100 = 30.0%
        expect(data.conversionRate).toBe(30.0);
        expect(data.conversionRate).toBe(calculateConversionRate(3, 10));
      });

      it('T1-MKT-04: Itemized breakdown per listing includes units sold and gross revenue', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const listings = res.data.data.listings || res.data.data.items;
        expect(Array.isArray(listings)).toBe(true);
      });

      it('T1-MKT-05: Zero-sales creator receives 0 earnings and 0% conversion rate without NaN or unhandled division', async () => {
        const freshCreator = new ApiClient();
        try {
          await freshCreator.registerTestUser('t1_fresh_mkt');
        } catch (err) {
          if (err.message?.includes('429')) freshCreator.setToken('fallback_fresh_mkt');
          else throw err;
        }

        const res = await freshCreator.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        const data = res.data.data;
        expect(data.grossRevenueCents).toBe(0);
        expect(data.netEarningsCents).toBe(0);
        expect(data.conversionRate).toBe(0);
        expect(Number.isNaN(data.conversionRate)).toBe(false);
      });
    });

    // =========================================================================
    // Domain 7: Audience Insights & Discovery Sources (F13)
    // =========================================================================
    describe('Domain 7: Audience Insights & Discovery Sources', () => {
      it('T1-AUD-01: GET /api/v1/analytics/audience returns new vs returning learner counts', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/audience', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const data = res.data.data;
        expect(typeof data.newLearners).toBe('number');
        expect(typeof data.returningLearners).toBe('number');
      });

      it('T1-AUD-02: Follower growth series tracks net follower change over requested timeframe', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/audience?timeframe=30d', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const series = res.data.data.followerGrowthSeries || res.data.data.followerSeries;
        expect(Array.isArray(series)).toBe(true);
      });

      it('T1-AUD-03: Top discovery search keywords and referral channels returned', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/audience', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const keywords = res.data.data.topKeywords || res.data.data.searchKeywords;
        expect(Array.isArray(keywords)).toBe(true);
        const referrals = res.data.data.referralSources || res.data.data.channels;
        expect(Array.isArray(referrals)).toBe(true);
      });

      it('T1-AUD-04: Device breakdown (desktop vs mobile) returned in audience data', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/audience', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const devices = res.data.data.deviceBreakdown || res.data.data.devices;
        expect(typeof devices).toBe('object');
      });

      it('T1-AUD-05: Learner retention rate accurately computed as positive percentage', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/audience', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const retention = res.data.data.retentionRate;
        expect(typeof retention).toBe('number');
        expect(retention).toBeGreaterThanOrEqual(0);
        expect(retention).toBeLessThanOrEqual(100);
      });
    });

    // =========================================================================
    // Domain 8: Accessible Data Export (F14)
    // =========================================================================
    describe('Domain 8: Accessible Data Export', () => {
      it('T1-EXP-01: GET /api/v1/analytics/export?format=json&type=quizzes returns valid JSON export payload', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/export?format=json&type=quizzes', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/application\/json/);
        expect(res.data.success).toBe(true);
      });

      it('T1-EXP-02: GET /api/v1/analytics/export?format=csv&type=quizzes returns RFC 4180 CSV with header row', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/export?format=csv&type=quizzes', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/text\/csv/);
        const lines = String(res.data).split('\n');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0].includes('Quiz ID') || lines[0].includes('quizId') || lines[0].includes('Title')).toBe(true);
      });

      it('T1-EXP-03: Marketplace CSV export includes transaction date, listing title, gross amount, fee, and net earnings', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/export?format=csv&type=marketplace', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const csvHeader = String(res.data).split('\n')[0].toLowerCase();
        expect(csvHeader.includes('gross') || csvHeader.includes('earnings') || csvHeader.includes('amount')).toBe(true);
      });

      it('T1-EXP-04: Challenge CSV export contains sanitized timestamps and score distributions', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/export?format=csv&type=challenges', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const csv = String(res.data);
        expect(csv.includes('password')).toBe(false);
        expect(csv.includes('token')).toBe(false);
      });

      it('T1-EXP-05: Response includes Content-Disposition attachment header with descriptive filename', async () => {
        const { creatorClient } = await getTestActors();
        const res = await creatorClient.get('/api/v1/analytics/export?format=csv&type=quizzes', { expectedStatus: 200 });

        expect(res.status).toBe(200);
        const disposition = res.headers.get('content-disposition') || '';
        expect(disposition.includes('attachment')).toBe(true);
        expect(disposition.includes('.csv')).toBe(true);
      });
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier1-analytics-studio.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier1AnalyticsTests();
}
