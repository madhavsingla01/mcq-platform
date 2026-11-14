import type { Types } from 'mongoose';

type Id = string | Types.ObjectId;

interface RankingUser {
  _id?: Id;
  name?: string;
  username?: string;
  avatar?: string;
  preferences?: {
    showOnLeaderboard?: boolean;
    challenges?: { showOnLeaderboards?: boolean };
  };
}

interface RankingAttempt {
  _id?: Id;
  id?: Id;
  userId?: RankingUser | null;
  score?: number | null;
  totalMarks?: number | null;
  totalTime?: number | null;
  totalTimeMs?: number | null;
  percentage?: number | null;
  completedAt?: Date | string | null;
  isPractice?: boolean;
}

function completionTime(attempt: RankingAttempt, missing: number) {
  return attempt.totalTimeMs ?? (attempt.totalTime ? attempt.totalTime * 1000 : missing);
}

export class RankingService {
  /**
   * Calculates competitive rankings according to QuizFocus rules:
   * - Excludes contest creator practice attempts (isPractice: true).
   * - Primary Sort: score DESC.
   * - Secondary Tie-Breaker: totalTimeMs ASC.
   * - Identical score and completion time share the same rank.
   */
  static calculateRankings(attempts: readonly RankingAttempt[] | null = [], strategy: 'competition' | 'dense' = 'competition') {
    const competitiveAttempts = (attempts || []).filter((a) => !a.isPractice);

    competitiveAttempts.sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const timeA = completionTime(a, Infinity);
      const timeB = completionTime(b, Infinity);
      return timeA - timeB;
    });

    let currentRank = 1;
    return competitiveAttempts.map((entry, index) => {
      const prev = competitiveAttempts[index - 1];
      if (prev) {
        const prevTime = completionTime(prev, Infinity);
        const currTime = completionTime(entry, Infinity);

        const isTied = (entry.score || 0) === (prev.score || 0) && currTime === prevTime;
        if (!isTied) {
          currentRank = strategy === 'dense' ? currentRank + 1 : index + 1;
        }
      }

      const isVisibleOnLeaderboard = entry.userId &&
        entry.userId.preferences?.showOnLeaderboard !== false &&
        entry.userId.preferences?.challenges?.showOnLeaderboards !== false;

      return {
        rank: currentRank,
        attemptId: entry._id || entry.id,
        user: entry.userId ? (
          isVisibleOnLeaderboard ? {
            _id: entry.userId._id || entry.userId,
            name: entry.userId.name || 'Anonymous',
            username: entry.userId.username || 'user',
            avatar: entry.userId.avatar || '',
          } : {
            _id: null,
            name: 'Anonymous Learner',
            username: 'anonymous',
            avatar: '',
            isPseudonymized: true,
          }
        ) : {
          _id: null,
          name: 'Guest',
          username: 'guest',
          avatar: '',
        },
        score: entry.score || 0,
        totalMarks: entry.totalMarks || 0,
        totalTimeMs: completionTime(entry, 0),
        percentage: entry.percentage || 0,
        completedAt: entry.completedAt,
      };
    });
  }
}
