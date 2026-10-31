import { Challenge } from '../../domain/entities/Challenge.js';

export class UpdateQuizUseCase {
  constructor({ quizRepository, attemptRepository, questionRepository }) {
    this.quizRepository = quizRepository;
    this.attemptRepository = attemptRepository;
    this.questionRepository = questionRepository;
  }

  async execute({ quizId, updatePayload, userId = null, isAdmin = false }) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    // Access check
    const isOwner = userId && String(quiz.uploader) === String(userId);
    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission to manage this quiz');
    }

    const attemptCount = await this.attemptRepository.countAttempts({ quizId: quiz._id || quiz.id });

    // Enforce Challenge Domain Immutability
    if (quiz.isChallenge) {
      const challengeEntity = new Challenge({
        id: quiz._id || quiz.id,
        title: quiz.title,
        questions: updatePayload.questions || [],
        durationMinutes: quiz.durationMinutes,
        deadlineAt: quiz.deadlineAt,
        challengeStatus: quiz.challengeStatus,
      });

      challengeEntity.assertCanModify(updatePayload, attemptCount);
    }

    // Check question replacement constraint for all quizzes
    if (Array.isArray(updatePayload.questions)) {
      if (attemptCount > 0) {
        throw new Error('Questions cannot be replaced after attempts exist');
      }

      if (quiz.isChallenge && updatePayload.questions.length > 10) {
        throw new Error('Challenges cannot have more than 10 questions');
      }

      await this.questionRepository.deleteByQuizId(quiz._id || quiz.id);
      const questionRecords = updatePayload.questions.map((q, idx) => ({
        ...q,
        quizId: quiz._id || quiz.id,
        questionNumber: q.questionNumber || idx + 1,
        orderIndex: idx,
      }));
      await this.questionRepository.saveMany(questionRecords);
      quiz.questionCount = questionRecords.length;
    }

    // Update fields
    const updated = await this.quizRepository.update(quiz._id || quiz.id, {
      ...updatePayload,
      isPublic: updatePayload.visibility === 'public',
    });

    return updated;
  }
}

export default UpdateQuizUseCase;
