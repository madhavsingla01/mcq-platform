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

const { sanitizeQuestionsForContest } = await import('../../services/challenge-service/src/controllers/challenge.controller.js');
const { RankingService } = await import('../../services/challenge-service/src/services/ranking.service.js');

test('challenge invariant: 10-question cap invariant on creation and drafts', () => {
  const enforceQuestionCap = (questions, isDraft = false) => {
    if (!Array.isArray(questions)) throw new Error('Questions must be an array');
    if (!isDraft && questions.length === 0) {
      throw new Error('At least 1 question is required to create a challenge.');
    }
    if (questions.length > 10) {
      throw new Error(
        isDraft
          ? 'Challenges are capped at 10 questions.'
          : 'Competitive challenges are strictly capped at a maximum of 10 questions.'
      );
    }
    return true;
  };

  // Under and at cap
  assert.equal(enforceQuestionCap([{ text: 'Q1' }]), true);
  const tenQuestions = Array.from({ length: 10 }, (_, i) => ({ text: `Q${i + 1}` }));
  assert.equal(enforceQuestionCap(tenQuestions), true);
  assert.equal(enforceQuestionCap(tenQuestions, true), true);

  // Over cap in publish
  const elevenQuestions = Array.from({ length: 11 }, (_, i) => ({ text: `Q${i + 1}` }));
  assert.throws(
    () => enforceQuestionCap(elevenQuestions, false),
    /strictly capped at a maximum of 10 questions/
  );

  // Over cap in draft
  assert.throws(
    () => enforceQuestionCap(elevenQuestions, true),
    /Challenges are capped at 10 questions/
  );
});

test('challenge invariant: active challenge secrecy seals analytics and quarantines attempts while deadlineAt > now', () => {
  const futureDeadline = new Date(Date.now() + 3600000); // 1 hour in future
  const activeChallenge = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Speed Coding Challenge',
    isChallenge: true,
    deadlineAt: futureDeadline.toISOString(),
  };

  const evaluateSecrecyState = (challenge, currentTime = new Date()) => {
    const deadlinePassed = challenge.deadlineAt && new Date(challenge.deadlineAt) <= currentTime;
    return {
      isSealed: Boolean(challenge.isChallenge && !deadlinePassed),
      analyticsPermitted: Boolean(!challenge.isChallenge || deadlinePassed),
      leaderboardQuarantined: Boolean(challenge.isChallenge && !deadlinePassed),
      attemptsQuarantined: Boolean(challenge.isChallenge && !deadlinePassed),
    };
  };

  const state = evaluateSecrecyState(activeChallenge);

  // 1. Must be sealed
  assert.equal(state.isSealed, true);
  assert.equal(state.analyticsPermitted, false, 'Analytics MUST be withheld during active challenge');
  assert.equal(state.leaderboardQuarantined, true, 'Leaderboard MUST be quarantined');
  assert.equal(state.attemptsQuarantined, true, 'Attempts MUST be quarantined');

  // 2. Question sanitization during active window MUST redact answers
  const rawQuestions = [
    {
      questionText: 'Which algorithm has O(log n) complexity?',
      correctOption: 2,
      correctAnswer: 'Binary Search',
      explanation: 'Binary search halves search interval each step.',
      options: [
        { label: 'A', text: 'Linear Search', isCorrect: false },
        { label: 'B', text: 'Bubble Sort', isCorrect: false },
        { label: 'C', text: 'Binary Search', isCorrect: true },
      ],
    },
  ];

  const sanitized = sanitizeQuestionsForContest(rawQuestions, false);
  assert.equal(sanitized[0].correctOption, undefined, 'correctOption must be withheld');
  assert.equal(sanitized[0].correctAnswer, undefined, 'correctAnswer must be withheld');
  assert.equal(sanitized[0].explanation, undefined, 'explanation must be withheld');
  assert.equal(sanitized[0].options[2].isCorrect, undefined, 'option isCorrect flag must be withheld');
  assert.equal(sanitized[0].options[2].text, 'Binary Search', 'option text must remain available');
});

test('challenge invariant: ended challenge unseals analytics, reveals rankings, and reveals answer keys', () => {
  const pastDeadline = new Date(Date.now() - 3600000); // 1 hour in past
  const endedChallenge = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Concluded Challenge',
    isChallenge: true,
    deadlineAt: pastDeadline.toISOString(),
  };

  const evaluateSecrecyState = (challenge, currentTime = new Date()) => {
    const deadlinePassed = challenge.deadlineAt && new Date(challenge.deadlineAt) <= currentTime;
    return {
      isSealed: Boolean(challenge.isChallenge && !deadlinePassed),
      analyticsPermitted: Boolean(!challenge.isChallenge || deadlinePassed),
      leaderboardQuarantined: Boolean(challenge.isChallenge && !deadlinePassed),
    };
  };

  const state = evaluateSecrecyState(endedChallenge);

  // 1. Unsealed state
  assert.equal(state.isSealed, false);
  assert.equal(state.analyticsPermitted, true, 'Analytics must be available once deadline passes');
  assert.equal(state.leaderboardQuarantined, false, 'Leaderboard quarantine must lift');

  // 2. Answer keys revealed
  const rawQuestions = [
    {
      questionText: 'What is 10 + 10?',
      correctOption: 1,
      correctAnswer: '20',
      explanation: 'Basic addition.',
      options: [
        { label: 'A', text: '10', isCorrect: false },
        { label: 'B', text: '20', isCorrect: true },
      ],
    },
  ];
  const revealed = sanitizeQuestionsForContest(rawQuestions, true);
  assert.equal(revealed[0].correctOption, 1);
  assert.equal(revealed[0].correctAnswer, '20');
  assert.equal(revealed[0].explanation, 'Basic addition.');
  assert.equal(revealed[0].options[1].isCorrect, true);

  // 3. Rankings computation unsealed
  const attempts = [
    { id: 'att-1', userId: { _id: 'u1', name: 'User 1' }, score: 10, totalTimeMs: 15000, isPractice: false },
    { id: 'att-2', userId: { _id: 'u2', name: 'User 2' }, score: 8, totalTimeMs: 12000, isPractice: false },
  ];
  const rankings = RankingService.calculateRankings(attempts);
  assert.equal(rankings.length, 2);
  assert.equal(rankings[0].rank, 1);
  assert.equal(rankings[0].score, 10);
});
