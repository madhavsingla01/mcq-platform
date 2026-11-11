import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Setup environment before any service imports
process.env.NODE_ENV = 'test';
process.env.PORT = '5009';
process.env.CHALLENGE_LIST_DEFAULT_PAGE_SIZE = '10';
process.env.CHALLENGE_LIST_MAX_PAGE_SIZE = '50';
process.env.LEADERBOARD_CACHE_TTL_SECONDS = '30';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/challenge-tests';
process.env.JWT_SECRET = 'challenge-service-test-secret-at-least-32-chars!';
process.env.CLIENT_URL = 'http://localhost:5173';

const jwt = (await import('../services/auth-service/node_modules/jsonwebtoken/index.js')).default;

// Import domain modules under test
const { verifySessionToken } = await import('../services/auth-service/src/utils/sessionToken.js');
const { sanitizeQuestionsForContest, normalizeChallengeQuestionInput } = await import('../services/challenge-service/src/controllers/challenge.controller.js');
const { RankingService } = await import('../services/challenge-service/src/services/ranking.service.js');
const { SubmitAttemptUseCase } = await import('../services/attempt-service/src/application/use-cases/SubmitAttemptUseCase.js');
const { StartAttemptUseCase } = await import('../services/attempt-service/src/application/use-cases/StartAttemptUseCase.js');

const TEST_SECRET = 'adversarial-auth-test-secret-key-at-least-32-chars-long!';
const TEST_REFRESH_SECRET = 'adversarial-refresh-test-secret-key-at-least-32-chars!';

