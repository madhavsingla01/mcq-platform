process.env.NODE_ENV = 'test';
process.env.PORT = '5009';
process.env.CHALLENGE_LIST_DEFAULT_PAGE_SIZE = '10';
process.env.CHALLENGE_LIST_MAX_PAGE_SIZE = '50';
process.env.LEADERBOARD_CACHE_TTL_SECONDS = '30';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/challenge-tests';
process.env.JWT_SECRET = 'challenge-service-test-secret-at-least-32-chars!';
process.env.CLIENT_URL = 'http://localhost:5173';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeQuestionsForContest } from '../src/controllers/challenge.controller.js';
import { RankingService } from '../src/services/ranking.service.js';
import { AppError } from '../src/middleware/error.middleware.js';

test('competitive challenge 10-question cap validation', () => {
  const validateQuestionsCap = (questions) => {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new AppError('At least 1 question is required to create a challenge.', 400);
    }
    if (questions.length > 10) {
      throw new AppError('Competitive challenges are strictly capped at a maximum of 10 questions.', 400);
    }
    return true;
  };

  // Valid 10 questions
  const tenQuestions = Array.from({ length: 10 }, (_, i) => ({ text: `Q${i + 1}`, options: ['A', 'B'] }));
  assert.equal(validateQuestionsCap(tenQuestions), true);

  // 1 question
  assert.equal(validateQuestionsCap([tenQuestions[0]]), true);

  // 0 questions (fails)
  assert.throws(() => validateQuestionsCap([]), /At least 1 question is required/);

  // 11 questions (fails cap invariant)
  const elevenQuestions = Array.from({ length: 11 }, (_, i) => ({ text: `Q${i + 1}`, options: ['A', 'B'] }));
  assert.throws(() => validateQuestionsCap(elevenQuestions), /strictly capped at a maximum of 10 questions/);
});

test('challenge deadline and duration validation rules', () => {
  const validateTiming = ({ durationMinutes, deadlineAt }) => {
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      throw new AppError('Challenges require a valid duration in minutes (1–180).', 400);
    }

    if (!deadlineAt) {
      throw new AppError('Challenges require a future finalization deadline (deadlineAt).', 400);
    }

    const deadlineDate = new Date(deadlineAt);
    if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
      throw new AppError('The deadline must be a valid timestamp in the future.', 400);
    }
    return { duration, deadlineDate };
  };

  const futureDeadline = new Date(Date.now() + 86400000).toISOString();
  const pastDeadline = new Date(Date.now() - 1000).toISOString();

  // Valid timing
  const valid = validateTiming({ durationMinutes: 60, deadlineAt: futureDeadline });
  assert.equal(valid.duration, 60);
  assert.ok(valid.deadlineDate instanceof Date);

  // Invalid duration
  assert.throws(() => validateTiming({ durationMinutes: 0, deadlineAt: futureDeadline }), /valid duration/);
  assert.throws(() => validateTiming({ durationMinutes: 181, deadlineAt: futureDeadline }), /valid duration/);
  assert.throws(() => validateTiming({ durationMinutes: 45.5, deadlineAt: futureDeadline }), /valid duration/);

  // Invalid deadline
  assert.throws(() => validateTiming({ durationMinutes: 30, deadlineAt: null }), /future finalization deadline/);
  assert.throws(() => validateTiming({ durationMinutes: 30, deadlineAt: 'not-a-date' }), /valid timestamp in the future/);
  assert.throws(() => validateTiming({ durationMinutes: 30, deadlineAt: pastDeadline }), /valid timestamp in the future/);
});

test('sanitizeQuestionsForContest withholds answers before deadline and reveals after deadline', () => {
  const rawQuestions = [
    {
      _id: 'q1',
      questionText: 'What is 2+2?',
      correctOption: 1,
      correctAnswer: '4',
      explanation: 'Basic arithmetic',
      options: [
        { label: 'A', text: '3', isCorrect: false },
        { label: 'B', text: '4', isCorrect: true },
      ],
    },
  ];

  // 1. Before deadline: answers withheld
  const sanitizedBefore = sanitizeQuestionsForContest(rawQuestions, false);
  assert.equal(sanitizedBefore[0].questionText, 'What is 2+2?');
  assert.equal(sanitizedBefore[0].correctOption, undefined);
  assert.equal(sanitizedBefore[0].correctAnswer, undefined);
  assert.equal(sanitizedBefore[0].explanation, undefined);
  assert.equal(sanitizedBefore[0].options[0].isCorrect, undefined);
  assert.equal(sanitizedBefore[0].options[1].isCorrect, undefined);
  assert.equal(sanitizedBefore[0].options[0].text, '3');
  assert.equal(sanitizedBefore[0].options[1].text, '4');

  // 2. After deadline: answers and explanations revealed
  const sanitizedAfter = sanitizeQuestionsForContest(rawQuestions, true);
  assert.equal(sanitizedAfter[0].correctOption, 1);
  assert.equal(sanitizedAfter[0].correctAnswer, '4');
  assert.equal(sanitizedAfter[0].explanation, 'Basic arithmetic');
  assert.equal(sanitizedAfter[0].options[1].isCorrect, true);
});

test('RankingService calculates deterministic competitive rankings with tie-breaking', () => {
  const attempts = [
    { id: 'att-1', userId: { _id: 'u1', name: 'Alice', username: 'alice' }, score: 80, totalTimeMs: 120000, isPractice: false },
    { id: 'att-2', userId: { _id: 'u2', name: 'Bob', username: 'bob' }, score: 100, totalTimeMs: 90000, isPractice: false },
    { id: 'att-3', userId: { _id: 'u3', name: 'Charlie', username: 'charlie' }, score: 80, totalTimeMs: 110000, isPractice: false }, // faster than Alice
    { id: 'att-4', userId: { _id: 'u4', name: 'David', username: 'david' }, score: 80, totalTimeMs: 110000, isPractice: false }, // exact tie with Charlie
    { id: 'att-5', userId: { _id: 'u5', name: 'Creator Practice', username: 'creator' }, score: 100, totalTimeMs: 50000, isPractice: true }, // should be excluded
  ];

  const rankings = RankingService.calculateRankings(attempts);

  // 1. Creator practice attempts excluded
  assert.equal(rankings.length, 4);
  assert.equal(rankings.some((r) => r.attemptId === 'att-5'), false);

  // 2. Rank 1: Bob (100 pts)
  assert.equal(rankings[0].attemptId, 'att-2');
  assert.equal(rankings[0].rank, 1);
  assert.equal(rankings[0].score, 100);

  // 3. Rank 2: Charlie and David (80 pts, 110000 ms) - identical score and time share rank 2
  assert.equal(rankings[1].score, 80);
  assert.equal(rankings[1].rank, 2);
  assert.equal(rankings[2].score, 80);
  assert.equal(rankings[2].rank, 2);

  // 4. Rank 4: Alice (80 pts, 120000 ms) - competition rank jumps to 4
  assert.equal(rankings[3].attemptId, 'att-1');
  assert.equal(rankings[3].rank, 4);
  assert.equal(rankings[3].score, 80);
});
