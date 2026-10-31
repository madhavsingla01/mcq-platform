/**
 * StartAttemptUseCase
 * Orchestrates creating or resuming quiz and challenge attempts.
 * Pure application layer with zero Express/HTTP dependencies.
 */
export class StartAttemptUseCase {
  constructor({ quizRepository, attemptRepository, questionRepository }) {
    this.quizRepository = quizRepository;
    this.attemptRepository = attemptRepository;
    this.questionRepository = questionRepository;
  }

  async execute({
    quizId,
    userId = null,
    sessionId = null,
    forceNew = false,
    instantFeedback = false,
    timerMode = null,
    timeLimit = null,
    isQuickMode = false,
  }) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      const err = new Error('Quiz not found');
      err.statusCode = 404;
      throw err;
    }

    const isChallenge = Boolean(quiz.isChallenge);
    const deadlinePassed = quiz.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;
    const uploaderId = quiz.uploader?._id || quiz.uploader;
    const isCreator = userId && String(uploaderId) === String(userId);

    if (isChallenge) {
      if (deadlinePassed) {
        const err = new Error('This challenge has concluded and is no longer accepting attempts.');
        err.statusCode = 400;
        throw err;
      }

      if (!isCreator && (userId || sessionId)) {
        const priorAttempt = await this.attemptRepository.findPriorAttempt({ quizId, userId, sessionId });
        if (priorAttempt) {
          const err = new Error('Only one attempt is permitted per participant for this challenge.');
          err.statusCode = 403;
          throw err;
        }
      }
    }

    // Check for existing active attempt
    let existingAttempt = await this.attemptRepository.findActiveAttempt({ quizId, userId, sessionId });
    if (existingAttempt && forceNew && !isChallenge) {
      existingAttempt.status = 'abandoned';
      existingAttempt.completed = false;
      existingAttempt.syncStatus = 'synced';
      await this.attemptRepository.save(existingAttempt);
      existingAttempt = null;
    }

    if (existingAttempt) {
      return {
        attempt: existingAttempt,
        recovered: true,
        isChallenge,
        deadlinePassed,
      };
    }

    const questions = await this.questionRepository.findByQuizId(quizId);
    const timeLimitMinutes = isChallenge
      ? (quiz.durationMinutes || quiz.settings?.timeLimit || 0)
      : Number(timeLimit !== null && timeLimit !== undefined ? timeLimit : (quiz.settings?.timeLimit || 0));

    const resolvedTimerMode = isChallenge ? 'strict' : (timerMode || quiz.settings?.timerMode || 'none');
    const validTimerMode = ['none', 'soft', 'strict'].includes(resolvedTimerMode) ? resolvedTimerMode : 'none';
    const allowedDurationMs = timeLimitMinutes > 0 ? timeLimitMinutes * 60 * 1000 : 0;
    const startedAt = new Date();
    let deadlineAt = allowedDurationMs > 0 && validTimerMode !== 'none'
      ? new Date(startedAt.getTime() + allowedDurationMs)
      : null;

    if (isChallenge && quiz.deadlineAt) {
      const challengeDeadline = new Date(quiz.deadlineAt);
      if (!deadlineAt || deadlineAt > challengeDeadline) {
        deadlineAt = challengeDeadline;
      }
    }

    const isPractice = Boolean(isChallenge && isCreator);
    const resolvedInstantFeedback = !isChallenge && (quiz.settings?.instantFeedback === true || instantFeedback === true || isQuickMode);

    const initialAnswers = (questions || []).map((q, idx) => ({
      questionId: q._id || q.id,
      selectedAnswer: null,
      isCorrect: false,
      marksAwarded: 0,
      timeTakenMs: 0,
      isLocked: false,
      answeredAt: null,
      orderIndex: idx,
    }));

    const attempt = await this.attemptRepository.save({
      quizId: quiz._id || quiz.id,
      userId: userId || null,
      sessionId: userId ? null : sessionId,
      answers: initialAnswers,
      totalQuestions: questions.length,
      totalMarks: isChallenge ? questions.length : (quiz.totalMarks || questions.reduce((acc, q) => acc + (q.marks || 1), 0)),
      isQuickMode: !isChallenge && isQuickMode,
      isPractice,
      instantFeedback: resolvedInstantFeedback,
      timerMode: validTimerMode,
      allowedDurationMs,
      deadlineAt,
      startedAt,
      lastServerSyncAt: new Date(),
      syncStatus: 'synced',
      status: 'in_progress',
      progress: {
        currentQuestionId: questions[0]?._id || null,
        answeredCount: 0,
        markedForReviewCount: 0,
        totalQuestions: questions.length,
        percentage: 0,
        updatedAt: new Date(),
      },
    });

    return {
      attempt,
      recovered: false,
      isChallenge,
      deadlinePassed,
    };
  }
}

export default StartAttemptUseCase;