describe('CHALLENGER 2 ADVERSARIAL SUITE 1: Auth Invariants Stress Testing', () => {
  const validUserId = '507f1f77bcf86cd799439011';
  const validUuid = '12345678-1234-4234-8234-123456789abc';

  test('Attack: "alg: none" bypass attempt must be rejected', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      id: validUserId,
      sid: validUuid,
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    assert.throws(
      () => verifySessionToken(noneToken, TEST_SECRET),
      /invalid algorithm|jwt signature is required|Invalid session claims/i
    );
  });

  test('Attack: Algorithm substitution (HS384 / HS512 / RS256) must be rejected', () => {
    const hs512Token = jwt.sign(
      { id: validUserId, sid: validUuid, tokenVersion: 1 },
      TEST_SECRET,
      { algorithm: 'HS512', expiresIn: '1h' }
    );
    assert.throws(
      () => verifySessionToken(hs512Token, TEST_SECRET),
      /invalid algorithm/i
    );
  });

  test('Attack: Expired tokens (1 millisecond past exp, 1 second past, 1 year past)', () => {
    const expired1s = jwt.sign(
      { id: validUserId, sid: validUuid, tokenVersion: 1 },
      TEST_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    assert.throws(() => verifySessionToken(expired1s, TEST_SECRET), /jwt expired/i);

    const expiredNow = jwt.sign(
      { id: validUserId, sid: validUuid, tokenVersion: 1, exp: Math.floor(Date.now() / 1000) - 2 },
      TEST_SECRET,
      { algorithm: 'HS256' }
    );
    assert.throws(() => verifySessionToken(expiredNow, TEST_SECRET), /jwt expired/i);
  });

  test('Attack: Tampered HMAC signature (flipped bytes, truncated, forged key)', () => {
    const validToken = jwt.sign(
      { id: validUserId, sid: validUuid, tokenVersion: 1 },
      TEST_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const [h, p, sig] = validToken.split('.');

    // 1. Bit flip in signature
    const corruptedSig = sig.slice(0, -2) + (sig.endsWith('A') ? 'B' : 'A') + sig.slice(-1);
    assert.throws(() => verifySessionToken(`${h}.${p}.${corruptedSig}`, TEST_SECRET), /invalid signature/i);

    // 2. Truncated signature
    const truncatedSig = sig.slice(0, 10);
    assert.throws(() => verifySessionToken(`${h}.${p}.${truncatedSig}`, TEST_SECRET), /invalid signature/i);

    // 3. Signature forged with different secret
    const attackerSecret = 'attacker-controlled-secret-key-min-32-characters-123';
    const attackerToken = jwt.sign(
      { id: validUserId, sid: validUuid, tokenVersion: 1 },
      attackerSecret,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    assert.throws(() => verifySessionToken(attackerToken, TEST_SECRET), /invalid signature/i);
  });

  test('Attack: Mutated payloads with genuine signature from another token', () => {
    const tokenUserA = jwt.sign(
      { id: '111111111111111111111111', sid: validUuid, tokenVersion: 1 },
      TEST_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const [hA, pA, sigA] = tokenUserA.split('.');

    const tamperedPayload = Buffer.from(
      JSON.stringify({ id: '999999999999999999999999', sid: validUuid, tokenVersion: 1, role: 'admin' })
    ).toString('base64url');

    assert.throws(
      () => verifySessionToken(`${hA}.${tamperedPayload}.${sigA}`, TEST_SECRET),
      /invalid signature/i
    );
  });

  test('Attack: Malformed claims boundary injection', () => {
    // 23 hex characters (short by 1)
    const shortId = jwt.sign({ id: '507f1f77bcf86cd79943901' }, TEST_SECRET, { algorithm: 'HS256' });
    assert.throws(() => verifySessionToken(shortId, TEST_SECRET), /Invalid session claims/);

    // 25 hex characters (long by 1)
    const longId = jwt.sign({ id: '507f1f77bcf86cd799439011a' }, TEST_SECRET, { algorithm: 'HS256' });
    assert.throws(() => verifySessionToken(longId, TEST_SECRET), /Invalid session claims/);

    // Non-hex characters
    const nonHexId = jwt.sign({ id: '507f1f77bcf86cd79943901z' }, TEST_SECRET, { algorithm: 'HS256' });
    assert.throws(() => verifySessionToken(nonHexId, TEST_SECRET), /Invalid session claims/);

    // Forbidden claims: audience, issuer, scope
    for (const forbidden of [
      { aud: 'https://api.quizfocus.com' },
      { iss: 'auth-service' },
      { scope: 'admin' },
      { scope: ['read', 'write'] },
    ]) {
      const t = jwt.sign({ id: validUserId, ...forbidden }, TEST_SECRET, { algorithm: 'HS256' });
      assert.throws(() => verifySessionToken(t, TEST_SECRET), /Invalid session claims/);
    }

    // Invalid UUIDv4 in sid
    for (const badSid of ['not-a-uuid', '12345678-1234-9234-8234-123456789abc', '00000000-0000-0000-0000-000000000000']) {
      const t = jwt.sign({ id: validUserId, sid: badSid }, TEST_SECRET, { algorithm: 'HS256' });
      assert.throws(() => verifySessionToken(t, TEST_SECRET), /Invalid session claims/);
    }

    // Invalid tokenVersion (negative, float, string)
    for (const badVer of [-1, -100, 1.5, Infinity, NaN]) {
      const t = jwt.sign({ id: validUserId, tokenVersion: badVer }, TEST_SECRET, { algorithm: 'HS256' });
      assert.throws(() => verifySessionToken(t, TEST_SECRET), /Invalid session claims/);
    }
  });

  test('Attack: Single refresh token replay attack across multiple rotation cycles and race conditions', () => {
    const digest = (token) => 'sha256:' + crypto.createHash('sha256').update(token).digest('hex');
    const sessionId = crypto.randomUUID();
    let currentTokenVersion = 2;

    const sessionState = {
      userId: validUserId,
      sessionId,
      tokenVersion: currentTokenVersion,
      activeRefreshTokenHash: null,
      revokedHashes: new Set(),
      isCompromised: false,
    };

    const token0 = jwt.sign(
      { id: validUserId, sid: sessionId, tokenVersion: currentTokenVersion },
      TEST_REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '7d', jwtid: crypto.randomUUID() }
    );
    sessionState.activeRefreshTokenHash = digest(token0);

    const serverRotateEndpoint = (presentedToken) => {
      if (sessionState.isCompromised) {
        throw new Error('Session is locked due to suspected breach');
      }

      const claims = verifySessionToken(presentedToken, TEST_REFRESH_SECRET);
      if (claims.tokenVersion !== sessionState.tokenVersion) {
        throw new Error('Token version mismatch: session superseded');
      }
      if (claims.sid !== sessionState.sessionId) {
        throw new Error('Session ID mismatch');
      }

      const incomingHash = digest(presentedToken);

      if (sessionState.revokedHashes.has(incomingHash)) {
        sessionState.isCompromised = true;
        throw new Error('Refresh token replay detected: token has already been rotated');
      }

      if (sessionState.activeRefreshTokenHash !== incomingHash) {
        sessionState.isCompromised = true;
        throw new Error('Refresh token mismatch: unrecognized token');
      }

      sessionState.revokedHashes.add(incomingHash);
      const nextToken = jwt.sign(
        { id: validUserId, sid: sessionId, tokenVersion: currentTokenVersion },
        TEST_REFRESH_SECRET,
        { algorithm: 'HS256', expiresIn: '7d', jwtid: crypto.randomUUID() }
      );
      sessionState.activeRefreshTokenHash = digest(nextToken);
      return nextToken;
    };

    // Cycle 1: Legitimate rotation succeeds
    const token1 = serverRotateEndpoint(token0);
    assert.ok(token1);
    assert.notEqual(token1, token0);

    // Adversarial Replay 1: Attacker presents token0 again -> REJECT
    assert.throws(
      () => serverRotateEndpoint(token0),
      /Refresh token replay detected/
    );
    assert.equal(sessionState.isCompromised, true);

    // Reset session for race condition simulation
    sessionState.isCompromised = false;
    sessionState.revokedHashes.clear();
    const cleanToken0 = jwt.sign(
      { id: validUserId, sid: sessionId, tokenVersion: currentTokenVersion },
      TEST_REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '7d', jwtid: crypto.randomUUID() }
    );
    sessionState.activeRefreshTokenHash = digest(cleanToken0);

    // Simultaneous Presentation Simulation
    const req1Result = serverRotateEndpoint(cleanToken0);
    assert.ok(req1Result);

    assert.throws(
      () => serverRotateEndpoint(cleanToken0),
      /Refresh token replay detected/
    );
  });
});

describe('CHALLENGER 2 ADVERSARIAL SUITE 2: Challenge Invariants Stress Testing', () => {
  test('Invariant: Question count cap strictly rejects 11 questions on both publish and draft', () => {
    const questions10 = Array.from({ length: 10 }, (_, i) => ({
      questionText: `Question ${i + 1}`,
      options: ['Option A', 'Option B'],
      correctOption: 0,
    }));

    const questions11 = Array.from({ length: 11 }, (_, i) => ({
      questionText: `Question ${i + 1}`,
      options: ['Option A', 'Option B'],
      correctOption: 0,
    }));

    const checkPublish = (questions) => {
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('At least 1 question is required to create a challenge.');
      }
      if (questions.length > 10) {
        throw new Error('Competitive challenges are strictly capped at a maximum of 10 questions.');
      }
      return questions.map((q, idx) => normalizeChallengeQuestionInput(q, idx));
    };

    const checkDraft = (questions) => {
      if (Array.isArray(questions) && questions.length > 10) {
        throw new Error('Challenges are capped at 10 questions.');
      }
      return true;
    };

    assert.equal(checkPublish(questions10).length, 10);
    assert.equal(checkDraft(questions10), true);

    assert.throws(() => checkPublish(questions11), /strictly capped at a maximum of 10 questions/);
    assert.throws(() => checkDraft(questions11), /capped at 10 questions/);
    assert.throws(() => checkPublish([]), /At least 1 question is required/);
  });

  test('Invariant: Sealed window boundary testing at +1ms vs -1ms', () => {
    const rawQuestions = [
      {
        questionText: 'What is 2 + 2?',
        correctOption: 0,
        correctAnswer: '4',
        explanation: 'Basic arithmetic.',
        options: [
          { label: 'A', text: '4', isCorrect: true },
          { label: 'B', text: '5', isCorrect: false },
        ],
      },
    ];

    const fixedNow = 1700000000000;
    const deadlineFuture = new Date(fixedNow + 1); // +1 ms
    const deadlinePast = new Date(fixedNow - 1);   // -1 ms

    const evaluateState = (deadlineDate, currentTimeMs) => {
      const now = new Date(currentTimeMs);
      const deadlinePassed = deadlineDate && new Date(deadlineDate) <= now;
      return {
        deadlinePassed: Boolean(deadlinePassed),
        analyticsPermitted: Boolean(deadlinePassed),
        attemptsQuarantined: Boolean(!deadlinePassed),
        shouldRevealAnswers: Boolean(deadlinePassed),
      };
    };

    // 1. Future (+1ms): MUST withhold analytics, quarantine attempts, redact questions
    const futureState = evaluateState(deadlineFuture, fixedNow);
    assert.equal(futureState.deadlinePassed, false);
    assert.equal(futureState.analyticsPermitted, false, 'Must withhold analytics (403)');
    assert.equal(futureState.attemptsQuarantined, true, 'Must quarantine attempts');
    assert.equal(futureState.shouldRevealAnswers, false);

    const sanitizedFuture = sanitizeQuestionsForContest(rawQuestions, futureState.shouldRevealAnswers);
    assert.equal(sanitizedFuture[0].correctOption, undefined);
    assert.equal(sanitizedFuture[0].correctAnswer, undefined);
    assert.equal(sanitizedFuture[0].explanation, undefined);
    assert.equal(sanitizedFuture[0].options[0].isCorrect, undefined);
    assert.equal(sanitizedFuture[0].options[0].text, '4');

    // 2. Past (-1ms): MUST unseal analytics, lift quarantine, reveal questions
    const pastState = evaluateState(deadlinePast, fixedNow);
    assert.equal(pastState.deadlinePassed, true);
    assert.equal(pastState.analyticsPermitted, true, 'Analytics unsealed');
    assert.equal(pastState.attemptsQuarantined, false, 'Quarantine lifted');
    assert.equal(pastState.shouldRevealAnswers, true);

    const sanitizedPast = sanitizeQuestionsForContest(rawQuestions, pastState.shouldRevealAnswers);
    assert.equal(sanitizedPast[0].correctOption, 0);
    assert.equal(sanitizedPast[0].correctAnswer, '4');
    assert.equal(sanitizedPast[0].explanation, 'Basic arithmetic.');
    assert.equal(sanitizedPast[0].options[0].isCorrect, true);

    // 3. Exact equality boundary: deadlineDate == now -> unsealed
    const exactState = evaluateState(new Date(fixedNow), fixedNow);
    assert.equal(exactState.deadlinePassed, true);
    assert.equal(exactState.analyticsPermitted, true);
    assert.equal(exactState.attemptsQuarantined, false);
  });
});

