import { Challenge } from '../../domain/entities/Challenge.js';

export class DeleteQuizUseCase {
  constructor({ quizRepository, attemptRepository, questionRepository }) {
    this.quizRepository = quizRepository;
    this.attemptRepository = attemptRepository;
    this.questionRepository = questionRepository;
  }

  async execute({ quizId, userId = null, isAdmin = false }) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const isOwner = userId && String(quiz.uploader) === String(userId);
    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission to manage this quiz');
    }

    const attemptCount = await this.attemptRepository.countAttempts({ quizId: quiz._id || quiz.id });

    // Enforce cancellation rule: allowed only before anyone starts
    if (quiz.isChallenge) {
      const challenge = new Challenge({ id: quiz._id || quiz.id, title: quiz.title });
      challenge.assertCanCancel(attemptCount);
    } else if (attemptCount > 0) {
      throw new Error('Cannot delete or cancel after participants have started');
    }

    await this.questionRepository.deleteByQuizId(quiz._id || quiz.id);
    await this.attemptRepository.deleteMany({ quizId: quiz._id || quiz.id });
    await this.quizRepository.delete(quiz._id || quiz.id);

    return true;
  }
}

export default DeleteQuizUseCase;
