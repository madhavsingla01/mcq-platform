import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '5009';
process.env.CHALLENGE_LIST_DEFAULT_PAGE_SIZE = '10';
process.env.CHALLENGE_LIST_MAX_PAGE_SIZE = '50';
process.env.LEADERBOARD_CACHE_TTL_SECONDS = '30';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/challenge-tests';
process.env.JWT_SECRET = 'challenge-service-test-secret-at-least-32-chars!';
process.env.CLIENT_URL = 'http://localhost:5173';

const { RankingService } = await import('../../services/challenge-service/src/services/ranking.service.js');
const { memoryCache } = await import('../../services/challenge-service/src/services/cache.service.js');

test('leaderboard invariant: quarantined attempts and creator practice runs excluded from active challenge public leaderboards', () => {
  const challenge = {
    _id: 'ch-active-1',
    isChallenge: true,
    deadlineAt: new Date(Date.now() + 7200000).toISOString(), // Active (in future)
  };

  const getPublicLeaderboardData = (challengeDoc, allAttempts = [], now = new Date()) => {
    const isDeadlinePassed = challengeDoc.deadlineAt && new Date(challengeDoc.deadlineAt) <= now;
    if (challengeDoc.isChallenge && !isDeadlinePassed) {
      // Quarantine enforcement
      return {
        quarantined: true,
        leaderboard: [],
        message: 'Leaderboard and ranks are quarantined until the finalization deadline.',
      };
    }

    // Ended challenge: exclude in-progress and practice attempts
    const eligibleAttempts = allAttempts.filter(
      (a) => a.status === 'completed' && !a.isPractice && a.userId
    );
    return {
      quarantined: false,
      leaderboard: RankingService.calculateRankings(eligibleAttempts),
    };
  };

  // 1. When challenge is active: quarantined = true, leaderboard = empty
  const activeResult = getPublicLeaderboardData(challenge, [
    { _id: 'att-1', status: 'completed', score: 100, isPractice: false },
  ]);
  assert.equal(activeResult.quarantined, true);
  assert.deepEqual(activeResult.leaderboard, []);

  // 2. When challenge has concluded: practice attempts and in-progress attempts excluded
  const concludedChallenge = {
    ...challenge,
    deadlineAt: new Date(Date.now() - 1000).toISOString(),
  };

  const rawAttempts = [
    {
      _id: 'att-practice',
      userId: { _id: 'u-creator', name: 'Creator', preferences: { showOnLeaderboard: true } },
      score: 100,
      totalTimeMs: 10000,
      status: 'completed',
      isPractice: true, // Practice run
    },
    {
      _id: 'att-inprogress',
      userId: { _id: 'u-user1', name: 'User 1', preferences: { showOnLeaderboard: true } },
      score: 95,
      totalTimeMs: 20000,
      status: 'in_progress', // Not yet completed
      isPractice: false,
    },
    {
      _id: 'att-valid',
      userId: { _id: 'u-user2', name: 'User 2', preferences: { showOnLeaderboard: true } },
      score: 90,
      totalTimeMs: 25000,
      status: 'completed',
      isPractice: false,
    },
    {
      _id: 'att-private',
      userId: { _id: 'u-private', name: 'Private User', preferences: { showOnLeaderboard: false } },
      score: 85,
      totalTimeMs: 30000,
      status: 'completed',
      isPractice: false,
    },
  ];

  const concludedResult = getPublicLeaderboardData(concludedChallenge, rawAttempts);
  assert.equal(concludedResult.quarantined, false);
  assert.equal(concludedResult.leaderboard.length, 2);

  // Practice run and in-progress must NOT appear
  assert.equal(concludedResult.leaderboard.some((r) => r.attemptId === 'att-practice'), false);
  assert.equal(concludedResult.leaderboard.some((r) => r.attemptId === 'att-inprogress'), false);

  // User with preferences.showOnLeaderboard === false must be pseudonymized
  const privateEntry = concludedResult.leaderboard.find((r) => r.attemptId === 'att-private');
  assert.equal(privateEntry.user.name, 'Anonymous Learner');
  assert.equal(privateEntry.user.isPseudonymized, true);
  assert.equal(privateEntry.user._id, null);
});

