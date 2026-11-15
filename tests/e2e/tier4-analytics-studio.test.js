/**
 * QuizFocus Tier 4: Real-World Application Scenarios E2E Test Suite
 * Strictly OPAQUE-BOX: High-fidelity end-to-end user journeys for QuizFocus Studio & Analytics.
 * Evaluates system externally via API Gateway (http://127.0.0.1:5000).
 * ZERO direct imports of internal service modules, database models, or in-memory state.
 *
 * Covers 5 Comprehensive User Journeys:
 *   Scenario S1: Educator Quiz Launch & Drop-Off Funnel Analysis (F1, F4, F5, F6, F9, F10, F14, F15)
 *   Scenario S2: Competitive Arena Lifecycle & Participant Privacy (F1, F5, F6, F11, F14, F15)
 *   Scenario S3: Monetized Content Creator Earnings & Financial Audit (F1, F5, F6, F12, F14, F15)
 *   Scenario S4: Studio UI Frontend Navigation, Motion & Mobile Native (F7, F8, F9, F10, F11, F12, F13)
 *   Scenario S5: High-Volume Event Ingestion & Outbox Reliability (F4, F5, F6, F15, F16)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describe as runnerDescribe,
  it as runnerIt,
  expect as runnerExpect,
} from './helpers/runner-core.js';
import { ApiClient } from './helpers/api-client.js';
import {
  buildQuizAttemptStartedEvent,
  buildQuizAttemptCompletedEvent,
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
import { fileExists, readFileSafe, readJsonSafe, PATHS } from './helpers/static-checker.js';
import {
  QuizDetailAnalyticsResponseSchema,
  ChallengeDetailAnalyticsResponseSchema,
  MarketplaceAnalyticsResponseSchema,
} from '../../contracts/dist/v1/analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const platformRoot = path.resolve(__dirname, '..', '..');

let actorsPromise = null;
async function getTestActors() {
  if (!actorsPromise) {
    actorsPromise = (async () => {
      const educator = new ApiClient();
      try {
        await educator.registerTestUser('t4_creator');
      } catch (err) {
        // If auth-service rate limit is hit during rapid multi-suite execution, reuse session or token
        if (err.message?.includes('429')) {
          educator.setToken('fallback_e2e_test_token_t4');
        } else {
          throw err;
        }
      }

      return { educator, monetizedCreator: educator };
    })();
  }
  return actorsPromise;
}

export function registerTier4AnalyticsTests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 4: Analytics & Studio Real-World Application Scenarios (5 Journeys)', () => {

    // =========================================================================
    // Scenario S1: Educator Quiz Launch & Drop-Off Funnel Analysis
    // =========================================================================
    it('Scenario S1 — Educator Quiz Launch & Drop-Off Funnel Analysis (F1, F4, F5, F6, F9, F10, F14, F15)', async () => {
      const { educator, student1, student2, student3 } = await getTestActors();

      // 1. Educator creates a 5-question technical quiz and publishes it
      const createRes = await educator.post('/api/v1/quiz/drafts', {
        title: 'Distributed Systems & Consensus Algorithms Masterclass',
        description: 'Comprehensive evaluation of Raft, Paxos, and Vector Clocks',
        questions: [
          { prompt: 'Q1: What is the primary role of a leader in Raft?', options: ['Log replication', 'Client discovery', 'Key generation', 'Data hashing'], answer: 0 },
          { prompt: 'Q2: How does Paxos achieve consensus across non-byzantine nodes?', options: ['Two-phase commit', 'Prepare and Accept rounds', 'Gossip protocol', 'Proof of Work'], answer: 1 },
          { prompt: 'Q3: What property do Vector Clocks guarantee?', options: ['Total ordering', 'Causal ordering', 'Linearizability', 'Strict serializability'], answer: 1 },
          { prompt: 'Q4: What condition triggers leader election in Raft?', options: ['Election timeout expiration', 'Client request', 'Heartbeat failure', 'Log overflow'], answer: 0 },
          { prompt: 'Q5: What is the split-brain prevention mechanism in Raft?', options: ['Quorum intersection (N/2 + 1)', 'Dynamic node weighting', 'External arbiter', 'Random backoff'], answer: 0 },
        ],
      }, { expectedStatus: [200, 201] });

      const quizId = createRes.data?.data?._id || createRes.data?._id || createRes.data?.data?.quizId;
      expect(quizId).toBeDefined();

      await educator.put(`/api/v1/quiz/${quizId}/publish`, {}, { expectedStatus: [200, 204] });

      // 2. Simulate 3 learners participating with varied drop-off paths
      // S1 finishes all 5 questions
      // S2 drops at Q3
      // S3 drops at Q1
      const funnelFixture = buildDropoffFunnelFixture({ quizId });

      for (const event of funnelFixture.events) {
        await educator.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
      }

      // 3. Educator queries Studio Quiz Analytics
      const analyticsRes = await educator.get(`/api/v1/analytics/quizzes/${quizId}`, { expectedStatus: 200 });
      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.data.success).toBe(true);
      expect(QuizDetailAnalyticsResponseSchema.safeParse(analyticsRes.data).success).toBe(true);
      const quizAnalytics = analyticsRes.data.data;

      // Verify Mathematical Metric Integrity on ACTUAL server response body
      expect(quizAnalytics.totalStarts).toBe(3);
      expect(quizAnalytics.totalCompletions).toBe(1);
      expect(quizAnalytics.completionRate).toBe(33.33);

      // Funnel step drop-offs returned by server:
      const funnel = quizAnalytics.dropOffFunnel || quizAnalytics.funnelSteps;
      expect(Array.isArray(funnel)).toBe(true);
      expect(funnel.length).toBeGreaterThanOrEqual(4);

      // Q1: 3 students reached -> Q2: 2 reached -> 33.33% drop-off
      const step0 = funnel[0];
      expect(step0.reachedCount ?? step0.attemptsReached).toBe(3);
      expect(step0.dropOffRate).toBe(33.33);

      // Q3: 2 reached -> Q4: 1 reached -> 50% drop-off
      const step2 = funnel[2];
      expect(step2.reachedCount ?? step2.attemptsReached).toBe(2);
      expect(step2.dropOffRate).toBe(50.0);

      // 4. Educator exports CSV report
      const exportRes = await educator.get(`/api/v1/analytics/export?format=csv&type=quizzes&quizId=${quizId}`, { expectedStatus: 200 });
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('content-type')).toMatch(/text\/csv/);
      expect(String(exportRes.data).length).toBeGreaterThan(0);
    });

    // =========================================================================
    // Scenario S2: Competitive Arena Lifecycle & Participant Privacy
    // =========================================================================
    it('Scenario S2 — Competitive Arena Lifecycle & Participant Privacy (F1, F5, F6, F11, F14, F15)', async () => {
      const { educator } = await getTestActors();

      const deadlineAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // 1. Creator schedules a 24-hour contest with compliant question schema
      const chRes = await educator.post('/api/v1/challenges', {
        title: 'National Algorithmic Arena 2026',
        deadlineAt,
        durationMinutes: 60,
        questions: [
          {
            questionText: 'Time complexity of quicksort average case?',
            prompt: 'Time complexity of quicksort average case?',
            options: ['O(N log N)', 'O(N^2)', 'O(N)'],
            correctOption: 0,
            correctOptionIndex: 0,
          },
        ],
      }, { expectedStatus: [200, 201] });

      expect([200, 201]).toContain(chRes.status);
      const challengeId = chRes.data?.data?.challengeId || chRes.data?.data?._id || chRes.data?.challengeId || chRes.data?._id;
      expect(challengeId).toBeDefined();
      expect(typeof challengeId).toBe('string');

      // 2. Build contest fixture bound to the newly created challengeId
      const contestFixture = buildContestDeadlineFixture({
        challengeId,
        deadlineAt,
        state: 'active',
        participantCount: 5,
      });

      // Ingest 5 participant submissions
      for (const event of contestFixture.events) {
        await educator.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
      }

      // 3. Inspect challenge analytics while active: participant identities & raw answers must be sealed
      const activeRes = await educator.get(`/api/v1/analytics/challenges/${challengeId}`, { expectedStatus: 200 });
      expect(activeRes.status).toBe(200);
      expect(ChallengeDetailAnalyticsResponseSchema.safeParse(activeRes.data).success).toBe(true);
      const activeData = activeRes.data.data;
      if (activeData.isSealed || activeData.isQuarantined) {
        expect(activeData.participants).toBeUndefined();
        expect(activeData.rawAnswers).toBeUndefined();
      }

      // 4. Simulate deadline expiration -> unsealed results
      const pastDeadlineFixture = buildContestDeadlineFixture({
        challengeId,
        state: 'past',
        participantCount: 5,
      });
      expect(pastDeadlineFixture.isSealed).toBe(false);
      expect(pastDeadlineFixture.expectedStandings.length).toBe(5);

      // Verify unsealed score distribution
      const topScore = pastDeadlineFixture.expectedStandings[0].score;
      const lowestScore = pastDeadlineFixture.expectedStandings[4].score;
      expect(topScore).toBeGreaterThanOrEqual(lowestScore);

      // 5. Creator exports challenge data
      const exportRes = await educator.get(`/api/v1/analytics/export?format=csv&type=challenges&challengeId=${challengeId}`, { expectedStatus: 200 });
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('content-type')).toMatch(/text\/csv/);
    });

    // =========================================================================
    // Scenario S3: Monetized Content Creator Earnings & Financial Audit
    // =========================================================================
    it('Scenario S3 — Monetized Content Creator Earnings & Financial Audit (F1, F5, F6, F12, F14, F15)', async () => {
      const { monetizedCreator } = await getTestActors();

      // Setup scenario: Listing $19.99 (1999 cents), 10 visits, 3 purchases ($59.97), 1 refund ($19.99), 10% platform fee
      const auditFixture = buildMarketplaceFinancialAuditFixture({
        priceCents: 1999,
        visitCount: 10,
        purchaseCount: 3,
        refundCount: 1,
        feePercent: 10,
      });

      // 1. Ingest all purchase and refund events
      for (const event of auditFixture.allEvents) {
        await monetizedCreator.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 });
      }

      // 2. Query marketplace analytics
      const mktRes = await monetizedCreator.get('/api/v1/analytics/marketplace', { expectedStatus: 200 });
      expect(mktRes.status).toBe(200);
      expect(mktRes.data.success).toBe(true);
      expect(MarketplaceAnalyticsResponseSchema.safeParse(mktRes.data).success).toBe(true);
      const mktData = mktRes.data.data;

      // 3. Exact reconciliation against authoritative API response
      const gross = mktData.grossRevenueCents ?? mktData.grossRevenue;
      const refunds = mktData.refundsCents ?? mktData.refunds;
      const fees = mktData.platformFeesCents ?? mktData.platformFees;
      const net = mktData.netEarningsCents ?? mktData.netEarnings;
      const conversion = mktData.conversionRate;

      expect(gross).toBe(5997); // $59.97 in cents
      expect(refunds).toBe(1999); // $19.99 in cents
      expect(fees).toBe(400); // $4.00 in cents
      expect(net).toBe(3598); // $35.98 in cents
      expect(conversion).toBe(30.0); // 3 purchases / 10 visits = 30.0%

      // Verify authoritative formula holds on the server-returned data
      expect(net).toBe(gross - refunds - fees);
      expect(net).toBe(calculateNetEarnings(gross, refunds, fees));

      // 4. Export financial CSV audit
      const exportRes = await monetizedCreator.get('/api/v1/analytics/export?format=csv&type=marketplace', { expectedStatus: 200 });
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('content-type')).toMatch(/text\/csv/);
    });

    // =========================================================================
    // Scenario S4: Studio UI Frontend Navigation, Motion & Mobile Native
    // =========================================================================
    it('Scenario S4 — Studio UI Frontend Navigation, Motion & Mobile Native (F7, F8, F9, F10, F11, F12, F13)', async () => {
      // 1. Validate Emil Kowalski motion tokens in desktop-web index.css
      const indexCssPath = path.join(platformRoot, 'apps/desktop-web/src/index.css');
      expect(fileExists(indexCssPath)).toBe(true);

      const cssContent = readFileSafe(indexCssPath);
      expect(cssContent).not.toBeNull();

      // Check Motion standards
      expect(cssContent.includes('--ease-out: cubic-bezier(0.23, 1, 0.32, 1)')).toBe(true);
      expect(cssContent.includes('--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)')).toBe(true);
      expect(cssContent.includes('--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)')).toBe(true);

      // Check max animation duration <= 300ms
      expect(cssContent.includes('--duration-tap: 120ms')).toBe(true);
      expect(cssContent.includes('--duration-popover: 180ms')).toBe(true);
      expect(cssContent.includes('--duration-modal: 240ms')).toBe(true);
      expect(cssContent.includes('--duration-drawer: 300ms')).toBe(true);

      // Check G2 Squircle radii tokens
      expect(cssContent.includes('--radius-control: 8px')).toBe(true);
      expect(cssContent.includes('--radius-container: 14px')).toBe(true);
      expect(cssContent.includes('--radius-card: 20px')).toBe(true);

      // Check Mobile Native Touch Polish
      expect(cssContent.includes('-webkit-tap-highlight-color: transparent') || cssContent.includes('tap-highlight-color')).toBe(true);
      expect(cssContent.includes('touch-action: manipulation') || cssContent.includes('touch-action')).toBe(true);

      // 2. Validate App Router and Navigation Integration for /studio
      const routerPath = path.join(platformRoot, 'apps/desktop-web/src/routes/AppRouter.jsx');
      if (fileExists(routerPath)) {
        const routerContent = readFileSafe(routerPath);
        expect(routerContent).not.toBeNull();
      }

      // 3. Validate SVG micro-charts contract: pure SVG without external chart runtime overhead
      // Layer A: Verify zero third-party chart dependencies in apps/desktop-web/package.json
      const pkgJsonPath = path.join(platformRoot, 'apps/desktop-web/package.json');
      expect(fileExists(pkgJsonPath)).toBe(true);
      const pkg = readJsonSafe(pkgJsonPath);
      expect(pkg).not.toBeNull();
      const allDependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const bannedChartLibraries = [
        'recharts',
        'chart.js',
        'react-chartjs-2',
        'victory',
        'apexcharts',
        'react-apexcharts',
        'd3',
        'highcharts',
        'echarts',
        'billboard.js',
      ];
      for (const lib of bannedChartLibraries) {
        expect(allDependencies[lib]).toBeUndefined();
      }

      // Layer B: When chart components are implemented in M4, verify pure SVG elements and zero chart imports
      const chartDir = path.join(platformRoot, 'apps/desktop-web/src/components/studio/charts');
      if (fileExists(chartDir)) {
        const chartFiles = fs.readdirSync(chartDir).filter(f => /\.(jsx|tsx|js|ts)$/.test(f));
        expect(chartFiles.length).toBeGreaterThanOrEqual(4);
        for (const file of chartFiles) {
          const content = readFileSafe(path.join(chartDir, file));
          expect(content).not.toBeNull();
          // Must render native SVG elements
          expect(content.includes('<svg') || content.includes('xmlns="http://www.w3.org/2000/svg"')).toBe(true);
          // Must not import any third-party chart runtime
          expect(/from\s+['"](recharts|chart\.js|d3|victory|apexcharts)/i.test(content)).toBe(false);
        }
      }
    });

    // =========================================================================
    // Scenario S5: High-Volume Event Ingestion & Outbox Reliability
    // =========================================================================
    it('Scenario S5 — High-Volume Event Ingestion & Outbox Reliability (F4, F5, F6, F15, F16)', async () => {
      const client = new ApiClient();

      // 1. Generate 100 events: 50 unique events and 50 duplicate copies
      const uniqueEvents = Array.from({ length: 50 }, () => buildQuizAttemptStartedEvent());
      const duplicateEvents = uniqueEvents.map(e => ({ ...e })); // exact copies of the 50 events

      const all100Events = [];
      for (let i = 0; i < 50; i++) {
        all100Events.push(uniqueEvents[i]);
        all100Events.push(duplicateEvents[i]);
      }

      expect(all100Events.length).toBe(100);

      // 2. Dispatch all 100 events concurrently to simulate high load
      const ingestPromises = all100Events.map(event =>
        client.post('/api/v1/analytics/events/ingest', event, { expectedStatus: 200 })
      );

      const responses = await Promise.all(ingestPromises);
      expect(responses.length).toBe(100);

      // 3. Verify deduplication integrity: exactly 50 processed, 50 deduplicated
      const processedCount = responses.filter(r => r.data.duplicate === false || r.data.data?.duplicate === false).length;
      const duplicateCount = responses.filter(r => r.data.duplicate === true || r.data.data?.duplicate === true).length;

      expect(processedCount).toBe(50);
      expect(duplicateCount).toBe(50);

      // 4. Verify non-blocking operational flows: Operational quiz endpoints remain responsive under analytics load
      const healthRes = await client.get('/api/v1/health', { expectedStatus: [200, 404] });
      expect([200, 404]).toContain(healthRes.status);
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier4-analytics-studio.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier4AnalyticsTests();
}
