import { describe, it, expect } from '@jest/globals';
import { Challenge } from '../dist/domain/entities/Challenge.js';
import { Quiz } from '../dist/domain/entities/Quiz.js';
import { Attempt } from '../dist/domain/entities/Attempt.js';
import { RankingService } from '../dist/domain/services/RankingService.js';
import {
  QuestionLimitExceededError,
  InvalidChallengeTimeError,
  ChallengeImmutabilityError,
  CancellationNotAllowedError,
} from '../dist/domain/errors/DomainError.js';

describe('OOP Domain Entities & Business Invariants', () => {
  describe('Challenge Entity Invariants', () => {
    it('enforces maximum 10 questions for challenges', () => {
      const questions11 = Array.from({ length: 11 }, (_, i) => ({ id: `q${i}` }));
      const challenge = new Challenge({
        title: 'Overloaded Challenge',
        questions: questions11,
        durationMinutes: 20,
        deadlineAt: new Date(Date.now() + 3600000),
      });

      expect(() => challenge.validate()).toThrow(QuestionLimitExceededError);
    });

    it('validates duration in minutes and future deadline', () => {
      const challengePast = new Challenge({
        title: 'Past Challenge',
        questions: [{ id: 'q1' }],
        durationMinutes: 20,
        deadlineAt: new Date(Date.now() - 10000),
      });

      expect(() => challengePast.validate()).toThrow(InvalidChallengeTimeError);

      const challengeNoDuration = new Challenge({
        title: 'Zero Duration Challenge',
        questions: [{ id: 'q1' }],
        durationMinutes: 0,
        deadlineAt: new Date(Date.now() + 3600000),
      });

      expect(() => challengeNoDuration.validate()).toThrow(InvalidChallengeTimeError);
    });

    it('enforces immutability of questions, duration, deadline, and rules once participants join', () => {
      const challenge = new Challenge({
        title: 'Active Challenge',
        questions: [{ id: 'q1' }],
        durationMinutes: 30,
        deadlineAt: new Date(Date.now() + 86400000),
      });

      // 0 attempts: allowed
      expect(challenge.assertCanModify({ questions: [{ id: 'q2' }] }, 0)).toBe(true);

      // > 0 attempts: forbidden
      expect(() => challenge.assertCanModify({ questions: [{ id: 'q2' }] }, 1)).toThrow(ChallengeImmutabilityError);
      expect(() => challenge.assertCanModify({ durationMinutes: 45 }, 2)).toThrow(ChallengeImmutabilityError);
      expect(() => challenge.assertCanModify({ deadlineAt: new Date() }, 1)).toThrow(ChallengeImmutabilityError);
      expect(() => challenge.assertCanModify({ settings: { timerMode: 'strict' } }, 1)).toThrow(ChallengeImmutabilityError);

      // Title & description change still allowed
      expect(challenge.assertCanModify({ title: 'New Title' }, 3)).toBe(true);
    });

    it('allows cancellation only before anyone starts', () => {
      const challenge = new Challenge({
        title: 'Cancellable Challenge',
        durationMinutes: 15,
        deadlineAt: new Date(Date.now() + 86400000),
      });

      expect(challenge.assertCanCancel(0)).toBe(true);
      expect(() => challenge.assertCanCancel(1)).toThrow(CancellationNotAllowedError);
    });

    it('correctly calculates quarantine and expiry status', () => {
      const futureDeadline = new Date(Date.now() + 60000);
      const challenge = new Challenge({
        title: 'Quarantined Challenge',
        deadlineAt: futureDeadline,
      });

      expect(challenge.isExpired()).toBe(false);
      expect(challenge.isQuarantined()).toBe(true);

      const pastDeadline = new Date(Date.now() - 60000);
      const endedChallenge = new Challenge({
        title: 'Ended Challenge',
        deadlineAt: pastDeadline,
      });

      expect(endedChallenge.isExpired()).toBe(true);
      expect(endedChallenge.isQuarantined()).toBe(false);
    });
  });

  describe('RankingService Domain Service', () => {
    it('ranks participants by score descending, then time ascending, excluding practice', () => {
      const attempts = [
        {
          id: 'att1',
          userId: { _id: 'u1', name: 'Alice' },
          score: 8,
          totalTimeMs: 120000,
          isPractice: false,
        },
        {
          id: 'att_practice',
          userId: { _id: 'creator', name: 'Creator Practice' },
          score: 10,
          totalTimeMs: 5000,
          isPractice: true, // Should be excluded!
        },
        {
          id: 'att2',
          userId: { _id: 'u2', name: 'Bob' },
          score: 10,
          totalTimeMs: 150000,
          isPractice: false,
        },
        {
          id: 'att3',
          userId: { _id: 'u3', name: 'Charlie' },
          score: 10,
          totalTimeMs: 110000,
          isPractice: false,
        },
      ];

      const ranked = RankingService.calculateRankings(attempts);

      expect(ranked).toHaveLength(3);
      expect(ranked[0].user.name).toBe('Charlie');
      expect(ranked[0].rank).toBe(1);

      expect(ranked[1].user.name).toBe('Bob');
      expect(ranked[1].rank).toBe(2);

      expect(ranked[2].user.name).toBe('Alice');
      expect(ranked[2].rank).toBe(3);
    });

    it('awards identical rank for identical scores and times', () => {
      const tiedAttempts = [
        { id: '1', score: 9, totalTimeMs: 100000, isPractice: false },
        { id: '2', score: 9, totalTimeMs: 100000, isPractice: false },
        { id: '3', score: 7, totalTimeMs: 90000, isPractice: false },
      ];

      const competitionRanked = RankingService.calculateRankings(tiedAttempts, 'competition');
      expect(competitionRanked[0].rank).toBe(1);
      expect(competitionRanked[1].rank).toBe(1);
      expect(competitionRanked[2].rank).toBe(3);

      const denseRanked = RankingService.calculateRankings(tiedAttempts, 'dense');
      expect(denseRanked[0].rank).toBe(1);
      expect(denseRanked[1].rank).toBe(1);
      expect(denseRanked[2].rank).toBe(2);
    });
  });

  describe('Attempt Entity', () => {
    it('manages answers and locks', () => {
      const attempt = new Attempt({
        quizId: 'quiz1',
        userId: 'user1',
        totalQuestions: 5,
      });

      expect(attempt.isInProgress()).toBe(true);

      attempt.recordAnswer({ questionId: 'q1', selectedAnswer: 'B', isCorrect: true, isLocked: true });
      expect(attempt.answers).toHaveLength(1);
      expect(attempt.answers[0].isLocked).toBe(true);

      expect(() => attempt.recordAnswer({ questionId: 'q1', selectedAnswer: 'C' })).toThrow(/already locked/);

      attempt.finalize({ totalTimeMs: 45000, score: 4 });
      expect(attempt.isCompleted()).toBe(true);
      expect(attempt.totalTime).toBe(45);
    });
  });
});
