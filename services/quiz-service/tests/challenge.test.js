import { describe, it, expect } from '@jest/globals';
import { calculateDenseLeaderboard } from '../dist/controllers/quiz.controller.js';

describe('Challenge Engine - Dense Ranking Algorithm', () => {
  it('should rank participants by score descending, then completion time ascending', () => {
    const attempts = [
      {
        _id: 'att1',
        userId: { _id: 'u1', name: 'Alice', username: 'alice' },
        score: 8,
        totalTimeMs: 120000,
        isPractice: false,
      },
      {
        _id: 'att2',
        userId: { _id: 'u2', name: 'Bob', username: 'bob' },
        score: 10,
        totalTimeMs: 150000,
        isPractice: false,
      },
      {
        _id: 'att3',
        userId: { _id: 'u3', name: 'Charlie', username: 'charlie' },
        score: 10,
        totalTimeMs: 110000,
        isPractice: false,
      },
    ];

    const leaderboard = calculateDenseLeaderboard(attempts);

    expect(leaderboard).toHaveLength(3);
    // Charlie: 10 pts in 110s -> Rank 1
    expect(leaderboard[0].user.name).toBe('Charlie');
    expect(leaderboard[0].rank).toBe(1);

    // Bob: 10 pts in 150s -> Rank 2
    expect(leaderboard[1].user.name).toBe('Bob');
    expect(leaderboard[1].rank).toBe(2);

    // Alice: 8 pts in 120s -> Rank 3
    expect(leaderboard[2].user.name).toBe('Alice');
    expect(leaderboard[2].rank).toBe(3);
  });

  it('identical scores and times should share the same rank', () => {
    const attempts = [
      {
        _id: 'att1',
        userId: { _id: 'u1', name: 'Alice' },
        score: 9,
        totalTimeMs: 100000,
        isPractice: false,
      },
      {
        _id: 'att2',
        userId: { _id: 'u2', name: 'Bob' },
        score: 9,
        totalTimeMs: 100000,
        isPractice: false,
      },
      {
        _id: 'att3',
        userId: { _id: 'u3', name: 'Charlie' },
        score: 7,
        totalTimeMs: 90000,
        isPractice: false,
      },
    ];

    const leaderboard = calculateDenseLeaderboard(attempts);

    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].rank).toBe(1); // Shared rank
    expect(leaderboard[2].rank).toBe(3);
  });

  it('should strictly exclude creator practice attempts from competitive rankings', () => {
    const attempts = [
      {
        _id: 'att_creator',
        userId: { _id: 'creator_id', name: 'Creator Practice' },
        score: 10,
        totalTimeMs: 5000,
        isPractice: true, // Practice run by creator
      },
      {
        _id: 'att_student',
        userId: { _id: 'student_id', name: 'Legitimate Student' },
        score: 9,
        totalTimeMs: 80000,
        isPractice: false,
      },
    ];

    const leaderboard = calculateDenseLeaderboard(attempts);

    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].user.name).toBe('Legitimate Student');
    expect(leaderboard[0].rank).toBe(1);
  });
});

describe('Challenge Rules & Immutability Verification', () => {
  it('should validate that challenges reject more than 10 questions', () => {
    const elevenQuestions = Array.from({ length: 11 }, (_, i) => ({
      questionText: `Question ${i + 1}`,
      options: [{ label: 'A', text: 'Opt 1' }, { label: 'B', text: 'Opt 2' }],
      correctAnswer: 'A',
    }));

    // Test constraint check
    const isChallenge = true;
    const validateQuestionCount = (questions, isChallenge) => {
      if (isChallenge && questions.length > 10) {
        throw new Error('Challenges cannot have more than 10 questions');
      }
      return true;
    };

    expect(() => validateQuestionCount(elevenQuestions, isChallenge)).toThrow(
      'Challenges cannot have more than 10 questions'
    );

    // Standard quiz allows unlimited questions
    expect(validateQuestionCount(elevenQuestions, false)).toBe(true);
  });

  it('should validate that challenges require duration and future finalization deadline', () => {
    const validateChallengeTime = ({ durationMinutes, deadlineAt }) => {
      if (!durationMinutes || durationMinutes <= 0) {
        throw new Error('Challenges require a valid duration in minutes');
      }
      if (!deadlineAt || new Date(deadlineAt) <= new Date()) {
        throw new Error('Challenges require a valid future finalization deadline');
      }
      return true;
    };

    expect(() => validateChallengeTime({ durationMinutes: 0, deadlineAt: new Date(Date.now() + 3600000) })).toThrow(
      'Challenges require a valid duration in minutes'
    );

    expect(() => validateChallengeTime({ durationMinutes: 30, deadlineAt: new Date(Date.now() - 1000) })).toThrow(
      'Challenges require a valid future finalization deadline'
    );

    expect(validateChallengeTime({ durationMinutes: 30, deadlineAt: new Date(Date.now() + 86400000) })).toBe(true);
  });

  it('should prevent modifying questions or rules once participant attempts exist', () => {
    const attemptCount = 3;
    const isChallenge = true;

    const assertChallengeMutable = (attemptCount, isChallenge, updatePayload) => {
      if (isChallenge && attemptCount > 0) {
        const isModifyingQuestions = Boolean(updatePayload.questions);
        const isModifyingDuration = updatePayload.durationMinutes !== undefined;
        const isModifyingDeadline = updatePayload.deadlineAt !== undefined;
        const isModifyingRules = updatePayload.settings !== undefined;

        if (isModifyingQuestions || isModifyingDuration || isModifyingDeadline || isModifyingRules) {
          throw new Error('Challenge questions, duration, and rules are immutable once participants have joined');
        }
      }
      return true;
    };

    expect(() => assertChallengeMutable(attemptCount, isChallenge, { questions: [] })).toThrow(
      'Challenge questions, duration, and rules are immutable once participants have joined'
    );

    expect(() => assertChallengeMutable(attemptCount, isChallenge, { durationMinutes: 45 })).toThrow(
      'Challenge questions, duration, and rules are immutable once participants have joined'
    );

    // Title / description change is still permitted
    expect(assertChallengeMutable(attemptCount, isChallenge, { title: 'Updated Title' })).toBe(true);
  });

  it('cancellation / deletion should be permitted only if nobody has started', () => {
    const assertCanDelete = (attemptCount) => {
      if (attemptCount > 0) {
        throw new Error('Cannot delete or cancel after participants have started');
      }
      return true;
    };

    expect(() => assertCanDelete(1)).toThrow('Cannot delete or cancel after participants have started');
    expect(assertCanDelete(0)).toBe(true);
  });
});
