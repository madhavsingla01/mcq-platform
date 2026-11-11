/**
 * Empirical Adversarial Test Suite: Milestone 1 Quiz Analytics 403 & Route Parity
 *
 * Verifies backend route changes and invariants:
 * 1. Test both `/api/v1/quiz/:id/analytics` AND `/api/v1/quizzes/:id/analytics`.
 * 2. Verify non-existent quiz ID produces 404 (or invalid ObjectId produces 400).
 * 3. Verify active sealed challenge produces 403 Forbidden with:
 *    `{ success: false, message: 'Challenge results are sealed until the deadline' }`.
 * 4. Verify standard unsealed quizzes or past-deadline challenges return 200 with analytics.
 * 5. Verify private quiz authorization boundaries (401 unauthenticated, 403 non-owner).
 * 6. Verify QuizDetailsModal frontend invariants:
 *    - Sequential fetch & seal evaluation
 *    - Suppression of analytics request on sealed challenge
 *    - Graceful error swallowing for 401/403
 *    - Stats computation fallback for avgScore
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Set required environment variables before importing quiz service modules
process.env.PORT = process.env.PORT || '5002';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform-test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.MAX_IMPORT_ROWS = process.env.MAX_IMPORT_ROWS || '1000';
process.env.CACHE_DEFAULT_TTL_MS = process.env.CACHE_DEFAULT_TTL_MS || '10000';
process.env.CACHE_SHORT_TTL_MS = process.env.CACHE_SHORT_TTL_MS || '5000';
process.env.CACHE_SEARCH_TTL_MS = process.env.CACHE_SEARCH_TTL_MS || '30000';

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
  assert(
    actual === expected,
    `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`
  );
}

function expectDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  assert(
    actualStr === expectedStr,
    `${message} (expected: ${expectedStr}, got: ${actualStr})`
  );
}

async function runEmpiricalSuite() {
  console.log('\n=================================================================');
  console.log('   EMPIRICAL CHALLENGER: MILESTONE 1 QUIZ ANALYTICS 403 SUITE    ');
  console.log('=================================================================\n');

  // Load Express & Quiz Service dependencies
  const expressModule = await import('../services/quiz-service/node_modules/express/index.js');
  const express = expressModule.default;

  const QuizModel = (await import('../services/quiz-service/src/models/Quiz.model.js')).default;
  const QuestionModel = (await import('../services/quiz-service/src/models/Question.model.js')).default;
  const AttemptModel = (await import('../services/quiz-service/src/models/Attempt.model.js')).default;

  const { errorHandler, notFoundHandler } = await import('../services/quiz-service/src/middleware/error.middleware.js');
  const quizRoutes = (await import('../services/quiz-service/src/routes/quiz.routes.js')).default;
  const quizzesRoutes = (await import('../services/quiz-service/src/routes/quizzes.routes.js')).default;

  // Setup Mock Database State
  const mockQuizzes = new Map();

  const VALID_UNSEALED_ID = '507f1f77bcf86cd799439011';
  const VALID_SEALED_CHALLENGE_ID = '507f1f77bcf86cd799439022';
  const VALID_CONCLUDED_CHALLENGE_ID = '507f1f77bcf86cd799439033';
  const VALID_PRIVATE_QUIZ_ID = '507f1f77bcf86cd799439044';
  const NON_EXISTENT_ID = '507f1f77bcf86cd799439099';

  mockQuizzes.set(VALID_UNSEALED_ID, {
    _id: VALID_UNSEALED_ID,
    title: 'Standard Unsealed Quiz',
    visibility: 'public',
    isChallenge: false,
    avgScore: 82.5,
    totalAttempts: 15,
  });

  mockQuizzes.set(VALID_SEALED_CHALLENGE_ID, {
    _id: VALID_SEALED_CHALLENGE_ID,
    title: 'Active Sealed Challenge',
    visibility: 'public',
    isChallenge: true,
    deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    avgScore: 75.0,
    totalAttempts: 40,
  });

  mockQuizzes.set(VALID_CONCLUDED_CHALLENGE_ID, {
    _id: VALID_CONCLUDED_CHALLENGE_ID,
    title: 'Concluded Challenge',
    visibility: 'public',
    isChallenge: true,
    deadlineAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    avgScore: 88.0,
    totalAttempts: 55,
  });

  mockQuizzes.set(VALID_PRIVATE_QUIZ_ID, {
    _id: VALID_PRIVATE_QUIZ_ID,
    title: 'Private Owner Quiz',
    visibility: 'private',
    uploader: '607f1f77bcf86cd799439001',
    isChallenge: false,
  });

  // Mock Mongoose Query Helpers
  QuizModel.findById = function (id) {
    const rawId = String(id);
    const doc = mockQuizzes.get(rawId) || null;
    return {
      select: function () { return this; },
      populate: function () { return this; },
      exec: async function () { return doc ? { ...doc } : null; },
      then: function (resolve) { return Promise.resolve(doc ? { ...doc } : null).then(resolve); }
    };
  };

  QuizModel.findOne = function (query) {
    return {
      select: function () { return this; },
      populate: function () { return this; },
      exec: async function () { return null; },
      then: function (resolve) { return Promise.resolve(null).then(resolve); }
    };
  };

  QuestionModel.find = function () {
    const mockQuestions = [
      {
        _id: 'q1',
        questionText: 'Mock question 1',
        options: [{ label: 'A', text: 'Opt A' }, { label: 'B', text: 'Opt B' }],
        correctAnswer: 'A',
        toObject: () => ({ _id: 'q1', questionText: 'Mock question 1' }),
      },
    ];
    return {
      select: function () { return this; },
      sort: function () { return this; },
      then: function (resolve) { return Promise.resolve(mockQuestions).then(resolve); }
    };
  };

  AttemptModel.find = function () {
    const mockAttempts = [
      {
        _id: 'att1',
        status: 'completed',
        score: 10,
        percentage: 100,
        totalTime: 60,
        totalTimeMs: 60000,
        isQuickMode: false,
        answers: [],
        analytics: {},
        completedAt: new Date(),
        createdAt: new Date(),
      },
    ];
    return {
      select: function () { return this; },
      sort: function () { return this; },
      limit: function () { return this; },
      lean: function () { return this; },
      then: function (resolve) { return Promise.resolve(mockAttempts).then(resolve); }
    };
  };

  // Build Express Application
  const app = express();
  app.use(express.json());

  // Mount routes matching server.js
  app.use('/api/v1/quiz', quizRoutes);
  app.use('/api/v1/quizzes', quizzesRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  console.log(`Ephemeral test server running at ${baseUrl}\n`);

  try {
    // =========================================================================
    // SUITE 1: Route Parity & Route Registration
    // =========================================================================
    console.log('--- Suite 1: Backend Route Registration & Parity ---');

    for (const base of ['/api/v1/quiz', '/api/v1/quizzes']) {
      console.log(`\nTesting prefix: ${base}`);

      // Test 1.1: Invalid ObjectId/Code produces 400 Bad Request
      const resInvalid = await fetch(`${baseUrl}${base}/invalid@id!#/analytics`);
      const dataInvalid = await resInvalid.json();
      expectEqual(resInvalid.status, 400, `${base}/:id/analytics with invalid ID returns 400`);
      expectEqual(dataInvalid.success, false, `${base} returns success: false for invalid ID`);
      expectEqual(dataInvalid.message, 'Invalid id', `${base} returns message: "Invalid id"`);

      // Test 1.2: Non-existent Quiz produces 404 Not Found
      const resNotFound = await fetch(`${baseUrl}${base}/${NON_EXISTENT_ID}/analytics`);
      const dataNotFound = await resNotFound.json();
      expectEqual(resNotFound.status, 404, `${base}/:id/analytics with non-existent ID returns 404`);
      expectEqual(dataNotFound.success, false, `${base} returns success: false for non-existent quiz`);
      expectEqual(dataNotFound.message, 'Quiz not found', `${base} returns message: "Quiz not found"`);

      // Test 1.3: Active Sealed Challenge produces 403 Forbidden with exact payload
      const resSealed = await fetch(`${baseUrl}${base}/${VALID_SEALED_CHALLENGE_ID}/analytics`);
      const dataSealed = await resSealed.json();
      expectEqual(resSealed.status, 403, `${base}/:id/analytics for sealed challenge returns 403`);
      expectEqual(dataSealed.success, false, `${base} sealed challenge returns success: false`);
      expectEqual(
        dataSealed.message,
        'Challenge results are sealed until the deadline',
        `${base} sealed challenge returns exact sealed message`
      );

      // Test 1.4: Concluded Challenge returns 200 with analytics
      const resConcluded = await fetch(`${baseUrl}${base}/${VALID_CONCLUDED_CHALLENGE_ID}/analytics`);
      const dataConcluded = await resConcluded.json();
      expectEqual(resConcluded.status, 200, `${base}/:id/analytics for concluded challenge returns 200`);
      expectEqual(dataConcluded.success, true, `${base} concluded challenge returns success: true`);
      assert(Boolean(dataConcluded.data?.analytics), `${base} concluded challenge contains analytics object`);
      assert(Boolean(dataConcluded.data?.quiz), `${base} concluded challenge contains quiz object`);

      // Test 1.5: Standard Unsealed Quiz returns 200 with analytics
      const resUnsealed = await fetch(`${baseUrl}${base}/${VALID_UNSEALED_ID}/analytics`);
      const dataUnsealed = await resUnsealed.json();
      expectEqual(resUnsealed.status, 200, `${base}/:id/analytics for standard quiz returns 200`);
      expectEqual(dataUnsealed.success, true, `${base} standard quiz returns success: true`);
      assert(Boolean(dataUnsealed.data?.analytics), `${base} standard quiz contains analytics object`);
      assert(Boolean(dataUnsealed.data?.quiz), `${base} standard quiz contains quiz object`);

      // Test 1.6: Private Quiz without authentication returns 401 Unauthorized
      const resPrivate = await fetch(`${baseUrl}${base}/${VALID_PRIVATE_QUIZ_ID}/analytics`);
      const dataPrivate = await resPrivate.json();
      expectEqual(resPrivate.status, 401, `${base}/:id/analytics for private quiz without auth returns 401`);
      expectEqual(dataPrivate.success, false, `${base} private quiz returns success: false`);
    }

    // =========================================================================
    // SUITE 2: Adversarial Stress & Edge Cases
    // =========================================================================
    console.log('\n--- Suite 2: Adversarial Stress & Boundary Cases ---');

    // 2.1 Boundary: Challenge deadline exactly at current timestamp
    const nowIso = new Date().toISOString();
    mockQuizzes.set('507f1f77bcf86cd799439055', {
      _id: '507f1f77bcf86cd799439055',
      title: 'Challenge at exact boundary',
      visibility: 'public',
      isChallenge: true,
      deadlineAt: nowIso,
    });
    const resExactDeadline = await fetch(`${baseUrl}/api/v1/quizzes/507f1f77bcf86cd799439055/analytics`);
    expectEqual(resExactDeadline.status, 200, 'Deadline <= Date.now() returns 200 (unsealed at boundary)');

    // 2.2 Boundary: Challenge deadline null or undefined
    mockQuizzes.set('507f1f77bcf86cd799439066', {
      _id: '507f1f77bcf86cd799439066',
      title: 'Challenge with null deadline',
      visibility: 'public',
      isChallenge: true,
      deadlineAt: null,
    });
    const resNullDeadline = await fetch(`${baseUrl}/api/v1/quizzes/507f1f77bcf86cd799439066/analytics`);
    const dataNullDeadline = await resNullDeadline.json();
    expectEqual(resNullDeadline.status, 403, 'Challenge with null deadline is treated as sealed (403)');
    expectEqual(dataNullDeadline.message, 'Challenge results are sealed until the deadline', 'Challenge with null deadline has correct error message');

    // 2.3 Boundary: Query parameters injection
    const resQueryParams = await fetch(`${baseUrl}/api/v1/quizzes/${VALID_SEALED_CHALLENGE_ID}/analytics?bypass=true&admin=1`);
    expectEqual(resQueryParams.status, 403, 'Query parameter injection does not bypass sealed status');

    // 2.4 Boundary: HTTP method safety (POST, PUT, DELETE to analytics endpoint)
    const resPost = await fetch(`${baseUrl}/api/v1/quizzes/${VALID_UNSEALED_ID}/analytics`, { method: 'POST' });
    expectEqual(resPost.status, 404, 'POST /quizzes/:id/analytics is not mapped (404)');

    const resPut = await fetch(`${baseUrl}/api/v1/quizzes/${VALID_UNSEALED_ID}/analytics`, { method: 'PUT' });
    expectEqual(resPut.status, 404, 'PUT /quizzes/:id/analytics is not mapped (404)');

    const resDelete = await fetch(`${baseUrl}/api/v1/quizzes/${VALID_UNSEALED_ID}/analytics`, { method: 'DELETE' });
    expectEqual(resDelete.status, 404, 'DELETE /quizzes/:id/analytics is not mapped (404)');

    // =========================================================================
    // SUITE 3: Frontend Invariants in QuizDetailsModal.jsx
    // =========================================================================
    console.log('\n--- Suite 3: Frontend QuizDetailsModal Invariants ---');

    const fs = await import('node:fs');
    const modalPath = path.join(ROOT_DIR, 'apps/desktop-web/src/components/QuizModal/QuizDetailsModal.jsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // 3.1 Verify sequential request pattern: /quiz/${quizId} is requested first
    assert(
      modalContent.includes('const quizResponse = await api.get(`/quiz/${quizId}`);'),
      'QuizDetailsModal fetches /quiz/:id first before secondary promises'
    );

    // 3.2 Verify sealed logic calculation
    assert(
      modalContent.includes('const isChallengeSealed = Boolean(') &&
      modalContent.includes('quizData?.isChallenge &&') &&
      modalContent.includes('!(quizData.deadlineAt && new Date(quizData.deadlineAt) <= new Date())'),
      'QuizDetailsModal implements exact sealed challenge deadline condition'
    );

    // 3.3 Verify conditional suppression of analytics request
    assert(
      modalContent.includes('if (!isChallengeSealed) {') &&
      modalContent.includes('secondaryPromises.push(') &&
      modalContent.includes('api.get(`/quiz/${quizId}/analytics`)'),
      'QuizDetailsModal strictly suppresses /analytics request when isChallengeSealed is true'
    );

    // 3.4 Verify graceful error catching for 403 and 401
    assert(
      modalContent.includes('if (status !== 403 && status !== 401) {') &&
      modalContent.includes("console.warn('Quiz analytics unavailable:', err);"),
      'QuizDetailsModal gracefully suppresses 403 and 401 analytics errors without setting user error state'
    );

    // 3.5 Verify quarantine fallback from attempts endpoint
    assert(
      modalContent.includes('if (attemptsData?.quarantined === true) {') &&
      modalContent.includes('setResultsSealed(true);'),
      'QuizDetailsModal sets resultsSealed if attempts endpoint returns quarantined: true'
    );

    // 3.6 Verify stats rendering with fallback to avgScore
    assert(
      modalContent.includes('quiz?.avgScore ?? analytics?.avgScore ?? analytics?.averageScore ?? 0'),
      'QuizDetailsModal correctly inspects quiz.avgScore, analytics.avgScore, and analytics.averageScore'
    );

    // 3.7 Verify .quiz-stat-grid is rendered when !resultsSealed
    assert(
      modalContent.includes('{!resultsSealed && (') &&
      modalContent.includes('className="quiz-stat-grid"'),
      'QuizDetailsModal renders .quiz-stat-grid conditionally when !resultsSealed'
    );

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\nEphemeral test server closed.');
  }

  // =========================================================================
  // EXECUTION SUMMARY
  // =========================================================================
  console.log('\n=================================================================');
  console.log('              EMPIRICAL TEST EXECUTION SUMMARY                   ');
  console.log('=================================================================');
  console.log(`  Total Tests Executed : ${totalTests}`);
  console.log(`  Passed               : ${passedTests}`);
  console.log(`  Failed               : ${failedTests}`);
  console.log(`  Pass Rate            : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('=================================================================\n');

  if (failedTests > 0) {
    console.error('FAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL TESTS PASSED CLEANLY!\n');
    process.exit(0);
  }
}

runEmpiricalSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