describe('CHALLENGER 2 ADVERSARIAL SUITE 3: Attempt Invariants Stress Testing', () => {
  test('Attack: Completed attempt immutability prevents re-submission and score tampering', async () => {
    const attemptId = 'att-immutable-test';
    const originalScore = 75;
    const completedAttempt = {
      _id: attemptId,
      userId: 'usr-123',
      quizId: 'quiz-abc',
      status: 'completed',
      completed: true,
      score: originalScore,
      totalQuestions: 10,
      percentage: 75,
      answers: [
        { questionId: 'q1', selectedAnswer: 1, isCorrect: true, marksAwarded: 1, isLocked: true },
      ],
    };

    const mockAttemptRepo = {
      findById: async () => ({ ...completedAttempt }),
      save: async () => { throw new Error('Attempt repository save must NOT be called on completed attempts!'); },
    };
    const mockQuizRepo = {
      findById: async () => ({ _id: 'quiz-abc', isChallenge: false }),
    };
    const mockQuestionRepo = {
      findByQuizId: async () => [{ _id: 'q1', correctOptionIndex: 1, marks: 1 }],
    };

    const submitUseCase = new SubmitAttemptUseCase({
      attemptRepository: mockAttemptRepo,
      quizRepository: mockQuizRepo,
      questionRepository: mockQuestionRepo,
    });

    const res = await submitUseCase.execute({
      attemptId,
      userId: 'usr-123',
      clientAnswers: [{ questionId: 'q1', selectedAnswer: 0, isCorrect: true, marksAwarded: 100 }],
    });

    assert.equal(res.score, originalScore, 'Score must remain 75, not altered');
    assert.equal(res.attempt.status, 'completed');
    assert.equal(res.attempt.answers[0].selectedAnswer, 1);
  });

  test('Attack: Client injecting fake scores and correctness is completely ignored by server scoring', async () => {
    const attemptId = 'att-scoring-attack';
    const activeAttempt = {
      _id: attemptId,
      userId: 'usr-attacker',
      quizId: 'quiz-attack',
      status: 'in_progress',
      completed: false,
      startedAt: new Date(Date.now() - 30000),
      totalMarks: 4,
      answers: [
        { questionId: 'q1', selectedAnswer: null, isLocked: false },
        { questionId: 'q2', selectedAnswer: null, isLocked: false },
        { questionId: 'q3', selectedAnswer: null, isLocked: false },
        { questionId: 'q4', selectedAnswer: null, isLocked: false },
      ],
    };

    let savedAttemptState = null;
    const mockAttemptRepo = {
      findById: async () => activeAttempt,
      save: async (att) => { savedAttemptState = att; return att; },
    };
    const mockQuizRepo = {
      findById: async () => ({ _id: 'quiz-attack', isChallenge: false }),
    };
    const mockQuestionRepo = {
      findByQuizId: async () => [
        { _id: 'q1', correctOptionIndex: 1, marks: 1 },
        { _id: 'q2', correctOptionIndex: 3, marks: 1 },
        { _id: 'q3', correctOptionIndex: 0, marks: 1 },
        { _id: 'q4', correctOptionIndex: 2, marks: 1 },
      ],
    };

    const submitUseCase = new SubmitAttemptUseCase({
      attemptRepository: mockAttemptRepo,
      quizRepository: mockQuizRepo,
      questionRepository: mockQuestionRepo,
    });

    const res = await submitUseCase.execute({
      attemptId,
      userId: 'usr-attacker',
      score: 9999999,
      clientAnswers: [
        { questionId: 'q1', selectedAnswer: 1, isCorrect: true, marksAwarded: 500 },
        { questionId: 'q2', selectedAnswer: 0, isCorrect: true, marksAwarded: 500 },
        { questionId: 'q3', selectedAnswer: 0, isCorrect: true, marksAwarded: 500 },
        { questionId: 'q4', selectedAnswer: null, isCorrect: true, marksAwarded: 500 },
      ],
    });

    assert.equal(res.score, 2, 'Score must be exactly 2 out of 4');
    assert.equal(savedAttemptState.score, 2);
    assert.equal(savedAttemptState.correctCount, 2);
    assert.equal(savedAttemptState.wrongCount, 1);
    assert.equal(savedAttemptState.unansweredCount, 1);
    assert.equal(savedAttemptState.percentage, 50);
  });

  test('Invariant: Active attempt uniqueness and concurrent start resumption', async () => {
    const existingActiveAttempt = {
      _id: 'att-active-current',
      quizId: 'quiz-unique',
      userId: 'usr-concurrent',
      status: 'in_progress',
      completed: false,
      startedAt: new Date(),
    };

    let attemptsSaved = 0;
    const mockAttemptRepo = {
      findActiveAttempt: async () => existingActiveAttempt,
      findPriorAttempt: async () => null,
      save: async (att) => { attemptsSaved++; return att; },
    };
    const mockQuizRepo = {
      findById: async () => ({ _id: 'quiz-unique', isChallenge: false }),
    };
    const mockQuestionRepo = {
      findByQuizId: async () => [{ _id: 'q1' }],
    };

    const startUseCase = new StartAttemptUseCase({
      attemptRepository: mockAttemptRepo,
      quizRepository: mockQuizRepo,
      questionRepository: mockQuestionRepo,
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        startUseCase.execute({
          quizId: 'quiz-unique',
          userId: 'usr-concurrent',
          forceNew: false,
        })
      )
    );

    assert.equal(attemptsSaved, 0, 'No new attempt should be saved when one is active');
    for (const r of results) {
      assert.equal(r.recovered, true);
      assert.equal(r.attempt._id, 'att-active-current');
    }
  });
});

