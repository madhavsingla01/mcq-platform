/**
 * SubmitAttemptUseCase
 * Orchestrates completing an attempt, evaluating answers, scoring, enforcing lock, and quarantining results.
 * Pure application layer with zero Express/HTTP dependencies.
 */
export class SubmitAttemptUseCase {
  constructor({ quizRepository, attemptRepository, questionRepository }) {
    this.quizRepository = quizRepository;
    this.attemptRepository = attemptRepository;
    this.questionRepository = questionRepository;
  }

  async execute({ attemptId, userId = null, sessionId = null, clientAnswers = [], totalTimeMs = 0 }) {
    const attempt = await this.attemptRepository.findById(attemptId);
    if (!attempt) {
      const err = new Error('Attempt not found');
      err.statusCode = 404;
      throw err;
    }

    // Ownership assertion
    if (attempt.userId && userId && String(attempt.userId) !== String(userId)) {
      const err = new Error('Not authorized to access or submit this attempt');
      err.statusCode = 403;
      throw err;
    }

    const quiz = await this.quizRepository.findById(attempt.quizId);
    const isChallenge = Boolean(quiz?.isChallenge);
    const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;
    const isOwner = userId && quiz && String(userId) === String(quiz.uploader?._id || quiz.uploader);

    // If already completed, return idempotent result
    if (attempt.status === 'completed') {
      return {
        attempt,
        score: isChallenge && !deadlinePassed && !isOwner ? null : attempt.score,
        total: attempt.totalQuestions,
        percentage: isChallenge && !deadlinePassed && !isOwner ? null : attempt.percentage,
        isChallenge,
        deadlinePassed,
      };
    }

    // Load canonical questions to compute scores
    const questions = await this.questionRepository.findByQuizId(attempt.quizId);
    const questionMap = new Map();
    for (const q of (questions || [])) {
      questionMap.set(String(q._id || q.id), q);
    }

    // Check deadline / late submission
    let isLate = false;
    if (attempt.deadlineAt && new Date() > new Date(attempt.deadlineAt)) {
      isLate = true;
    }

    let calculatedScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    // Map incoming client answers
    const clientMap = new Map();
    for (const ans of (clientAnswers || [])) {
      if (ans.questionId) {
        clientMap.set(String(ans.questionId), ans);
      }
    }

    const evaluatedAnswers = (attempt.answers || []).map((existingAns) => {
      const qId = String(existingAns.questionId);
      const canonicalQ = questionMap.get(qId);
      const incoming = clientMap.get(qId);

      // If already locked, keep existing answer
      let selectedAnswer = existingAns.selectedAnswer;
      let timeTakenMs = existingAns.timeTakenMs || 0;
      if (!existingAns.isLocked && incoming) {
        selectedAnswer = incoming.selectedAnswer !== undefined ? incoming.selectedAnswer : selectedAnswer;
        timeTakenMs = incoming.timeTakenMs !== undefined ? incoming.timeTakenMs : timeTakenMs;
      }

      let isCorrect = false;
      let marksAwarded = 0;

      if (canonicalQ && selectedAnswer !== null && selectedAnswer !== undefined) {
        const correctIndex = canonicalQ.correctOptionIndex !== undefined ? canonicalQ.correctOptionIndex : canonicalQ.correctOption;
        if (Number(selectedAnswer) === Number(correctIndex)) {
          isCorrect = true;
          marksAwarded = canonicalQ.marks || 1;
          calculatedScore += marksAwarded;
          correctCount++;
        } else {
          wrongCount++;
        }
      } else {
        unansweredCount++;
      }

      return {
        ...existingAns,
        selectedAnswer,
        timeTakenMs,
        isCorrect,
        marksAwarded,
        isLocked: true, // Lock answer on final submission
        answeredAt: existingAns.answeredAt || (selectedAnswer !== null ? new Date() : null),
      };
    });

    const totalMarks = attempt.totalMarks || (isChallenge ? questions.length : 100);
    const percentage = totalMarks > 0 ? Math.round((calculatedScore / totalMarks) * 100) : 0;
    const finalTotalTimeMs = totalTimeMs || (attempt.startedAt ? (Date.now() - new Date(attempt.startedAt).getTime()) : 0);

    attempt.status = 'completed';
    attempt.completed = true;
    attempt.completedAt = new Date();
    attempt.score = calculatedScore;
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.unansweredCount = unansweredCount;
    attempt.percentage = percentage;
    attempt.totalTimeMs = finalTotalTimeMs;
    attempt.totalTime = Math.round(finalTotalTimeMs / 1000);
    attempt.answers = evaluatedAnswers;
    attempt.syncStatus = 'synced';

    if (isLate) {
      attempt.suspiciousActivity = attempt.suspiciousActivity || {};
      attempt.suspiciousActivity.flags = [
        ...(attempt.suspiciousActivity.flags || []),
        { code: 'LATE_SUBMISSION', message: 'Submitted after deadline expired', createdAt: new Date() },
      ];
    }

    const savedAttempt = await this.attemptRepository.save(attempt);

    return {
      attempt: savedAttempt,
      score: isChallenge && !deadlinePassed && !isOwner ? null : calculatedScore,
      total: attempt.totalQuestions,
      percentage: isChallenge && !deadlinePassed && !isOwner ? null : percentage,
      isChallenge,
      deadlinePassed,
    };
  }
}

export default SubmitAttemptUseCase;
