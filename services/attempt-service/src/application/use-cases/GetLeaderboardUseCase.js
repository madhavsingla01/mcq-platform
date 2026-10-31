import { Challenge } from '../../domain/entities/Challenge.js';
import { RankingService } from '../../domain/services/RankingService.js';

export class GetLeaderboardUseCase {
  constructor({ quizRepository, attemptRepository }) {
    this.quizRepository = quizRepository;
    this.attemptRepository = attemptRepository;
  }

  async execute({ quizId }) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const isChallenge = Boolean(quiz.isChallenge);
    const deadlineAt = quiz.deadlineAt ? new Date(quiz.deadlineAt) : null;
    const now = new Date();
    const deadlinePassed = deadlineAt ? now >= deadlineAt : false;

    const participantCount = await this.attemptRepository.countAttempts({
      quizId: quiz._id || quiz.id,
      isPractice: { $ne: true },
    });

    // Before deadline, display ONLY participant count; hide identities, scores, and ranks
    if (isChallenge && !deadlinePassed) {
      return {
        isChallenge: true,
        deadlinePassed: false,
        deadlineAt: quiz.deadlineAt,
        participantCount,
        leaderboard: [],
        message: 'Leaderboard and ranks are quarantined until the finalization deadline.',
      };
    }

    // Retrieve completed non-practice attempts
    const completedAttempts = await this.attemptRepository.findCompletedByQuizId(
      quiz._id || quiz.id,
      { limit: 100 }
    );

    const rankedLeaderboard = RankingService.calculateRankings(completedAttempts, 'competition');

    return {
      isChallenge,
      deadlinePassed: isChallenge ? true : null,
      deadlineAt: quiz.deadlineAt || null,
      participantCount,
      leaderboard: rankedLeaderboard,
    };
  }
}

export default GetLeaderboardUseCase;
