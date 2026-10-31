import { mergeAttemptTrackingPayload } from '../../services/quiz/attemptTracking.service.js';

export class FinalizeExpiredChallengesUseCase {
  constructor({ quizRepository, attemptRepository, questionRepository }) {
    this.quizRepository = quizRepository;
    this.attemptRepository = attemptRepository;
    this.questionRepository = questionRepository;
  }

  async execute(now = new Date()) {
    const expiredChallenges = await this.quizRepository.find({
      isChallenge: true,
      deadlineAt: { $lte: now },
      challengeStatus: 'active',
    });

    const finalizedSummary = [];

    for (const challenge of expiredChallenges) {
      challenge.challengeStatus = 'ended';
      await challenge.save();

      const questions = await this.questionRepository.findByQuizId(challenge._id || challenge.id);
      const inProgressAttempts = await this.attemptRepository.find({
        quizId: challenge._id || challenge.id,
        status: 'in_progress',
      });

      let finalizedCount = 0;
      for (const attempt of inProgressAttempts) {
        mergeAttemptTrackingPayload({
          attempt,
          questions,
          payload: {},
          finalizing: true,
        });
        await attempt.save();
        finalizedCount++;
      }

      finalizedSummary.push({
        challengeId: challenge._id || challenge.id,
        title: challenge.title,
        finalizedAttempts: finalizedCount,
      });
    }

    return finalizedSummary;
  }
}

export default FinalizeExpiredChallengesUseCase;
