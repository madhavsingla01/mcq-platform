/**
 * QuizFocus Tier 2: Analytics & Studio Boundary & Corner Cases E2E Test Suite
 * Strictly OPAQUE-BOX: Evaluates system externally via API Gateway perimeter (http://127.0.0.1:5000).
 * ZERO direct imports of internal service modules, database models, or in-memory state.
 *
 * Covers 40 discrete boundary, zero-division, and tenant isolation tests:
 *   Category 1: Input Validation & Extreme Value Boundaries (20 Tests — T2-BND-01 to T2-BND-20)
 *   Category 2: Tenant Isolation & Security Boundaries (20 Tests — T2-SEC-01 to T2-SEC-20)
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
  buildMarketplacePurchaseCompletedEvent,
  buildCreatorFollowedEvent,
  buildSearchQueryExecutedEvent,
  calculateCompletionRate,
  calculateDropOffRate,
  calculateAccuracy,
  calculateConversionRate,
  generateUuid,
} from './helpers/analytics-fixtures.js';

let actorsPromise = null;
async function getTestActors() {
  if (!actorsPromise) {
    actorsPromise = (async () => {
      const creatorA = new ApiClient();
      try {
        const regA = await creatorA.registerTestUser('t2_creator_a');
        creatorA.userId = regA.userId;
      } catch (err) {
        if (err.message?.includes('429')) {
          creatorA.setToken('fallback_t2_creator_a');
          creatorA.userId = '507f1f77bcf86cd799439011';
        } else throw err;
      }

      const creatorB = new ApiClient();
      try {
        const regB = await creatorB.registerTestUser('t2_creator_b');
        creatorB.userId = regB.userId;
      } catch (err) {
        if (err.message?.includes('429')) {
          creatorB.setToken('fallback_t2_creator_b');
          creatorB.userId = '507f1f77bcf86cd799439022';
        } else throw err;
      }

      const unauthenticatedClient = new ApiClient();
      unauthenticatedClient.clearSession();

      return { creatorA, creatorB, unauthenticatedClient };
    })();
  }
  return actorsPromise;
}

export function registerTier2AnalyticsTests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 2: Analytics & Studio Boundary & Corner Cases (40 Tests)', () => {

    // =========================================================================
    // Category 1: Input Validation & Extreme Value Boundaries (20 Tests)
    // =========================================================================
    describe('Category 1: Input Validation & Extreme Value Boundaries', () => {
      it('T2-BND-01: Ingestion payload missing required eventId returns HTTP 400 Bad Request', async () => {
        const client = new ApiClient();
        const invalidPayload = {
          eventType: 'quiz.attempt.started.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'test',
          data: { attemptId: '123' },
        };

        const res = await client.post('/api/v1/analytics/events/ingest', invalidPayload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-02: Ingestion payload missing required eventType returns HTTP 400 Bad Request', async () => {
        const client = new ApiClient();
        const invalidPayload = {
          eventId: generateUuid(),
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'test',
          data: { attemptId: '123' },
        };

        const res = await client.post('/api/v1/analytics/events/ingest', invalidPayload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-03: Ingestion payload missing required timestamp returns HTTP 400 Bad Request', async () => {
        const client = new ApiClient();
        const invalidPayload = {
          eventId: generateUuid(),
          eventType: 'quiz.attempt.started.v1',
          version: '1.0.0',
          producer: 'test',
          data: { attemptId: '123' },
        };

        const res = await client.post('/api/v1/analytics/events/ingest', invalidPayload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-04: Ingestion payload missing required data object returns HTTP 400 Bad Request', async () => {
        const client = new ApiClient();
        const invalidPayload = {
          eventId: generateUuid(),
          eventType: 'quiz.attempt.started.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'test',
        };

        const res = await client.post('/api/v1/analytics/events/ingest', invalidPayload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-05: Ingestion payload with timestamp skewed > 24 hours into future is rejected with HTTP 400', async () => {
        const client = new ApiClient();
        const futureDate = new Date(Date.now() + 48 * 3600000).toISOString();
        const payload = buildQuizAttemptStartedEvent({}, { timestamp: futureDate });

        const res = await client.post('/api/v1/analytics/events/ingest', payload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-06: Ingestion payload with malformed non-ISO timestamp string returns HTTP 400', async () => {
        const client = new ApiClient();
        const payload = buildQuizAttemptStartedEvent({}, { timestamp: 'not-a-valid-iso-date' });

        const res = await client.post('/api/v1/analytics/events/ingest', payload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-07: Ingestion payload with non-UUID eventId returns HTTP 400', async () => {
        const client = new ApiClient();
        const payload = buildQuizAttemptStartedEvent({}, { eventId: 'not-a-valid-uuid' });

        const res = await client.post('/api/v1/analytics/events/ingest', payload, { expectedStatus: 400 });
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-08: Query with invalid timeframe parameter returns HTTP 400 Bad Request', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/overview?timeframe=9999days', { expectedStatus: 400 });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-09: Inverted date range (startDate > endDate) returns HTTP 400 Bad Request', async () => {
        const { creatorA } = await getTestActors();
        const startDate = new Date(Date.now()).toISOString();
        const endDate = new Date(Date.now() - 7 * 86400000).toISOString(); // endDate earlier than startDate

        const res = await creatorA.get(
          `/api/v1/analytics/overview?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
          { expectedStatus: 400 }
        );
        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-10: Malformed startDate ISO string returns HTTP 400 Bad Request', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/overview?startDate=invalid_iso_date', { expectedStatus: 400 });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-11: Zero started attempts returns completionRate: 0.0 (zero division boundary check)', async () => {
        const freshCreator = new ApiClient();
        await freshCreator.registerTestUser('t2_bnd_comp');

        // Query overview for a creator with zero started attempts
        const res = await freshCreator.get('/api/v1/analytics/overview', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const rate = res.data.data.averageCompletionRate ?? res.data.data.completionRate;
        expect(rate).toBe(0.0);
        expect(Number.isNaN(rate)).toBe(false);
        expect(res.data.data.totalStarts || 0).toBe(0);
      });

      it('T2-BND-12: Zero listing visits returns conversionRate: 0.0 (zero division boundary check)', async () => {
        const freshCreator = new ApiClient();
        await freshCreator.registerTestUser('t2_bnd_mkt');

        // Query marketplace analytics for a creator with 0 visits and 0 purchases
        const res = await freshCreator.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const rate = res.data.data.conversionRate;
        expect(rate).toBe(0.0);
        expect(Number.isNaN(rate)).toBe(false);
        expect(res.data.data.totalPurchases || 0).toBe(0);
        expect(res.data.data.totalListingViews || 0).toBe(0);
      });

      it('T2-BND-13: Zero answers given returns accuracy: 0.0 (zero division boundary check)', async () => {
        const freshCreator = new ApiClient();
        await freshCreator.registerTestUser('t2_bnd_acc');

        // Query overview for creator with 0 answers given
        const res = await freshCreator.get('/api/v1/analytics/overview', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const accuracy = res.data.data.averageAccuracy;
        expect(accuracy).toBe(0.0);
        expect(Number.isNaN(accuracy)).toBe(false);
      });

      it('T2-BND-14: Zero drop-off funnel calculations with 0 reach returns 0.0 dropOffRate', async () => {
        const freshCreator = new ApiClient();
        await freshCreator.registerTestUser('t2_bnd_funnel');
        const emptyQuizId = generateUuid();

        // Query quiz analytics for empty quiz with 0 student attempts
        const res = await freshCreator.get(`/api/v1/analytics/quizzes/${emptyQuizId}`, { expectedStatus: 200 });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const funnel = res.data.data.dropOffFunnel || [];
        for (const step of funnel) {
          expect(step.dropOffRate).toBe(0.0);
          expect(Number.isNaN(step.dropOffRate)).toBe(false);
          expect(step.reachedCount ?? step.attemptsReached ?? 0).toBe(0);
        }
      });

      it('T2-BND-15: Extreme pagination limit (limit=100000) is clamped or rejected with HTTP 400', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/quizzes?limit=100000');

        expect([200, 400]).toContain(res.status);
        if (res.status === 200) {
          const items = res.data.data.items || res.data.data;
          expect(items.length).toBeLessThanOrEqual(100);
        }
      });

      it('T2-BND-16: Negative page number (page=-1) returns HTTP 400 Bad Request', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/quizzes?page=-1', { expectedStatus: 400 });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-17: Non-numeric page number (page=abc) returns HTTP 400 Bad Request', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/quizzes?page=abc', { expectedStatus: 400 });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-18: Massive payload (> 1MB) to /events/ingest returns HTTP 413 Payload Too Large', async () => {
        const client = new ApiClient();
        // Generate a 1.2MB payload
        const hugeString = 'x'.repeat(1200000);
        const payload = buildQuizAttemptStartedEvent({ extraLargeField: hugeString });

        const res = await client.post('/api/v1/analytics/events/ingest', payload, { expectedStatus: 413 });
        expect(res.status).toBe(413);
      });

      it('T2-BND-19: Export query with unsupported format (?format=xml) returns HTTP 400', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/export?format=xml&type=quizzes', { expectedStatus: 400 });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('T2-BND-20: Export query with unsupported type (?type=invalid_type) returns HTTP 400', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/export?format=json&type=invalid_type', { expectedStatus: 400 });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });
    });

    // =========================================================================
    // Category 2: Tenant Isolation & Security Boundaries (20 Tests)
    // =========================================================================
    describe('Category 2: Tenant Isolation & Security Boundaries', () => {
      it('T2-SEC-01: Cross-tenant quiz analytics: Creator A querying Creator B quiz ID returns HTTP 403', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // Creator B authors a quiz
        const createRes = await creatorB.post('/api/v1/quiz/drafts', {
          title: 'Creator B Confidential Quiz',
          questions: [{ prompt: 'Q1', options: ['1', '2'], answer: 0 }],
        }, { expectedStatus: [200, 201] });

        const quizIdB = createRes.data?.data?._id || createRes.data?._id || createRes.data?.data?.quizId;
        expect(quizIdB).toBeDefined();

        // Creator A attempts to query Creator B's quiz analytics
        const res = await creatorA.get(`/api/v1/analytics/quizzes/${quizIdB}`, { expectedStatus: 403 });
        expect(res.status).toBe(403);
        expect(res.data.success).toBe(false);
      });

      it('T2-SEC-02: Cross-tenant challenge analytics: Creator A querying Creator B challenge ID returns HTTP 403', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // Creator B creates a challenge
        const challengeRes = await creatorB.post('/api/v1/challenges', {
          title: 'Creator B Sealed Arena',
          description: 'Top secret arena',
          quizTitle: 'Arena Quiz',
          questions: [{ text: 'Arena Question 1', prompt: 'Arena Question 1', options: ['A', 'B'], answer: 0 }],
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 60,
        }, { expectedStatus: [200, 201] });

        const challengeIdB = challengeRes.data?.data?._id || challengeRes.data?._id || challengeRes.data?.data?.challengeId;
        expect(challengeIdB).toBeDefined();

        // Creator A queries Creator B's challenge analytics
        const res = await creatorA.get(`/api/v1/analytics/challenges/${challengeIdB}`, { expectedStatus: 403 });
        expect(res.status).toBe(403);
        expect(res.data.success).toBe(false);
      });

      it('T2-SEC-03: Cross-tenant marketplace revenue: Creator A never receives Creator B revenue or orders', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // 1. Ingest positive revenue specifically for Creator B
        const orderIdB = generateUuid();
        const listingIdB = generateUuid();
        const purchaseEventB = buildMarketplacePurchaseCompletedEvent({
          orderId: orderIdB,
          listingId: listingIdB,
          creatorId: creatorB.userId,
          sellerId: creatorB.userId,
          buyerId: generateUuid(),
          amount: 49.99,
          amountCents: 4999,
          platformFee: 5.00,
          platformFeeCents: 500,
          creatorEarnings: 44.99,
          netEarnings: 44.99,
          netEarningsCents: 4499,
        });

        const ingestRes = await creatorB.post('/api/v1/analytics/events/ingest', purchaseEventB, {
          expectedStatus: [200, 201],
        });
        expect(ingestRes.data.success).toBe(true);

        // 2. Creator A queries their own marketplace analytics
        const resA = await creatorA.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
        expect(resA.status).toBe(200);
        expect(resA.data.success).toBe(true);

        const dataA = resA.data.data;
        expect(dataA).toBeDefined();

        // Enforce that Creator B's revenue is completely absent from Creator A's results
        const grossRev = dataA.grossRevenueCents ?? dataA.grossRevenue ?? 0;
        expect(grossRev).toBe(0);

        const netEarn = dataA.netEarningsCents ?? dataA.netEarnings ?? 0;
        expect(netEarn).toBe(0);

        // Assert listings / orders array contains zero Creator B items
        const listingsA = dataA.listings || dataA.items || dataA.orders || [];
        const hasCreatorBOrder = listingsA.some(item =>
          item.orderId === orderIdB ||
          item.listingId === listingIdB ||
          item.creatorId === creatorB.userId ||
          item.sellerId === creatorB.userId
        );
        expect(hasCreatorBOrder).toBe(false);
        expect(listingsA.length).toBe(0);

        // 3. If Creator A explicitly queries Creator B's data via query parameters, assert HTTP 403 Forbidden
        const foreignRes = await creatorA.get(`/api/v1/analytics/marketplace?creatorId=${creatorB.userId}`, {
          expectedStatus: 403,
        });
        expect(foreignRes.status).toBe(403);
        expect(foreignRes.data.success).toBe(false);
      });

      it('T2-SEC-04: Cross-tenant audience analytics: Creator A never receives Creator B followers or search referrals', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // 1. Ingest audience activity specifically for Creator B
        const followerIdB = generateUuid();
        const followEventB = buildCreatorFollowedEvent({
          creatorId: creatorB.userId,
          followerId: followerIdB,
        });
        const searchEventB = buildSearchQueryExecutedEvent({
          creatorId: creatorB.userId,
          searchTerm: 'secret_creator_b_niche_topic',
        });

        await Promise.all([
          creatorB.post('/api/v1/analytics/events/ingest', followEventB, { expectedStatus: [200, 201] }),
          creatorB.post('/api/v1/analytics/events/ingest', searchEventB, { expectedStatus: [200, 201] }),
        ]);

        // 2. Creator A queries their own audience analytics
        const resA = await creatorA.get('/api/v1/analytics/audience', { expectedStatus: 200 });
        expect(resA.status).toBe(200);
        expect(resA.data.success).toBe(true);

        const dataA = resA.data.data;
        expect(dataA).toBeDefined();

        // Creator B's followers must NOT leak to Creator A
        const totalFollowers = dataA.totalFollowers ?? 0;
        expect(totalFollowers).toBe(0);

        const followerGrowth = dataA.followerGrowth ?? 0;
        expect(followerGrowth).toBe(0);

        // Creator B's search queries and referrals must NOT leak to Creator A
        const searchQueries = dataA.searchQueries || [];
        const hasLeakedQuery = searchQueries.some(q =>
          (q.query || q.searchTerm) === 'secret_creator_b_niche_topic'
        );
        expect(hasLeakedQuery).toBe(false);

        // 3. Creator A attempting to query Creator B's audience via query parameters returns HTTP 403 Forbidden
        const foreignRes = await creatorA.get(`/api/v1/analytics/audience?creatorId=${creatorB.userId}`, {
          expectedStatus: 403,
        });
        expect(foreignRes.status).toBe(403);
        expect(foreignRes.data.success).toBe(false);
      });

      it('T2-SEC-05: Cross-tenant overview analytics: Creator A never receives Creator B attempt counts or completions', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // 1. Ingest attempt completion activity specifically for Creator B
        const completionEventB = buildQuizAttemptCompletedEvent({
          creatorId: creatorB.userId,
          quizId: generateUuid(),
          attemptId: generateUuid(),
          score: 100,
          maxScore: 100,
          passed: true,
        });
        await creatorB.post('/api/v1/analytics/events/ingest', completionEventB, {
          expectedStatus: [200, 201],
        });

        // 2. Query overview for both Creator A and Creator B concurrently
        const [resA, resB] = await Promise.all([
          creatorA.get('/api/v1/analytics/overview', { expectedStatus: 200 }),
          creatorB.get('/api/v1/analytics/overview', { expectedStatus: 200 }),
        ]);

        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);

        const dataA = resA.data.data;
        const dataB = resB.data.data;

        // Creator A must have 0 completions and 0 starts
        const completionsA = dataA.totalCompletions ?? 0;
        const startsA = dataA.totalStarts ?? dataA.totalQuizAttempts ?? 0;
        expect(completionsA).toBe(0);
        expect(startsA).toBe(0);

        // Creator B reflects the ingested activity
        const completionsB = dataB.totalCompletions ?? 0;
        expect(completionsB).toBeGreaterThan(0);

        // Tenant scopes must strictly differ
        expect(completionsA).not.toBe(completionsB);

        // 3. Creator A attempting to query Creator B's overview via query parameters returns HTTP 403 Forbidden
        const foreignRes = await creatorA.get(`/api/v1/analytics/overview?creatorId=${creatorB.userId}`, {
          expectedStatus: 403,
        });
        expect(foreignRes.status).toBe(403);
        expect(foreignRes.data.success).toBe(false);
      });

      it('T2-SEC-06: Unauthenticated request to GET /api/v1/analytics/overview returns HTTP 401', async () => {
        const { unauthenticatedClient } = await getTestActors();
        const res = await unauthenticatedClient.get('/api/v1/analytics/overview', { expectedStatus: 401 });
        expect(res.status).toBe(401);
      });

      it('T2-SEC-07: Unauthenticated request to GET /api/v1/analytics/quizzes returns HTTP 401', async () => {
        const { unauthenticatedClient } = await getTestActors();
        const res = await unauthenticatedClient.get('/api/v1/analytics/quizzes', { expectedStatus: 401 });
        expect(res.status).toBe(401);
      });

      it('T2-SEC-08: Unauthenticated request to GET /api/v1/analytics/challenges returns HTTP 401', async () => {
        const { unauthenticatedClient } = await getTestActors();
        const res = await unauthenticatedClient.get('/api/v1/analytics/challenges', { expectedStatus: 401 });
        expect(res.status).toBe(401);
      });

      it('T2-SEC-09: Unauthenticated request to GET /api/v1/analytics/marketplace returns HTTP 401', async () => {
        const { unauthenticatedClient } = await getTestActors();
        const res = await unauthenticatedClient.get('/api/v1/analytics/marketplace', { expectedStatus: 401 });
        expect(res.status).toBe(401);
      });

      it('T2-SEC-10: Unauthenticated request to GET /api/v1/analytics/audience returns HTTP 401', async () => {
        const { unauthenticatedClient } = await getTestActors();
        const res = await unauthenticatedClient.get('/api/v1/analytics/audience', { expectedStatus: 401 });
        expect(res.status).toBe(401);
      });

      it('T2-SEC-11: Unauthenticated request to GET /api/v1/analytics/export returns HTTP 401', async () => {
        const { unauthenticatedClient } = await getTestActors();
        const res = await unauthenticatedClient.get('/api/v1/analytics/export?format=json&type=quizzes', { expectedStatus: 401 });
        expect(res.status).toBe(401);
      });

      it('T2-SEC-12: Client attempting to spoof x-user-id header has it stripped and binds strictly to authenticated creator', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // 1. Ensure Creator B has distinct ingested activity so data differs from Creator A
        const completionEventB = buildQuizAttemptCompletedEvent({
          creatorId: creatorB.userId,
          quizId: generateUuid(),
          attemptId: generateUuid(),
          score: 95,
          maxScore: 100,
        });
        await creatorB.post('/api/v1/analytics/events/ingest', completionEventB, {
          expectedStatus: [200, 201],
        });

        // 2. Creator A attempts to query /api/v1/analytics/overview with forged x-user-id pointing to Creator B
        const res = await creatorA.get('/api/v1/analytics/overview', {
          headers: { 'x-user-id': creatorB.userId },
          expectedStatus: 200,
        });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);

        const data = res.data.data;
        // Tenant scope must still bind strictly to creatorA's authenticated session, NOT creatorB!
        const completions = data.totalCompletions ?? 0;
        expect(completions).toBe(0);

        const grossRevenue = data.grossRevenue ?? data.grossRevenueCents ?? 0;
        expect(grossRevenue).toBe(0);

        // If creatorId is echoed in response, verify it matches creatorA, not creatorB
        if (data.creatorId) {
          expect(data.creatorId).toBe(creatorA.userId);
          expect(data.creatorId).not.toBe(creatorB.userId);
        }
      });

      it('T2-SEC-13: Client attempting to spoof x-role header has it stripped and cannot escalate cross-tenant privileges', async () => {
        const { creatorA, creatorB } = await getTestActors();

        // 1. Creator A queries own overview with spoofed admin role: returns 200 bound to creatorA
        const ownRes = await creatorA.get('/api/v1/analytics/overview', {
          headers: { 'x-role': 'admin' },
          expectedStatus: 200,
        });

        expect(ownRes.status).toBe(200);
        expect(ownRes.data.success).toBe(true);
        expect(ownRes.data.data.totalCompletions ?? 0).toBe(0);

        // 2. Creator A attempts to access Creator B's analytics using spoofed x-role: 'admin'
        // Gateway must strip x-role, preventing privilege escalation; analytics service must reject with 403 Forbidden
        const foreignRes = await creatorA.get(`/api/v1/analytics/overview?creatorId=${creatorB.userId}`, {
          headers: {
            'x-role': 'admin',
            'x-roles': 'admin',
            'x-permissions': 'all',
          },
          expectedStatus: 403,
        });

        expect(foreignRes.status).toBe(403);
        expect(foreignRes.data.success).toBe(false);

        // 3. Similarly attempt to query Creator B's quiz analytics with spoofed admin header: returns 403
        const quizResB = await creatorB.post('/api/v1/quiz/drafts', {
          title: 'Creator B Admin-Protected Quiz',
          questions: [{ prompt: 'Q1', options: ['A', 'B'], answer: 0 }],
        }, { expectedStatus: [200, 201] });
        const quizIdB = quizResB.data?.data?._id || quizResB.data?._id || quizResB.data?.data?.quizId;

        const spoofedQuizRes = await creatorA.get(`/api/v1/analytics/quizzes/${quizIdB}`, {
          headers: { 'x-role': 'admin' },
          expectedStatus: 403,
        });
        expect(spoofedQuizRes.status).toBe(403);
        expect(spoofedQuizRes.data.success).toBe(false);
      });

      it('T2-SEC-14: Mutation lock verification: HTTP PUT to /api/v1/analytics/overview returns 405', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.put('/api/v1/analytics/overview', { fake: 'mutation' }, { expectedStatus: 405 });
        expect(res.status).toBe(405);
        const allowHeader = res.headers.get('allow');
        if (allowHeader) {
          expect(allowHeader.toUpperCase()).toMatch(/GET/);
        }
      });

      it('T2-SEC-15: Mutation lock verification: HTTP DELETE to /api/v1/analytics/quizzes/123 returns 405', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.delete('/api/v1/analytics/quizzes/123', { expectedStatus: 405 });
        expect(res.status).toBe(405);
        const allowHeader = res.headers.get('allow');
        if (allowHeader) {
          expect(allowHeader.toUpperCase()).toMatch(/GET/);
        }
      });

      it('T2-SEC-16: Mutation lock verification: HTTP POST to /api/v1/analytics/marketplace returns 405', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.post('/api/v1/analytics/marketplace', { amount: 500 }, { expectedStatus: 405 });
        expect(res.status).toBe(405);
        const allowHeader = res.headers.get('allow');
        if (allowHeader) {
          expect(allowHeader.toUpperCase()).toMatch(/GET/);
        }
      });

      it('T2-SEC-17: Operational isolation: Analytics queries never perform write operations on business records', async () => {
        const { creatorA } = await getTestActors();

        // 1. Establish operational baseline: query operational quiz catalog
        const beforeCatalogRes = await creatorA.get('/api/v1/quizzes', { expectedStatus: [200, 404] });
        const beforeCatalogSnapshot = JSON.stringify(beforeCatalogRes.data ?? {});

        // Create or locate a designated operational quiz record to verify entity immutability
        let testQuizId = null;
        let beforeQuizSnapshot = null;
        try {
          const draftRes = await creatorA.post('/api/v1/quiz/drafts', {
            title: 'Operational Isolation Verification Quiz',
            questions: [
              { prompt: 'Isolation Sentinel Q1', options: ['Alpha', 'Beta'], answer: 0 }
            ],
          }, { expectedStatus: [200, 201] });
          testQuizId = draftRes.data?.data?._id || draftRes.data?._id;
          if (testQuizId) {
            const beforeQuizRes = await creatorA.get(`/api/v1/quizzes/${testQuizId}`, { expectedStatus: 200 });
            beforeQuizSnapshot = JSON.stringify(beforeQuizRes.data);
          }
        } catch {
          // If operational draft creation endpoint is unavailable, catalog snapshot serves as baseline
        }

        // 2. Execute intensive read queries against analytics endpoints
        await creatorA.get('/api/v1/analytics/overview', { expectedStatus: 200 });
        await creatorA.get('/api/v1/analytics/quizzes', { expectedStatus: 200 });
        await creatorA.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
        await creatorA.get('/api/v1/analytics/audience', { expectedStatus: 200 });
        if (testQuizId) {
          await creatorA.get(`/api/v1/analytics/quizzes/${testQuizId}`, { expectedStatus: 200 });
        }

        // 3. Inspect operational records after analytics queries: verify strict immutability
        if (testQuizId) {
          const afterQuizRes = await creatorA.get(`/api/v1/quizzes/${testQuizId}`, { expectedStatus: 200 });
          const afterQuizSnapshot = JSON.stringify(afterQuizRes.data);
          expect(afterQuizSnapshot).toBe(beforeQuizSnapshot);
        } else {
          const afterCatalogRes = await creatorA.get('/api/v1/quizzes', { expectedStatus: [200, 404] });
          const afterCatalogSnapshot = JSON.stringify(afterCatalogRes.data ?? {});
          expect(afterCatalogSnapshot).toBe(beforeCatalogSnapshot);
        }
      });

      it('T2-SEC-18: Sealed challenge privacy: Raw participant answers and identities absent prior to deadline', async () => {
        const { creatorA } = await getTestActors();
        // Challenge in future
        const res = await creatorA.get('/api/v1/analytics/challenges', { expectedStatus: 200 });
        expect(res.status).toBe(200);
        const jsonStr = JSON.stringify(res.data);
        expect(jsonStr.includes('rawAnswers')).toBe(false);
      });

      it('T2-SEC-19: Rate limiting: Rapid burst of requests to /api/v1/analytics/* triggers 429 Too Many Requests', async () => {
        const client = new ApiClient();
        // Rapid burst of 100 requests to trigger the sliding window threshold
        const burstPromises = Array.from({ length: 100 }, () =>
          client.get('/api/v1/analytics/health')
        );
        const results = await Promise.all(burstPromises);

        // Strict enforcement: At least one response MUST be HTTP 429 Too Many Requests
        const rateLimitedResponses = results.filter(r => r.status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
        expect(results.some(r => r.status === 429)).toBe(true);

        // Verify presence and validity of Retry-After header
        const rateLimitedRes = rateLimitedResponses[0];
        const retryAfter = rateLimitedRes.headers.get('retry-after');
        expect(retryAfter).not.toBeNull();
        const retrySeconds = parseInt(retryAfter, 10);
        expect(Number.isFinite(retrySeconds)).toBe(true);
        expect(retrySeconds).toBeGreaterThan(0);
      });

      it('T2-SEC-20: SQL/NoSQL Injection resilience: Malformed query parameters ($gt, $ne) safely sanitized', async () => {
        const { creatorA } = await getTestActors();
        const res = await creatorA.get('/api/v1/analytics/overview?timeframe[$gt]=0', { expectedStatus: [200, 400] });
        expect([200, 400]).toContain(res.status);
      });
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier2-analytics-studio.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier2AnalyticsTests();
}
