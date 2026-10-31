/**
 * Attempt Entity (Pure OOP Domain Entity)
 * Represents a user or guest taking a quiz or challenge.
 */
export class Attempt {
  constructor({
    id = null,
    quizId,
    userId = null,
    sessionId = null,
    answers = [],
    score = 0,
    totalMarks = 0,
    totalQuestions = 0,
    correctCount = 0,
    wrongCount = 0,
    unansweredCount = 0,
    percentage = 0,
    totalTime = 0,
    totalTimeMs = 0,
    isPractice = false,
    status = 'in_progress', // 'in_progress', 'completed', 'abandoned'
    startedAt = new Date(),
    completedAt = null,
    deadlineAt = null,
  }) {
    this.id = id;
    this.quizId = quizId;
    this.userId = userId ? String(userId) : null;
    this.sessionId = sessionId;
    this.answers = answers || [];
    this.score = score;
    this.totalMarks = totalMarks;
    this.totalQuestions = totalQuestions;
    this.correctCount = correctCount;
    this.wrongCount = wrongCount;
    this.unansweredCount = unansweredCount;
    this.percentage = percentage;
    this.totalTime = totalTime;
    this.totalTimeMs = totalTimeMs;
    this.isPractice = Boolean(isPractice);
    this.status = status;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.deadlineAt = deadlineAt;
  }

  isInProgress() {
    return this.status === 'in_progress';
  }

  isCompleted() {
    return this.status === 'completed';
  }

  assertCanAnswer(questionId) {
    if (!this.isInProgress()) {
      throw new Error('Attempt is no longer in progress');
    }

    const existing = this.answers.find((a) => String(a.questionId) === String(questionId));
    if (existing?.isLocked) {
      throw new Error('This answer is already locked and cannot be changed');
    }
    return true;
  }

  recordAnswer({ questionId, selectedAnswer, isCorrect = false, marksAwarded = 0, timeTakenMs = 0, isLocked = false }) {
    this.assertCanAnswer(questionId);

    const index = this.answers.findIndex((a) => String(a.questionId) === String(questionId));
    const answerRecord = {
      questionId,
      selectedAnswer,
      isCorrect,
      marksAwarded,
      timeTakenMs,
      isLocked,
      answeredAt: new Date(),
    };

    if (index >= 0) {
      this.answers[index] = answerRecord;
    } else {
      this.answers.push(answerRecord);
    }
  }

  finalize({ totalTimeMs = null, score = null } = {}) {
    this.status = 'completed';
    this.completedAt = new Date();
    if (totalTimeMs !== null) {
      this.totalTimeMs = totalTimeMs;
      this.totalTime = Math.round(totalTimeMs / 1000);
    }
    if (score !== null) {
      this.score = score;
      if (this.totalMarks > 0) {
        this.percentage = Math.round((score / this.totalMarks) * 100);
      }
    }
  }
}

export default Attempt;