test('leaderboard invariant: deterministic sort stability across arbitrary input ordering', () => {
  const attemptPool = [
    { id: 'u1', userId: { _id: 'u1', name: 'Alpha' }, score: 80, totalTimeMs: 15000, isPractice: false },
    { id: 'u2', userId: { _id: 'u2', name: 'Beta' }, score: 100, totalTimeMs: 12000, isPractice: false },
    { id: 'u3', userId: { _id: 'u3', name: 'Gamma' }, score: 90, totalTimeMs: 18000, isPractice: false },
    { id: 'u4', userId: { _id: 'u4', name: 'Delta' }, score: 90, totalTimeMs: 14000, isPractice: false }, // faster than Gamma
    { id: 'u5', userId: { _id: 'u5', name: 'Epsilon' }, score: 90, totalTimeMs: 14000, isPractice: false }, // exact tie with Delta
  ];

  // Test deterministic stability with original order
  const rankings1 = RankingService.calculateRankings([...attemptPool]);

  // Test deterministic stability with reversed input order
  const rankings2 = RankingService.calculateRankings([...attemptPool].reverse());

  // Invariant 1: Top rank is Beta (100 pts)
  assert.equal(rankings1[0].attemptId, 'u2');
  assert.equal(rankings1[0].rank, 1);
  assert.equal(rankings2[0].attemptId, 'u2');
  assert.equal(rankings2[0].rank, 1);

  // Invariant 2: Rank 2 is tied between Delta and Epsilon (90 pts, 14000ms)
  const rank2Entries1 = rankings1.filter((r) => r.rank === 2);
  const rank2Entries2 = rankings2.filter((r) => r.rank === 2);
  assert.equal(rank2Entries1.length, 2);
  assert.equal(rank2Entries2.length, 2);
  assert.ok(rank2Entries1.some((r) => r.attemptId === 'u4'));
  assert.ok(rank2Entries1.some((r) => r.attemptId === 'u5'));

  // Invariant 3: Rank 4 is Gamma (90 pts, 18000ms) - competition ranking skips rank 3 due to tie
  const gammaEntry = rankings1.find((r) => r.attemptId === 'u3');
  assert.equal(gammaEntry.rank, 4);

  // Invariant 4: Rank 5 is Alpha (80 pts, 15000ms)
  const alphaEntry = rankings1.find((r) => r.attemptId === 'u1');
  assert.equal(alphaEntry.rank, 5);
});

test('leaderboard invariant: cache coherence, TTL expiration, and invalidation', async () => {
  const cacheKey = 'challenge_leaderboard:coherent-test-key-1';
  const leaderboardPayload = [
    { rank: 1, attemptId: 'att-1', score: 100 },
    { rank: 2, attemptId: 'att-2', score: 90 },
  ];

  // 1. Initial set & immediate get
  memoryCache.set(cacheKey, leaderboardPayload, 1); // 1 second TTL
  const cachedImmediate = memoryCache.get(cacheKey);
  assert.deepEqual(cachedImmediate, leaderboardPayload);

  // 2. Explicit cache invalidation (e.g. on new submission or recalculation)
  memoryCache.del(cacheKey);
  const afterInvalidation = memoryCache.get(cacheKey);
  assert.equal(afterInvalidation, null, 'Cache must return null after explicit invalidation');

  // 3. TTL expiration
  const shortKey = 'challenge_leaderboard:short-ttl-key';
  memoryCache.set(shortKey, leaderboardPayload, 0.1); // 100ms TTL
  assert.deepEqual(memoryCache.get(shortKey), leaderboardPayload);

  await new Promise((resolve) => setTimeout(resolve, 150));
  const afterTtl = memoryCache.get(shortKey);
  assert.equal(afterTtl, null, 'Cache must expire and return null once TTL passes');
});