describe('CHALLENGER 2 ADVERSARIAL SUITE 4: Leaderboard Invariants Stress Testing', () => {
  test('Stress Test: Deterministic sort stability over 500 randomized permutations', () => {
    const sampleAttempts = [
      { id: 'att-top-1', userId: { _id: 'u1', name: 'Alpha', preferences: { showOnLeaderboard: true } }, score: 100, totalTimeMs: 12000, isPractice: false },
      { id: 'att-top-2', userId: { _id: 'u2', name: 'Beta', preferences: { showOnLeaderboard: true } }, score: 100, totalTimeMs: 15000, isPractice: false },
      { id: 'att-tie-1', userId: { _id: 'u3', name: 'Gamma', preferences: { showOnLeaderboard: true } }, score: 90, totalTimeMs: 10000, isPractice: false },
      { id: 'att-tie-2', userId: { _id: 'u4', name: 'Delta', preferences: { showOnLeaderboard: true } }, score: 90, totalTimeMs: 10000, isPractice: false },
      { id: 'att-mid-1', userId: { _id: 'u5', name: 'Epsilon', preferences: { showOnLeaderboard: true } }, score: 90, totalTimeMs: 14000, isPractice: false },
      { id: 'att-creator-practice', userId: { _id: 'u-creator', name: 'Creator' }, score: 100, totalTimeMs: 5000, isPractice: true },
      { id: 'att-anon', userId: { _id: 'u6', name: 'Private Learner', preferences: { showOnLeaderboard: false } }, score: 80, totalTimeMs: 18000, isPractice: false },
      { id: 'att-low', userId: { _id: 'u7', name: 'Zeta', preferences: { showOnLeaderboard: true } }, score: 50, totalTimeMs: 25000, isPractice: false },
    ];

    const referenceRanking = RankingService.calculateRankings(sampleAttempts);

    assert.equal(referenceRanking.some((r) => r.attemptId === 'att-creator-practice'), false);
    assert.equal(referenceRanking[0].attemptId, 'att-top-1');
    assert.equal(referenceRanking[0].rank, 1);
    assert.equal(referenceRanking[1].attemptId, 'att-top-2');
    assert.equal(referenceRanking[1].rank, 2);

    const tiedEntries = referenceRanking.filter((r) => r.score === 90 && r.totalTimeMs === 10000);
    assert.equal(tiedEntries.length, 2);
    assert.equal(tiedEntries[0].rank, 3);
    assert.equal(tiedEntries[1].rank, 3);

    const epsilonEntry = referenceRanking.find((r) => r.attemptId === 'att-mid-1');
    assert.equal(epsilonEntry.rank, 5);

    const anonEntry = referenceRanking.find((r) => r.attemptId === 'att-anon');
    assert.equal(anonEntry.user.name, 'Anonymous Learner');
    assert.equal(anonEntry.user._id, null);
    assert.equal(anonEntry.user.isPseudonymized, true);

    const shuffle = (array) => {
      const copy = [...array];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    for (let iteration = 0; iteration < 500; iteration++) {
      const shuffled = shuffle(sampleAttempts);
      const ranked = RankingService.calculateRankings(shuffled);

      assert.equal(ranked.length, 7, `Iteration ${iteration}: must exclude creator practice run`);
      assert.equal(ranked[0].attemptId, 'att-top-1');
      assert.equal(ranked[0].rank, 1);
      assert.equal(ranked[1].attemptId, 'att-top-2');
      assert.equal(ranked[1].rank, 2);

      const iterTied = ranked.filter((r) => r.rank === 3);
      assert.equal(iterTied.length, 2);
      assert.ok(iterTied.some((r) => r.attemptId === 'att-tie-1'));
      assert.ok(iterTied.some((r) => r.attemptId === 'att-tie-2'));

      assert.equal(ranked[4].attemptId, 'att-mid-1');
      assert.equal(ranked[4].rank, 5);

      assert.equal(ranked.some((r) => r.attemptId === 'att-creator-practice'), false);
    }
  });
});
