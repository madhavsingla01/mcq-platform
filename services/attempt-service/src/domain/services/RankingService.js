/**
 * Domain Service: Ranking & Leaderboard Calculation
 * Encapsulates leaderboard ranking, tie-breaking, and practice exclusion.
 */
export class RankingService {
  /**
   * Calculate competitive rankings according to QuizFocus rules.
   * - Excludes creator practice attempts.
   * - Sorts: score DESC, completion time ASC.
   * - Identical scores and times receive the same rank.
   *
   * @param {Array<Object>} attempts
   * @param {'competition'|'dense'} strategy - 'competition' (1, 1, 3) or 'dense' (1, 1, 2)
   * @returns {Array<Object>}
   */
  static calculateRankings(attempts = [], strategy = 'competition') {
    // 1. Exclude practice runs
    const competitiveAttempts = (attempts || []).filter((a) => !a.isPractice);

    // 2. Sort: score descending, then faster completion time ascending
    competitiveAttempts.sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const timeA = a.totalTimeMs ?? (a.totalTime ? a.totalTime * 1000 : Infinity);
      const timeB = b.totalTimeMs ?? (b.totalTime ? b.totalTime * 1000 : Infinity);
      return timeA - timeB;
    });

    // 3. Apply ranking
    let currentRank = 1;
    return competitiveAttempts.map((entry, index) => {
      if (index > 0) {
        const prev = competitiveAttempts[index - 1];
        const prevTime = prev.totalTimeMs ?? (prev.totalTime ? prev.totalTime * 1000 : Infinity);
        const currTime = entry.totalTimeMs ?? (entry.totalTime ? entry.totalTime * 1000 : Infinity);

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
        totalTimeMs: entry.totalTimeMs ?? (entry.totalTime ? entry.totalTime * 1000 : 0),
        percentage: entry.percentage || 0,
        completedAt: entry.completedAt || entry.updatedAt || new Date(),
      };
    });
  }
}

export default RankingService;
