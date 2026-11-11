/**
 * Challenger Stress Test: QuizDetailsModal & Analytics 403 Fix
 *
 * Verifies:
 * 1. quizzes.routes.js and quiz.routes.js parity for GET /:id/analytics.
 * 2. Static AST / invariant analysis of QuizDetailsModal.jsx.
 * 3. Adversarial simulation of QuizDetailsModal state machine & API flow.
 * 4. React DOM / SSR mount tests under JSDOM across all edge conditions:
 *    - null/invalid quizId
 *    - sealed challenge (deadline in future or null)
 *    - concluded challenge (deadline in past)
 *    - 401/403 analytics suppression & error handling
 *    - 401/403 attempts & quarantined attempts handling
 */

process.env.VITE_API_URL = 'http://localhost:5000';
process.env.VITE_DEV_PORT = '3000';

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DESKTOP_WEB_DIR = path.resolve(ROOT_DIR, 'apps/desktop-web');

const require = createRequire(path.join(DESKTOP_WEB_DIR, 'package.json'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    failures.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✔ PASS: ${message}`);
  }
}

function expectEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

async function runAllSuites() {
  console.log('======================================================================');
  console.log('  CHALLENGER 2: QUIZ DETAILS MODAL & ANALYTICS 403 STRESS HARNESS    ');
  console.log('======================================================================\n');

  // =========================================================================
  // SUITE 1: Backend Route Parity & Route Registration Invariants
  // =========================================================================
  console.log('--- Suite 1: Backend Route Parity (quizzes.routes.js & quiz.routes.js) ---');

  const quizzesRoutesPath = path.join(ROOT_DIR, 'services/quiz-service/src/routes/quizzes.routes.js');
  const quizRoutesPath = path.join(ROOT_DIR, 'services/quiz-service/src/routes/quiz.routes.js');

  const quizzesSource = fs.readFileSync(quizzesRoutesPath, 'utf8');
  const quizSource = fs.readFileSync(quizRoutesPath, 'utf8');

  // Invariant 1.1: GET /:id/analytics is registered in quizzes.routes.js
  const hasQuizzesAnalytics = quizzesSource.includes("router.get('/:id/analytics', validateQuizIdentifier('id'), optionalAuth, getQuizAnalytics);");
  assert(hasQuizzesAnalytics, 'quizzes.routes.js registers `router.get("/:id/analytics", validateQuizIdentifier("id"), optionalAuth, getQuizAnalytics);`');

  // Invariant 1.2: GET /:id/analytics is registered in quiz.routes.js
  const hasQuizAnalytics = quizSource.includes("router.get('/:id/analytics', validateQuizIdentifier('id'), optionalAuth, getQuizAnalytics);");
  assert(hasQuizAnalytics, 'quiz.routes.js registers `router.get("/:id/analytics", validateQuizIdentifier("id"), optionalAuth, getQuizAnalytics);`');

  // Invariant 1.3: Middleware stack parity
  const getQuizAnalyticsImport = quizzesSource.includes('getQuizAnalytics') && quizSource.includes('getQuizAnalytics');
  assert(getQuizAnalyticsImport, 'Both router modules import getQuizAnalytics from quiz.controller.js');

  // Invariant 1.4: Order parity — analytics route registered before or with attempts
  const analyticsIdx = quizzesSource.indexOf("router.get('/:id/analytics'");
  const attemptsIdx = quizzesSource.indexOf("router.get('/:id/attempts'");
  assert(analyticsIdx !== -1 && attemptsIdx !== -1 && analyticsIdx < attemptsIdx, 'quizzes.routes.js registers analytics route prior to attempts route');

  // =========================================================================
  // SUITE 2: QuizDetailsModal.jsx Static AST & Code Architecture Invariants
  // =========================================================================
  console.log('\n--- Suite 2: QuizDetailsModal.jsx Architecture & Logic Invariants ---');

  const modalPath = path.join(DESKTOP_WEB_DIR, 'src/components/QuizModal/QuizDetailsModal.jsx');
  const modalSource = fs.readFileSync(modalPath, 'utf8');

  // Invariant 2.1: No parallel Promise.allSettled on primary quiz and analytics
  const parallelFetchingPattern = /Promise\.allSettled\(\[\s*api\.get\([`']\/quiz\/\$\{quizId\}[`']\),\s*api\.get\([`']\/quiz\/\$\{quizId\}\/analytics[`']\)/;
  assert(!parallelFetchingPattern.test(modalSource), 'QuizDetailsModal.jsx DOES NOT issue parallel fetch of quiz metadata and analytics');

  // Invariant 2.2: Sequential metadata fetch precedes analytics
  const sequentialPattern = /const quizResponse = await api\.get\([`']\/quiz\/\$\{quizId\}[`']\);[\s\S]*?const isChallengeSealed[\s\S]*?if \(!isChallengeSealed\)[\s\S]*?api\.get\([`']\/quiz\/\$\{quizId\}\/analytics[`']\)/;
  assert(sequentialPattern.test(modalSource), 'QuizDetailsModal.jsx awaits quiz metadata FIRST, evaluates isChallengeSealed, and only then requests /analytics');

  // Invariant 2.3: isChallengeSealed condition check
  const sealedLogic = modalSource.includes('quizData?.isChallenge &&') &&
                       modalSource.includes('!(quizData.deadlineAt && new Date(quizData.deadlineAt) <= new Date())');
  assert(sealedLogic, 'isChallengeSealed correctly checks `isChallenge` AND `!(deadlineAt && new Date(deadlineAt) <= new Date())`');

  // Invariant 2.4: Swallowing 401 and 403 on analytics
  const analyticsCatchSwallow = modalSource.includes('status !== 403 && status !== 401') &&
                                modalSource.includes('Quiz analytics unavailable');
  assert(analyticsCatchSwallow, 'Analytics error catch suppresses 401 and 403 without setting fatal UI error');

  // Invariant 2.5: Swallowing 401 and 403 on attempts
  const attemptsCatchSwallow = modalSource.includes('status !== 401 && status !== 403') &&
                               modalSource.includes('Quiz attempts unavailable');
  assert(attemptsCatchSwallow, 'Attempts error catch suppresses 401 and 403 without setting fatal UI error');

  // Invariant 2.6: Quarantined attempts sets resultsSealed
  const quarantinedCheck = modalSource.includes('attemptsData?.quarantined === true') &&
                           modalSource.includes('setResultsSealed(true)');
  assert(quarantinedCheck, 'Attempts response checks `quarantined === true` and sets `resultsSealed(true)`');

  // Invariant 2.7: Stats grid rendering gated by !resultsSealed
  assert(modalSource.includes('{!resultsSealed && (') && modalSource.includes('className="quiz-stat-grid"'), 'Stats grid is rendered strictly when `!resultsSealed`');

  // Invariant 2.8: Sealed notice rendered when resultsSealed
  assert(modalSource.includes('Attempts and scores are available after the challenge deadline.'), 'Sealed notice is rendered when results are sealed');

  // Invariant 2.9: Stats computation fallback for averageScore
  const avgScoreFallback = modalSource.includes('quiz?.avgScore ?? analytics?.avgScore ?? analytics?.averageScore ?? 0');
  assert(avgScoreFallback, 'Stats memo checks `quiz?.avgScore ?? analytics?.avgScore ?? analytics?.averageScore ?? 0`');

  // =========================================================================
  // SUITE 3: Adversarial Simulation of QuizDetailsModal State Machine & API Flow
  // =========================================================================
  console.log('\n--- Suite 3: Adversarial Simulation of Component Lifecycle & API Flow ---');

  // Simulated state container matching QuizDetailsModal useState hooks
  class QuizDetailsModalHarness {
    constructor(quizId, mockApi) {
      this.quizId = quizId;
      this.api = mockApi;
      this.state = {
        quiz: null,
        analytics: null,
        attempts: [],
        pagination: { total: 0, page: 1, limit: 10, pages: 1 },
        resultsSealed: false,
        loading: true,
        attemptsLoading: false,
        error: '',
        selectedAttemptId: null,
      };
      this.cancelled = false;
      this.apiCalls = [];
    }

    // Exact reproduction of fetchDetails logic from QuizDetailsModal.jsx:81-157
    async fetchDetails() {
      this.state.loading = true;
      this.state.error = '';
      this.state.quiz = null;
      this.state.analytics = null;
      this.state.attempts = [];
      this.state.pagination = { total: 0, page: 1, limit: 10, pages: 1 };
      this.state.resultsSealed = false;
      this.state.selectedAttemptId = null;

      try {
        this.apiCalls.push({ endpoint: `/quiz/${this.quizId}`, params: undefined });
        const quizResponse = await this.api.get(`/quiz/${this.quizId}`);
        if (this.cancelled) return;

        const quizData = quizResponse.data?.data?.quiz || quizResponse.data?.quiz;
        this.state.quiz = quizData;

        const isChallengeSealed = Boolean(
          quizData?.isChallenge &&
          !(quizData.deadlineAt && new Date(quizData.deadlineAt) <= new Date())
        );
        this.state.resultsSealed = isChallengeSealed;

        const secondaryPromises = [];

        if (!isChallengeSealed) {
          secondaryPromises.push(
            (async () => {
              try {
                this.apiCalls.push({ endpoint: `/quiz/${this.quizId}/analytics`, params: undefined });
                const res = await this.api.get(`/quiz/${this.quizId}/analytics`);
                if (this.cancelled) return;
                const analyticsData = res.data?.data?.analytics || res.data?.analytics;
                this.state.analytics = analyticsData;
              } catch (err) {
                if (this.cancelled) return;
                const status = err.response?.status;
                if (status !== 403 && status !== 401) {
                  // non-fatal warning
                }
              }
            })()
          );
        }

        secondaryPromises.push(
          (async () => {
            try {
              this.apiCalls.push({ endpoint: `/quiz/${this.quizId}/attempts`, params: { limit: 10 } });
              const res = await this.api.get(`/quiz/${this.quizId}/attempts`, { params: { limit: 10 } });
              if (this.cancelled) return;
              const attemptsData = res.data?.data || res.data;
              this.state.attempts = attemptsData?.attempts || [];
              this.state.pagination = attemptsData?.pagination || { total: 0, page: 1, limit: 10, pages: 1 };
              if (attemptsData?.quarantined === true) {
                this.state.resultsSealed = true;
              }
            } catch (err) {
              if (this.cancelled) return;
              const status = err.response?.status;
              if (status !== 401 && status !== 403) {
                // non-fatal warning
              }
            }
          })()
        );

        await Promise.allSettled(secondaryPromises);
      } catch (requestError) {
        if (!this.cancelled) {
          this.state.error = requestError.response?.data?.message || 'Failed to load quiz details';
        }
      } finally {
        if (!this.cancelled) {
          this.state.loading = false;
        }
      }
    }

    // Stats memo reproduction from QuizDetailsModal.jsx:214-227
    computeStats() {
      const { quiz, analytics, attempts, pagination } = this.state;
      const totalAttempts = Number(quiz?.totalAttempts || pagination.total || attempts.length || 0);
      const averageScore = Number(quiz?.avgScore ?? analytics?.avgScore ?? analytics?.averageScore ?? 0);
      const highestScore = attempts.reduce((max, attempt) => Math.max(max, Number(attempt.percentage || 0)), 0);
      const completedAttempts = attempts.filter((attempt) => attempt.status === 'completed').length;

      return [
        { label: 'Questions', value: quiz?.questionCount || 0 },
        { label: 'Attempts', value: totalAttempts },
        { label: 'Average Score', value: `${Math.round(averageScore)}%` },
        { label: 'Best Recent', value: `${Math.round(highestScore)}%` },
        { label: 'Completed', value: completedAttempts },
      ];
    }
  }

  // 3.1: Null quizId
  {
    const mockApi = {
      get: async (url) => {
        const error = new Error('Invalid quiz identifier');
        error.response = { status: 400, data: { message: 'Invalid quiz identifier' } };
        throw error;
      }
    };
    const harness = new QuizDetailsModalHarness(null, mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.loading, false, 'Case 3.1: Loading terminates on null quizId');
    expectEqual(harness.state.error, 'Invalid quiz identifier', 'Case 3.1: Error state set to backend message');
    expectEqual(harness.state.quiz, null, 'Case 3.1: Quiz remains null');
    expectEqual(harness.apiCalls.length, 1, 'Case 3.1: Only primary quiz request dispatched, secondary skipped');
  }

  // 3.2: Undefined / Invalid ObjectId
  {
    const mockApi = {
      get: async (url) => {
        const error = new Error('Quiz not found');
        error.response = { status: 404, data: { message: 'Quiz not found' } };
        throw error;
      }
    };
    const harness = new QuizDetailsModalHarness('invalid-object-id', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.loading, false, 'Case 3.2: Loading terminates on 404');
    expectEqual(harness.state.error, 'Quiz not found', 'Case 3.2: Error message populated');
    expectEqual(harness.state.quiz, null, 'Case 3.2: Quiz is null');
  }

  // 3.3: Active Challenge (isChallenge: true, deadlineAt: null) -> MUST SUPPRESS /analytics
  {
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/c1') {
          return { data: { data: { quiz: { _id: 'c1', title: 'Open Challenge', isChallenge: true, deadlineAt: null, questionCount: 10 } } } };
        }
        if (url === '/quiz/c1/analytics') {
          throw new Error('ILLEGAL: Analytics should NOT have been called!');
        }
        if (url === '/quiz/c1/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 }, quarantined: false } } };
        }
        throw new Error(`Unexpected endpoint: ${url}`);
      }
    };
    const harness = new QuizDetailsModalHarness('c1', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.resultsSealed, true, 'Case 3.3: resultsSealed is TRUE when deadlineAt is null');
    const analyticsCalls = harness.apiCalls.filter(c => c.endpoint.includes('/analytics'));
    expectEqual(analyticsCalls.length, 0, 'Case 3.3: ZERO /analytics requests dispatched for active challenge with null deadline');
    expectEqual(harness.state.attempts.length, 0, 'Case 3.3: Attempts fetched');
    expectEqual(harness.state.loading, false, 'Case 3.3: Loading finished');
  }

  // 3.4: Active Challenge (isChallenge: true, deadlineAt in the future) -> MUST SUPPRESS /analytics
  {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/c2') {
          return { data: { data: { quiz: { _id: 'c2', title: 'Future Challenge', isChallenge: true, deadlineAt: futureDate, questionCount: 5 } } } };
        }
        if (url === '/quiz/c2/analytics') {
          throw new Error('ILLEGAL: Analytics should NOT have been called!');
        }
        if (url === '/quiz/c2/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
        throw new Error(`Unexpected endpoint: ${url}`);
      }
    };
    const harness = new QuizDetailsModalHarness('c2', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.resultsSealed, true, 'Case 3.4: resultsSealed is TRUE when deadlineAt is in future');
    const analyticsCalls = harness.apiCalls.filter(c => c.endpoint.includes('/analytics'));
    expectEqual(analyticsCalls.length, 0, 'Case 3.4: ZERO /analytics requests dispatched when deadlineAt is in future');
  }

  // 3.5: Concluded Challenge (isChallenge: true, deadlineAt in the past) -> MUST REQUEST /analytics
  {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    let analyticsRequested = false;
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/c3') {
          return { data: { data: { quiz: { _id: 'c3', title: 'Past Challenge', isChallenge: true, deadlineAt: pastDate, questionCount: 15, avgScore: 82 } } } };
        }
        if (url === '/quiz/c3/analytics') {
          analyticsRequested = true;
          return { data: { data: { analytics: { avgScore: 82, totalAttempts: 5 } } } };
        }
        if (url === '/quiz/c3/attempts') {
          return { data: { data: { attempts: [{ _id: 'att1', percentage: 90, status: 'completed' }], pagination: { total: 1 } } } };
        }
        throw new Error(`Unexpected endpoint: ${url}`);
      }
    };
    const harness = new QuizDetailsModalHarness('c3', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.resultsSealed, false, 'Case 3.5: resultsSealed is FALSE when deadlineAt is in past');
    expectEqual(analyticsRequested, true, 'Case 3.5: /analytics WAS requested for concluded challenge');
    const stats = harness.computeStats();
    expectEqual(stats[0].value, 15, 'Case 3.5: stats.Questions matches questionCount');
    expectEqual(stats[2].value, '82%', 'Case 3.5: stats.AverageScore computed from analytics.avgScore');
    expectEqual(stats[3].value, '90%', 'Case 3.5: stats.Best Recent matches highest attempt');
  }

  // 3.6: Standard Quiz (isChallenge: false or undefined) -> Requests /analytics
  {
    let analyticsRequested = false;
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/q1') {
          return { data: { data: { quiz: { _id: 'q1', title: 'Regular Quiz', isChallenge: false, questionCount: 20 } } } };
        }
        if (url === '/quiz/q1/analytics') {
          analyticsRequested = true;
          return { data: { data: { analytics: { avgScore: 75, totalAttempts: 12 } } } };
        }
        if (url === '/quiz/q1/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
        throw new Error(`Unexpected endpoint: ${url}`);
      }
    };
    const harness = new QuizDetailsModalHarness('q1', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.resultsSealed, false, 'Case 3.6: resultsSealed is FALSE for standard quiz');
    expectEqual(analyticsRequested, true, 'Case 3.6: /analytics requested for standard quiz');
  }

  // 3.7: Graceful 403 Forbidden handling on /analytics
  {
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/q2') {
          return { data: { data: { quiz: { _id: 'q2', title: 'Protected Quiz', isChallenge: false, avgScore: 68 } } } };
        }
        if (url === '/quiz/q2/analytics') {
          const err = new Error('Forbidden');
          err.response = { status: 403, data: { message: 'Challenge results are sealed until the deadline' } };
          throw err;
        }
        if (url === '/quiz/q2/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
      }
    };
    const harness = new QuizDetailsModalHarness('q2', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.loading, false, 'Case 3.7: Loading completes cleanly when analytics returns 403');
    expectEqual(harness.state.error, '', 'Case 3.7: 403 analytics error does NOT set fatal UI error');
    expectEqual(harness.state.analytics, null, 'Case 3.7: analytics remains null');
    const stats = harness.computeStats();
    expectEqual(stats[2].value, '68%', 'Case 3.7: averageScore safely falls back to quiz.avgScore');
  }

  // 3.8: Graceful 401 Unauthorized handling on /analytics
  {
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/q3') {
          return { data: { data: { quiz: { _id: 'q3', title: 'Public Quiz', isChallenge: false } } } };
        }
        if (url === '/quiz/q3/analytics') {
          const err = new Error('Unauthorized');
          err.response = { status: 401, data: { message: 'Authentication required' } };
          throw err;
        }
        if (url === '/quiz/q3/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
      }
    };
    const harness = new QuizDetailsModalHarness('q3', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.loading, false, 'Case 3.8: Loading completes cleanly on 401');
    expectEqual(harness.state.error, '', 'Case 3.8: 401 analytics error does NOT set fatal UI error');
    const stats = harness.computeStats();
    expectEqual(stats[2].value, '0%', 'Case 3.8: stats fallback to 0% when no scores available');
  }

  // 3.9: Graceful 401 on /attempts (unauthenticated guest viewing public quiz)
  {
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/q4') {
          return { data: { data: { quiz: { _id: 'q4', title: 'Guest Viewable Quiz' } } } };
        }
        if (url === '/quiz/q4/analytics') {
          return { data: { data: { analytics: { avgScore: 50 } } } };
        }
        if (url === '/quiz/q4/attempts') {
          const err = new Error('Unauthorized');
          err.response = { status: 401, data: { message: 'Please log in to view personal attempts' } };
          throw err;
        }
      }
    };
    const harness = new QuizDetailsModalHarness('q4', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.loading, false, 'Case 3.9: Loading completes cleanly on 401 attempts');
    expectEqual(harness.state.error, '', 'Case 3.9: 401 attempts error does NOT crash modal or set fatal error');
    expectEqual(harness.state.attempts.length, 0, 'Case 3.9: attempts array remains empty array');
  }

  // 3.10: Quarantined attempts flips resultsSealed to true
  {
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/q5') {
          return { data: { data: { quiz: { _id: 'q5', title: 'Quarantined Quiz', isChallenge: false } } } };
        }
        if (url === '/quiz/q5/analytics') {
          return { data: { data: { analytics: {} } } };
        }
        if (url === '/quiz/q5/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 }, quarantined: true } } };
        }
      }
    };
    const harness = new QuizDetailsModalHarness('q5', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.resultsSealed, true, 'Case 3.10: quarantined: true in attempts flips resultsSealed to TRUE');
  }

  // 3.11: Malformed deadline string (e.g. "not-a-date") with isChallenge: true
  {
    const mockApi = {
      get: async (url) => {
        if (url === '/quiz/c_malformed') {
          return { data: { data: { quiz: { _id: 'c_malformed', isChallenge: true, deadlineAt: 'INVALID_DATE_STRING' } } } };
        }
        if (url === '/quiz/c_malformed/attempts') {
          return { data: { data: { attempts: [] } } };
        }
        if (url === '/quiz/c_malformed/analytics') {
          throw new Error('ILLEGAL: Analytics should NOT have been called!');
        }
      }
    };
    const harness = new QuizDetailsModalHarness('c_malformed', mockApi);
    await harness.fetchDetails();
    expectEqual(harness.state.resultsSealed, true, 'Case 3.11: Invalid date string is treated as sealed (fail-closed security)');
    const analyticsCalls = harness.apiCalls.filter(c => c.endpoint.includes('/analytics'));
    expectEqual(analyticsCalls.length, 0, 'Case 3.11: ZERO /analytics calls for malformed deadline challenge');
  }

  // 3.12: Unmount cancellation guard
  {
    const mockApi = {
      get: async (url) => {
        await new Promise(r => setTimeout(r, 20));
        return { data: { data: { quiz: { _id: 'c_cancelled', title: 'Cancelled' } } } };
      }
    };
    const harness = new QuizDetailsModalHarness('c_cancelled', mockApi);
    const fetchPromise = harness.fetchDetails();
    harness.cancelled = true; // component unmounts mid-flight
    await fetchPromise;
    expectEqual(harness.state.quiz, null, 'Case 3.12: Cancelled request does not commit quiz to state');
  }

  // =========================================================================
  // SUITE 4: DOM & JSX Rendering Invariant Verification under JSDOM
  // =========================================================================
  console.log('\n--- Suite 4: DOM & JSX Presentation Invariants ---');

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000'
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.CustomEvent = dom.window.CustomEvent;

  const React = require('react');
  const ReactDOMServer = require('react-dom/server');
  const { MemoryRouter } = require('react-router-dom');

  // Load Vite server to SSR import QuizDetailsModal and UI components
  const vitePath = pathToFileURL(path.join(DESKTOP_WEB_DIR, 'node_modules/vite/dist/node/index.js')).href;
  const { createServer } = await import(vitePath);
  const viteServer = await createServer({
    root: DESKTOP_WEB_DIR,
    server: { middlewareMode: true },
    appType: 'custom'
  });

  try {
    const QuizDetailsModalMod = await viteServer.ssrLoadModule('/src/components/QuizModal/QuizDetailsModal.jsx');
    const QuizDetailsModal = QuizDetailsModalMod.default;

    // 4.1: Component module exports a valid React component function
    assert(typeof QuizDetailsModal === 'function', 'Case 4.1: QuizDetailsModal default export is a valid React component function');

    // 4.2: Initial SSR render without crash
    let ssrHtml = '';
    let renderThrew = false;
    try {
      ssrHtml = ReactDOMServer.renderToString(
        React.createElement(MemoryRouter, null,
          React.createElement(QuizDetailsModal, { quizId: 'test-quiz-id', onClose: () => {} })
        )
      );
    } catch (err) {
      renderThrew = true;
      console.error('Render error:', err);
    }
    assert(!renderThrew, 'Case 4.2: QuizDetailsModal renders initial SSR frame without throwing');
    assert(ssrHtml.includes('quiz-modal-overlay'), 'Case 4.2: Render contains quiz-modal-overlay root container');
    assert(ssrHtml.includes('quiz-details-modal'), 'Case 4.2: Render contains quiz-details-modal dialog role');
    assert(ssrHtml.includes('Quiz Overview'), 'Case 4.2: Hero eyebrow rendered');

    // 4.3: Real JSDOM Mounting & Client-Side Lifecycle Tests
    const { render, waitFor, cleanup } = require('@testing-library/react');
    const apiMod = await viteServer.ssrLoadModule('/src/api/axios.js');
    const api = apiMod.default;

    // Test 4.3.1: Mount active challenge -> sealed banner rendered, stat grid suppressed
    {
      const futureDeadline = new Date(Date.now() + 86400000).toISOString();
      let analyticsCalled = false;
      api.get = async (url) => {
        if (url === '/quiz/chal_dom_1') {
          return { data: { data: { quiz: { _id: 'chal_dom_1', title: 'DOM Challenge Test', isChallenge: true, deadlineAt: futureDeadline, questionCount: 12 } } } };
        }
        if (url === '/quiz/chal_dom_1/analytics') {
          analyticsCalled = true;
          throw new Error('Analytics should not be called');
        }
        if (url === '/quiz/chal_dom_1/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
        throw new Error('Unexpected URL: ' + url);
      };

      const { container, unmount } = render(
        React.createElement(MemoryRouter, null,
          React.createElement(QuizDetailsModal, { quizId: 'chal_dom_1', onClose: () => {} })
        )
      );

      await waitFor(() => {
        const titleEl = container.querySelector('#quiz-details-title');
        if (!titleEl || titleEl.textContent !== 'DOM Challenge Test') {
          throw new Error('Title not yet rendered');
        }
      });

      expectEqual(analyticsCalled, false, 'Case 4.3.1: DOM mount confirms analytics NOT called for sealed challenge');
      const statGrid = container.querySelector('.quiz-stat-grid');
      expectEqual(statGrid, null, 'Case 4.3.1: DOM does NOT contain .quiz-stat-grid when sealed');
      const sealedNotice = container.querySelector('.quiz-empty-attempts');
      assert(
        sealedNotice && sealedNotice.textContent.includes('Attempts and scores are available after the challenge deadline.'),
        'Case 4.3.1: DOM displays sealed attempts notice'
      );
      const sortSelect = container.querySelector('select');
      expectEqual(sortSelect, null, 'Case 4.3.1: Sort select dropdown suppressed when sealed');
      unmount();
      cleanup();
    }

    // Test 4.3.2: Mount concluded challenge -> stat grid rendered, analytics displayed
    {
      const pastDeadline = new Date(Date.now() - 3600000).toISOString();
      let analyticsCalled = false;
      api.get = async (url) => {
        if (url === '/quiz/chal_dom_2') {
          return { data: { data: { quiz: { _id: 'chal_dom_2', title: 'Concluded DOM Challenge', isChallenge: true, deadlineAt: pastDeadline, questionCount: 25, avgScore: 78 } } } };
        }
        if (url === '/quiz/chal_dom_2/analytics') {
          analyticsCalled = true;
          return { data: { data: { analytics: { avgScore: 84, totalAttempts: 10 } } } };
        }
        if (url === '/quiz/chal_dom_2/attempts') {
          return { data: { data: { attempts: [{ _id: 'att_10', percentage: 95, score: 24, totalQuestions: 25, status: 'completed' }], pagination: { total: 1 } } } };
        }
        throw new Error('Unexpected URL: ' + url);
      };

      const { container, unmount } = render(
        React.createElement(MemoryRouter, null,
          React.createElement(QuizDetailsModal, { quizId: 'chal_dom_2', onClose: () => {} })
        )
      );

      await waitFor(() => {
        const grid = container.querySelector('.quiz-stat-grid');
        if (!grid) throw new Error('Stat grid not yet rendered');
      });

      expectEqual(analyticsCalled, true, 'Case 4.3.2: DOM mount confirms analytics WAS called for concluded challenge');
      const statCards = Array.from(container.querySelectorAll('.quiz-stat-card'));
      expectEqual(statCards.length, 5, 'Case 4.3.2: DOM renders all 5 stat cards');
      const scoreCard = statCards.find(c => c.textContent.includes('Average Score'));
      console.log('      [DEBUG scoreCard content]:', scoreCard ? scoreCard.textContent : 'null');
      assert(scoreCard && scoreCard.textContent.includes('78%'), 'Case 4.3.2: Average score card displays quiz.avgScore (78%)');
      const attemptsCount = container.querySelector('.quiz-attempts-header p');
      assert(attemptsCount && attemptsCount.textContent.includes('1 completed attempt'), 'Case 4.3.2: Header displays attempt count');
      const sortSelect = container.querySelector('select');
      assert(sortSelect !== null, 'Case 4.3.2: Sort select dropdown rendered when unsealed');
      unmount();
      cleanup();
    }

    // Test 4.3.3: Mount with analytics 403 response -> overview renders without crash, fallback stats displayed
    {
      api.get = async (url) => {
        if (url === '/quiz/quiz_403_dom') {
          return { data: { data: { quiz: { _id: 'quiz_403_dom', title: '403 Fallback Quiz', isChallenge: false, questionCount: 8, avgScore: 60 } } } };
        }
        if (url === '/quiz/quiz_403_dom/analytics') {
          const err = new Error('Forbidden');
          err.response = { status: 403, data: { message: 'Forbidden analytics' } };
          throw err;
        }
        if (url === '/quiz/quiz_403_dom/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
        throw new Error('Unexpected URL: ' + url);
      };

      const { container, unmount } = render(
        React.createElement(MemoryRouter, null,
          React.createElement(QuizDetailsModal, { quizId: 'quiz_403_dom', onClose: () => {} })
        )
      );

      await waitFor(() => {
        const titleEl = container.querySelector('#quiz-details-title');
        if (!titleEl || titleEl.textContent !== '403 Fallback Quiz') {
          throw new Error('Title not yet rendered');
        }
      });

      const alertEl = container.querySelector('.quiz-modal-alert');
      expectEqual(alertEl, null, 'Case 4.3.3: No fatal error alert rendered when analytics returns 403');
      const statGrid = container.querySelector('.quiz-stat-grid');
      assert(statGrid !== null, 'Case 4.3.3: Stat grid rendered even when analytics returned 403');
      const statCards = Array.from(container.querySelectorAll('.quiz-stat-card'));
      const scoreCard = statCards.find(c => c.textContent.includes('Average Score'));
      assert(scoreCard && scoreCard.textContent.includes('60%'), 'Case 4.3.3: Falls back to quiz.avgScore (60%)');
      unmount();
      cleanup();
    }

    // Test 4.3.4: Mount with non-existent quiz (404) -> renders error state cleanly
    {
      api.get = async (url) => {
        const err = new Error('Quiz not found');
        err.response = { status: 404, data: { message: 'Quiz not found' } };
        throw err;
      };

      const { container, unmount } = render(
        React.createElement(MemoryRouter, null,
          React.createElement(QuizDetailsModal, { quizId: 'non_existent_quiz', onClose: () => {} })
        )
      );

      await waitFor(() => {
        const errorEl = container.querySelector('.quiz-modal-state.error');
        if (!errorEl) throw new Error('Error state not yet rendered');
      });

      const errorEl = container.querySelector('.quiz-modal-state.error');
      expectEqual(errorEl.textContent, 'Quiz not found', 'Case 4.3.4: Error container displays exact error message');
      unmount();
      cleanup();
    }

    // Test 4.3.5: Mount where quiz.avgScore is null/undefined -> picks up analytics.avgScore
    {
      api.get = async (url) => {
        if (url === '/quiz/quiz_analytics_score') {
          return { data: { data: { quiz: { _id: 'quiz_analytics_score', title: 'Analytics Score Quiz', isChallenge: false, questionCount: 10 } } } };
        }
        if (url === '/quiz/quiz_analytics_score/analytics') {
          return { data: { data: { analytics: { avgScore: 89, totalAttempts: 4 } } } };
        }
        if (url === '/quiz/quiz_analytics_score/attempts') {
          return { data: { data: { attempts: [], pagination: { total: 0 } } } };
        }
        throw new Error('Unexpected URL: ' + url);
      };

      const { container, unmount } = render(
        React.createElement(MemoryRouter, null,
          React.createElement(QuizDetailsModal, { quizId: 'quiz_analytics_score', onClose: () => {} })
        )
      );

      await waitFor(() => {
        const grid = container.querySelector('.quiz-stat-grid');
        if (!grid) throw new Error('Stat grid not yet rendered');
      });

      const statCards = Array.from(container.querySelectorAll('.quiz-stat-card'));
      const scoreCard = statCards.find(c => c.textContent.includes('Average Score'));
      assert(scoreCard && scoreCard.textContent.includes('89%'), 'Case 4.3.5: Picks up analytics.avgScore (89%) when quiz.avgScore is unset');
      unmount();
      cleanup();
    }
  } finally {
    await viteServer.close();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================================');
  console.log('                 CHALLENGER STRESS TEST SUMMARY                       ');
  console.log('======================================================================');
  console.log(`  Total Invariants Tested : ${totalTests}`);
  console.log(`  Passed                  : ${passedTests}`);
  console.log(`  Failed                  : ${failedTests}`);
  console.log(`  Pass Rate               : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    console.error(`FAILED with ${failedTests} failure(s):`);
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('✔ ALL EMPIRICAL CHALLENGES AND INVARIANTS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runAllSuites().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
