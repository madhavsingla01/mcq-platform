import { AppError } from '../../middleware/error.middleware.js';
import { logger } from '../../utils/logger.js';

const MAX_ALLOWED_AHEAD_MS = 30_000;
const MAX_ALLOWED_TIME_REGRESSION_MS = 1_500;
const MAX_QUESTION_TIME_OVERFLOW_MS = 20_000;
const MAX_STORED_FLAGS = 60;
const MAX_TRACKABLE_MS = 1000 * 60 * 60 * 24 * 14;

const toObjectIdString = (value) => {
  if (!value) {
    return '';
  }

  return String(value);
};

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const roundNumber = (value, digits = 1) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clampMs = (value) => {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }

  return Math.min(Math.round(normalized), MAX_TRACKABLE_MS);
};

const msToSeconds = (value) => Math.max(0, Math.round(clampMs(value) / 1000));

const uniqueSortedDates = (values) => {
  const seen = new Set();
  const parsed = [];

  values.forEach((value) => {
    const dateValue = parseDateValue(value);

    if (!dateValue) {
      return;
    }

    const iso = dateValue.toISOString();

    if (seen.has(iso)) {
      return;
    }

    seen.add(iso);
    parsed.push(dateValue);
  });

  parsed.sort((left, right) => left.getTime() - right.getTime());

  return parsed;
};

const getEarliestDate = (values) => values[0] || null;
const getLatestDate = (values) => values[values.length - 1] || null;

const appendFlag = (flags, code, message) => {
  flags.push({
    code,
    message,
    createdAt: new Date(),
  });
};

const normalizeSelectedAnswer = (selectedAnswer, question) => {
  if (typeof selectedAnswer !== 'string') {
    return null;
  }

  const trimmed = selectedAnswer.trim();

  if (!trimmed) {
    return null;
  }

  const validOptions = new Set((question.options || []).map((option) => option.label));
  return validOptions.has(trimmed) ? trimmed : null;
};

const pickLatestByTimestamp = (...candidates) => {
  let latest = null;

  candidates.forEach((candidate) => {
    const parsed = parseDateValue(candidate);

    if (!parsed) {
      return;
    }

    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  });

  return latest;
};

const getQuestionTimeMs = (answer) => {
  if (Number.isFinite(Number(answer?.timeTakenMs))) {
    return clampMs(answer.timeTakenMs);
  }

  return clampMs((answer?.timeTaken || 0) * 1000);
};

const getQuestionMarks = (question) => {
  const marks = Number(question?.marks);
  return Number.isFinite(marks) && marks >= 0 ? marks : 1;
};

const getQuestionNegativeMarks = (question) => {
  const marks = Number(question?.negativeMarks);
  return Number.isFinite(marks) && marks >= 0 ? marks : 0;
};

const getOptionByLabel = (question, label) => {
  return (question.options || []).find((option) => option.label === label) || null;
};

const ensureAnswerEntry = (attempt, question) => {
  const questionId = toObjectIdString(question._id);
  let answer = attempt.answers.find((entry) => toObjectIdString(entry.questionId) === questionId);

  if (!answer) {
    answer = {
      questionId: question._id,
      selectedAnswer: null,
      selectedOptionId: null,
      correctOptionId: getOptionByLabel(question, question.correctAnswer)?._id || null,
      isCorrect: false,
      marksAwarded: 0,
      isLocked: false,
      lockSource: null,
      timeTaken: 0,
      timeTakenMs: 0,
      visitedAt: null,
      firstVisitedAt: null,
      lastVisitedAt: null,
      visitTimestamps: [],
      submittedAt: null,
      answeredAt: null,
      submissionTimestamps: [],
      lockedAt: null,
      lastClientUpdatedAt: null,
      isSkipped: true,
    };

    attempt.answers.push(answer);
  }

  return answer;
};

const normalizeQuestionStates = (questionStates = []) => {
  if (!Array.isArray(questionStates)) {
    return [];
  }

  return questionStates
    .map((state) => {
      const questionId = toObjectIdString(state?.questionId);

      if (!questionId) {
        return null;
      }

      const visitTimestamps = uniqueSortedDates([
        state.visitedAt,
        ...(Array.isArray(state.visitTimestamps) ? state.visitTimestamps : []),
      ]);
      const submissionTimestamps = uniqueSortedDates([
        state.submittedAt,
        ...(Array.isArray(state.submissionTimestamps) ? state.submissionTimestamps : []),
      ]);

      return {
        questionId,
        selectedAnswer: typeof state.selectedAnswer === 'string' ? state.selectedAnswer.trim() : null,
        timeSpentMs: clampMs(
          state.timeSpentMs ??
          state.timeTakenMs ??
          (Number.isFinite(Number(state.timeTaken)) ? Number(state.timeTaken) * 1000 : 0)
        ),
        visitTimestamps,
        submissionTimestamps,
        visitedAt: parseDateValue(state.visitedAt),
        submittedAt: parseDateValue(state.submittedAt),
        lockedAt: parseDateValue(state.lockedAt),
        lastClientUpdatedAt: parseDateValue(state.lastClientUpdatedAt),
        isLocked: state.isLocked === true,
      };
    })
    .filter(Boolean);
};

const buildQuestionLookup = (questions) => {
  const questionMap = new Map();
  questions.forEach((question) => {
    questionMap.set(toObjectIdString(question._id), question);
  });
  return questionMap;
};

const calculateValidatedTotalTimeMs = ({ attempt, incomingTotalTimeMs, serverElapsedMs, flags }) => {
  const currentStoredMs = clampMs(attempt.totalTimeMs || attempt.totalTime * 1000 || 0);

  if (!Number.isFinite(incomingTotalTimeMs)) {
    return currentStoredMs;
  }

  if (incomingTotalTimeMs + MAX_ALLOWED_TIME_REGRESSION_MS < currentStoredMs) {
    appendFlag(
      flags,
      'time_regression_detected',
      `Incoming elapsed time ${incomingTotalTimeMs}ms is behind stored ${currentStoredMs}ms.`
    );
  }

  const allowedUpperBound = serverElapsedMs + MAX_ALLOWED_AHEAD_MS;

  if (incomingTotalTimeMs > allowedUpperBound) {
    appendFlag(
      flags,
      'time_ahead_of_server',
      `Incoming elapsed time ${incomingTotalTimeMs}ms exceeds server window ${allowedUpperBound}ms.`
    );
  }

  return Math.max(currentStoredMs, Math.min(incomingTotalTimeMs, allowedUpperBound));
};

const mergeAnswerState = ({ attempt, answer, question, incomingState, flags, now, finalizing }) => {
  const visitTimestamps = uniqueSortedDates([
    ...(Array.isArray(answer.visitTimestamps) ? answer.visitTimestamps : []),
    ...incomingState.visitTimestamps,
    incomingState.visitedAt,
  ]);

  if (visitTimestamps.length > 0) {
    answer.visitTimestamps = visitTimestamps;
    answer.firstVisitedAt = getEarliestDate(visitTimestamps);
    answer.lastVisitedAt = getLatestDate(visitTimestamps);
    answer.visitedAt = answer.firstVisitedAt;
  }

  if (incomingState.timeSpentMs > getQuestionTimeMs(answer)) {
    answer.timeTakenMs = incomingState.timeSpentMs;
    answer.timeTaken = msToSeconds(incomingState.timeSpentMs);
  } else {
    answer.timeTakenMs = getQuestionTimeMs(answer);
    answer.timeTaken = msToSeconds(answer.timeTakenMs);
  }

  const submissionTimestamps = uniqueSortedDates([
    ...(Array.isArray(answer.submissionTimestamps) ? answer.submissionTimestamps : []),
    ...incomingState.submissionTimestamps,
    incomingState.submittedAt,
  ]);

  if (submissionTimestamps.length > 0) {
    answer.submissionTimestamps = submissionTimestamps;
    answer.submittedAt = getLatestDate(submissionTimestamps);
  }

  if (incomingState.selectedAnswer) {
    const normalizedSelectedAnswer = normalizeSelectedAnswer(incomingState.selectedAnswer, question);

    if (!normalizedSelectedAnswer) {
      appendFlag(
        flags,
        'invalid_answer_option',
        `Question ${question.questionNumber} received an invalid answer label.`
      );
    } else if (
      answer.isLocked &&
      answer.selectedAnswer &&
      normalizedSelectedAnswer !== answer.selectedAnswer
    ) {
      appendFlag(
        flags,
        'answer_edit_rejected',
        `Attempt tried to change locked answer for question ${question.questionNumber}.`
      );
    } else {
      const existingSubmittedAt = parseDateValue(answer.submittedAt);
      const incomingSubmittedAt = pickLatestByTimestamp(
        incomingState.submittedAt,
        incomingState.lastClientUpdatedAt,
        getLatestDate(submissionTimestamps)
      );

      const shouldReplaceSelection =
        !answer.selectedAnswer ||
        !existingSubmittedAt ||
        (
          incomingSubmittedAt &&
          incomingSubmittedAt.getTime() >= existingSubmittedAt.getTime()
        );

      if (shouldReplaceSelection) {
        answer.selectedAnswer = normalizedSelectedAnswer;
      }
    }
  }

  const shouldLockAnswer =
    (incomingState.isLocked || (attempt.isQuickMode && Boolean(answer.selectedAnswer)) || finalizing) &&
    Boolean(answer.selectedAnswer);

  if (shouldLockAnswer && !answer.isLocked) {
    answer.isLocked = true;
    answer.lockSource = attempt.isQuickMode ? 'quick_mode' : finalizing ? 'submit' : 'sync';
    answer.lockedAt = pickLatestByTimestamp(
      incomingState.lockedAt,
      answer.submittedAt,
      incomingState.lastClientUpdatedAt,
      now
    );
  }

  answer.isCorrect = Boolean(answer.selectedAnswer) && answer.selectedAnswer === question.correctAnswer;
  answer.selectedOptionId = getOptionByLabel(question, answer.selectedAnswer)?._id || null;
  answer.correctOptionId = getOptionByLabel(question, question.correctAnswer)?._id || null;
  answer.marksAwarded = answer.isCorrect
    ? getQuestionMarks(question)
    : answer.selectedAnswer
      ? -getQuestionNegativeMarks(question)
      : 0;
  answer.answeredAt = answer.submittedAt || answer.answeredAt || null;
  answer.isSkipped = !answer.selectedAnswer;
  answer.lastClientUpdatedAt = pickLatestByTimestamp(
    answer.lastClientUpdatedAt,
    incomingState.lastClientUpdatedAt,
    incomingState.submittedAt,
    incomingState.visitedAt
  );
};

const classifySpeedBand = (averageAnsweredQuestionMs) => {
  if (!averageAnsweredQuestionMs) {
    return 'unclassified';
  }

  if (averageAnsweredQuestionMs <= 7_000) {
    return 'instant';
  }

  if (averageAnsweredQuestionMs <= 15_000) {
    return 'fast';
  }

  if (averageAnsweredQuestionMs <= 30_000) {
    return 'steady';
  }

  return 'deliberate';
};

export const buildAttemptAnalytics = ({ attempt, questions }) => {
  const questionLookup = buildQuestionLookup(questions);
  const answers = (attempt.answers || []).map((answer) => ({
    ...answer,
    timeTakenMs: getQuestionTimeMs(answer),
  }));

  const answeredAnswers = answers.filter((answer) => Boolean(answer.selectedAnswer));
  const correctAnswers = answeredAnswers.filter((answer) => answer.isCorrect);
  const wrongAnswers = answeredAnswers.filter((answer) => !answer.isCorrect);

  const totalQuestions = questions.length || attempt.totalQuestions || 0;
  const totalTimeMs = clampMs(attempt.totalTimeMs || attempt.totalTime * 1000 || 0);
  const answeredCount = answeredAnswers.length;
  const correctCount = correctAnswers.length;
  const wrongCount = wrongAnswers.length;
  const skippedCount = Math.max(totalQuestions - answeredCount, 0);
  const timeSpentCorrectMs = correctAnswers.reduce((sum, answer) => sum + answer.timeTakenMs, 0);
  const timeSpentWrongMs = wrongAnswers.reduce((sum, answer) => sum + answer.timeTakenMs, 0);
  const averageTimePerQuestionMs = totalQuestions > 0 ? totalTimeMs / totalQuestions : 0;
  const averageAnsweredQuestionMs = answeredCount > 0
    ? answeredAnswers.reduce((sum, answer) => sum + answer.timeTakenMs, 0) / answeredCount
    : 0;
  const averageCorrectAnswerMs = correctCount > 0 ? timeSpentCorrectMs / correctCount : 0;
  const averageWrongAnswerMs = wrongCount > 0 ? timeSpentWrongMs / wrongCount : 0;
  const totalMinutes = Math.max(totalTimeMs / 60_000, 1 / 60);
  const completionRate = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const accuracyOnAnswered = answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0;
  const paceScore = Math.max(
    0,
    Math.min(
      100,
      100 - (((averageTimePerQuestionMs || 0) - 30_000) / 30_000) * 40
    )
  );
  const accuracyScore = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
  const efficiencyScore = roundNumber((accuracyScore * 0.7) + (paceScore * 0.3), 1);

  const solvedByTime = correctAnswers
    .filter((answer) => answer.timeTakenMs > 0)
    .sort((left, right) => left.timeTakenMs - right.timeTakenMs);

  const fastestSolved = solvedByTime[0] || null;
  const slowestSolved = solvedByTime[solvedByTime.length - 1] || null;

  return {
    answeredCount,
    correctCount,
    wrongCount,
    skippedCount,
    averageTimePerQuestionMs: Math.round(averageTimePerQuestionMs),
    timeSpentCorrectMs,
    timeSpentWrongMs,
    fastestSolvedQuestionId: fastestSolved ? fastestSolved.questionId : null,
    fastestSolvedTimeMs: fastestSolved ? fastestSolved.timeTakenMs : 0,
    slowestSolvedQuestionId: slowestSolved ? slowestSolved.questionId : null,
    slowestSolvedTimeMs: slowestSolved ? slowestSolved.timeTakenMs : 0,
    responseSpeed: {
      averageAnsweredQuestionMs: Math.round(averageAnsweredQuestionMs),
      averageCorrectAnswerMs: Math.round(averageCorrectAnswerMs),
      averageWrongAnswerMs: Math.round(averageWrongAnswerMs),
      answersPerMinute: roundNumber(answeredCount / totalMinutes, 2),
      correctAnswersPerMinute: roundNumber(correctCount / totalMinutes, 2),
      speedBand: classifySpeedBand(averageAnsweredQuestionMs),
    },
    completionEfficiency: {
      completionRate: roundNumber(completionRate, 1),
      accuracyOnAnswered: roundNumber(accuracyOnAnswered, 1),
      efficiencyScore,
      answeredPerMinute: roundNumber(answeredCount / totalMinutes, 2),
    },
    fastestSolvedQuestion: fastestSolved
      ? {
          questionId: fastestSolved.questionId,
          questionNumber: questionLookup.get(toObjectIdString(fastestSolved.questionId))?.questionNumber || null,
          questionText: questionLookup.get(toObjectIdString(fastestSolved.questionId))?.questionText || '',
          timeMs: fastestSolved.timeTakenMs,
        }
      : null,
    slowestSolvedQuestion: slowestSolved
      ? {
          questionId: slowestSolved.questionId,
          questionNumber: questionLookup.get(toObjectIdString(slowestSolved.questionId))?.questionNumber || null,
          questionText: questionLookup.get(toObjectIdString(slowestSolved.questionId))?.questionText || '',
          timeMs: slowestSolved.timeTakenMs,
        }
      : null,
  };
};

const applySuspiciousFlags = (attempt, flags) => {
  if (!flags.length) {
    return;
  }

  const existingFlags = Array.isArray(attempt.suspiciousActivity?.flags)
    ? attempt.suspiciousActivity.flags
    : [];
  const mergedFlags = [...existingFlags, ...flags].slice(-MAX_STORED_FLAGS);
  const timeFlagCount = flags.filter((flag) => flag.code.startsWith('time_') || flag.code === 'question_time_exceeds_total').length;
  const editRejectedCount = flags.filter((flag) => flag.code === 'answer_edit_rejected').length;

  attempt.suspiciousActivity = {
    ...(attempt.suspiciousActivity?.toObject ? attempt.suspiciousActivity.toObject() : attempt.suspiciousActivity),
    timeMismatchCount: (attempt.suspiciousActivity?.timeMismatchCount || 0) + timeFlagCount,
    answerEditRejectedCount: (attempt.suspiciousActivity?.answerEditRejectedCount || 0) + editRejectedCount,
    flags: mergedFlags,
  };

  logger.warn(
    `Suspicious tracking flags recorded for attempt ${attempt._id}:`,
    flags.map((flag) => flag.code).join(', ')
  );
};

export const buildInitialAnswerStates = (questions) => {
  return questions.map((question) => ({
    questionId: question._id,
    selectedAnswer: null,
    selectedOptionId: null,
    correctOptionId: getOptionByLabel(question, question.correctAnswer)?._id || null,
    isCorrect: false,
    marksAwarded: 0,
    isLocked: false,
    lockSource: null,
    timeTaken: 0,
    timeTakenMs: 0,
    visitedAt: null,
    firstVisitedAt: null,
    lastVisitedAt: null,
    visitTimestamps: [],
    submittedAt: null,
    answeredAt: null,
    submissionTimestamps: [],
    lockedAt: null,
    lastClientUpdatedAt: null,
    isSkipped: true,
  }));
};

export const getRequestSessionId = (req) => {
  return req.get('x-quiz-session-id') || req.body?.sessionId || req.query?.sessionId || null;
};

export const buildAttemptOwnerFilter = (req) => {
  if (req.user?._id) {
    return {
      userId: req.user._id,
    };
  }

  const sessionId = getRequestSessionId(req);

  if (sessionId) {
    return {
      userId: null,
      sessionId,
    };
  }

  return null;
};

export const assertAttemptWriteAccess = (attempt, req) => {
  if (attempt.userId) {
    if (!req.user || toObjectIdString(req.user._id) !== toObjectIdString(attempt.userId)) {
      throw new AppError('Not authorized to modify this attempt', 403);
    }

    return;
  }

  const sessionId = getRequestSessionId(req);

  if (!sessionId || sessionId !== attempt.sessionId) {
    throw new AppError('Attempt session mismatch', 403);
  }
};

export const assertAttemptReadAccess = ({ attempt, req, allowUploader = false, quizUploaderId = null }) => {
  if (!attempt.userId) {
    const sessionId = getRequestSessionId(req);

    if (!sessionId || sessionId !== attempt.sessionId) {
      throw new AppError('Not authorized to view this attempt', 403);
    }

    return;
  }

  if (!req.user) {
    throw new AppError('Not authorized to view this attempt', 401);
  }

  const isOwner = toObjectIdString(req.user._id) === toObjectIdString(attempt.userId);
  const isUploader = allowUploader && quizUploaderId &&
    toObjectIdString(req.user._id) === toObjectIdString(quizUploaderId);

  if (!isOwner && !isUploader) {
    throw new AppError('Not authorized to view this attempt', 403);
  }
};

export const mergeAttemptTrackingPayload = ({ attempt, questions, payload = {}, finalizing = false }) => {
  const now = new Date();
  const questionLookup = buildQuestionLookup(questions);
  const flags = [];
  const normalizedQuestionStates = normalizeQuestionStates(
    payload.questionStates || payload.answers || []
  );
  const serverElapsedMs = Math.max(0, now.getTime() - new Date(attempt.startedAt).getTime());
  const incomingTotalTimeMs = clampMs(
    payload.totalElapsedMs ??
    payload.totalTimeMs ??
    (Number.isFinite(Number(payload.totalTime)) ? Number(payload.totalTime) * 1000 : 0)
  );

  questions.forEach((question) => {
    ensureAnswerEntry(attempt, question);
  });

  attempt.totalTimeMs = calculateValidatedTotalTimeMs({
    attempt,
    incomingTotalTimeMs,
    serverElapsedMs,
    flags,
  });
  attempt.totalTime = msToSeconds(attempt.totalTimeMs);
  attempt.lastClientSyncAt = parseDateValue(payload.clientTimestamp) || now;
  attempt.lastServerSyncAt = now;

  if (payload.currentQuestionId && questionLookup.has(toObjectIdString(payload.currentQuestionId))) {
    attempt.lastActiveQuestionId = payload.currentQuestionId;
  }

  if (Number.isFinite(Number(payload.stateVersion))) {
    attempt.syncVersion = Math.max(attempt.syncVersion || 0, Number(payload.stateVersion));
  }

  normalizedQuestionStates.forEach((incomingState) => {
    const question = questionLookup.get(incomingState.questionId);

    if (!question) {
      appendFlag(flags, 'unknown_question_reference', `Attempt synced unknown question ${incomingState.questionId}.`);
      return;
    }

    const answer = ensureAnswerEntry(attempt, question);
    mergeAnswerState({
      attempt,
      answer,
      question,
      incomingState,
      flags,
      now,
      finalizing,
    });
  });

  attempt.answers = questions.map((question) => {
    const answer = ensureAnswerEntry(attempt, question);
    answer.timeTakenMs = getQuestionTimeMs(answer);
    answer.timeTaken = msToSeconds(answer.timeTakenMs);
    answer.isCorrect = Boolean(answer.selectedAnswer) && answer.selectedAnswer === question.correctAnswer;
    answer.selectedOptionId = getOptionByLabel(question, answer.selectedAnswer)?._id || null;
    answer.correctOptionId = getOptionByLabel(question, question.correctAnswer)?._id || null;
    answer.marksAwarded = answer.isCorrect
      ? getQuestionMarks(question)
      : answer.selectedAnswer
        ? -getQuestionNegativeMarks(question)
        : 0;
    answer.answeredAt = answer.submittedAt || answer.answeredAt || null;
    answer.isSkipped = !answer.selectedAnswer;

    if (finalizing && answer.selectedAnswer && !answer.isLocked) {
      answer.isLocked = true;
      answer.lockSource = attempt.isQuickMode ? 'quick_mode' : 'submit';
      answer.lockedAt = pickLatestByTimestamp(answer.lockedAt, answer.submittedAt, now);
    }

    return answer;
  });

  const accumulatedQuestionTimeMs = attempt.answers.reduce(
    (sum, answer) => sum + getQuestionTimeMs(answer),
    0
  );

  if (accumulatedQuestionTimeMs > attempt.totalTimeMs + MAX_QUESTION_TIME_OVERFLOW_MS) {
    appendFlag(
      flags,
      'question_time_exceeds_total',
      `Question time ${accumulatedQuestionTimeMs}ms exceeds total time ${attempt.totalTimeMs}ms.`
    );
  }

  if (finalizing) {
    attempt.totalTimeMs = Math.max(attempt.totalTimeMs, serverElapsedMs);
    attempt.totalTime = msToSeconds(attempt.totalTimeMs);
    attempt.completedAt = now;
    attempt.status = 'completed';
    attempt.completed = true;
    attempt.syncStatus = 'synced';

    const totalMarks = questions.reduce((sum, question) => sum + getQuestionMarks(question), 0);
    const correctCount = attempt.answers.filter((answer) => answer.isCorrect).length;
    const wrongCount = attempt.answers.filter((answer) => answer.selectedAnswer && !answer.isCorrect).length;
    const unansweredCount = attempt.answers.filter((answer) => !answer.selectedAnswer).length;
    const score = attempt.answers.reduce((sum, answer) => sum + Number(answer.marksAwarded || 0), 0);

    attempt.score = Math.max(0, roundNumber(score, 2));
    attempt.totalMarks = totalMarks;
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.unansweredCount = unansweredCount;
    attempt.percentage = totalMarks > 0
      ? Math.max(0, Math.round((attempt.score / totalMarks) * 100))
      : 0;
    attempt.analytics = buildAttemptAnalytics({ attempt, questions });
  }

  applySuspiciousFlags(attempt, flags);

  return {
    flags,
    serverElapsedMs,
  };
};

export const buildQuizAnalytics = ({ quiz, questions, attempts }) => {
  const completedAttempts = attempts.filter((attempt) => attempt.status === 'completed');

  if (!completedAttempts.length) {
    return {
      totalAttempts: 0,
      avgScore: 0,
      highestScore: 0,
      lowestScore: 0,
      passRate: 0,
      averageCompletionTimeMs: 0,
      averageQuestionTimeMs: 0,
      averageTimePerQuestionMs: 0,
      fastestSolvedQuestion: null,
      slowestSolvedQuestion: null,
      questionWiseAccuracy: [],
      mostSkippedQuestions: [],
      skippedQuestions: [],
      mostIncorrectlyAnsweredQuestions: [],
      wrongAnswerFrequency: {},
      responseSpeed: {
        averageQuizTimeMs: 0,
        averageAnsweredQuestionMs: 0,
        averageCorrectAnswerMs: 0,
        averageWrongAnswerMs: 0,
        averageAnswersPerMinute: 0,
        averageCorrectAnswersPerMinute: 0,
        dominantSpeedBand: 'unclassified',
      },
      completionEfficiency: {
        averageCompletionRate: 0,
        averageAccuracyOnAnswered: 0,
        averageEfficiencyScore: 0,
        quickModeUsageRate: 0,
      },
    };
  }

  const questionStats = new Map(
    questions.map((question) => [
      toObjectIdString(question._id),
      {
        questionId: question._id,
        questionNumber: question.questionNumber,
        questionText: question.questionText,
        attemptsSeen: 0,
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
        totalTimeMs: 0,
        correctTimeMs: 0,
        wrongTimeMs: 0,
        wrongAnswerFrequency: {},
      },
    ])
  );

  let scoreTotal = 0;
  let passCount = 0;
  let highestScore = 0;
  let lowestScore = Number.POSITIVE_INFINITY;
  let totalQuizTimeMs = 0;
  let totalAnsweredQuestionMs = 0;
  let totalCorrectQuestionMs = 0;
  let totalWrongQuestionMs = 0;
  let totalAnsweredCount = 0;
  let totalCorrectCount = 0;
  let totalWrongCount = 0;
  let completionRateSum = 0;
  let accuracyOnAnsweredSum = 0;
  let efficiencyScoreSum = 0;
  let quickModeCount = 0;
  const speedBandCounts = new Map();

  completedAttempts.forEach((attempt) => {
    const analytics = attempt.analytics?.responseSpeed
      ? attempt.analytics
      : buildAttemptAnalytics({ attempt, questions });

    scoreTotal += attempt.score || 0;
    highestScore = Math.max(highestScore, attempt.score || 0);
    lowestScore = Math.min(lowestScore, attempt.score || 0);
    totalQuizTimeMs += clampMs(attempt.totalTimeMs || attempt.totalTime * 1000 || 0);
    totalAnsweredQuestionMs += analytics.responseSpeed.averageAnsweredQuestionMs * analytics.answeredCount;
    totalCorrectQuestionMs += analytics.responseSpeed.averageCorrectAnswerMs * analytics.correctCount;
    totalWrongQuestionMs += analytics.responseSpeed.averageWrongAnswerMs * analytics.wrongCount;
    totalAnsweredCount += analytics.answeredCount;
    totalCorrectCount += analytics.correctCount;
    totalWrongCount += analytics.wrongCount;
    completionRateSum += analytics.completionEfficiency.completionRate;
    accuracyOnAnsweredSum += analytics.completionEfficiency.accuracyOnAnswered;
    efficiencyScoreSum += analytics.completionEfficiency.efficiencyScore;
    quickModeCount += attempt.isQuickMode ? 1 : 0;
    passCount += (attempt.percentage || 0) >= 50 ? 1 : 0;

    const speedBand = analytics.responseSpeed.speedBand || 'unclassified';
    speedBandCounts.set(speedBand, (speedBandCounts.get(speedBand) || 0) + 1);

    (attempt.answers || []).forEach((answer) => {
      const questionId = toObjectIdString(answer.questionId);
      const stats = questionStats.get(questionId);

      if (!stats) {
        return;
      }

      const timeTakenMs = getQuestionTimeMs(answer);

      stats.attemptsSeen += 1;
      stats.totalTimeMs += timeTakenMs;

      if (!answer.selectedAnswer) {
        stats.skippedCount += 1;
        return;
      }

      stats.answeredCount += 1;

      if (answer.isCorrect) {
        stats.correctCount += 1;
        stats.correctTimeMs += timeTakenMs;
      } else {
        stats.wrongCount += 1;
        stats.wrongTimeMs += timeTakenMs;
        stats.wrongAnswerFrequency[answer.selectedAnswer] = (stats.wrongAnswerFrequency[answer.selectedAnswer] || 0) + 1;
      }
    });
  });

  const questionWiseAccuracy = Array.from(questionStats.values()).map((stats) => {
    const attemptBase = Math.max(stats.attemptsSeen, 1);
    const answeredBase = Math.max(stats.answeredCount, 1);

    return {
      questionId: stats.questionId,
      questionNumber: stats.questionNumber,
      questionText: stats.questionText,
      averageTimeMs: stats.attemptsSeen > 0 ? Math.round(stats.totalTimeMs / stats.attemptsSeen) : 0,
      accuracyPercentage: stats.attemptsSeen > 0 ? roundNumber((stats.correctCount / attemptBase) * 100, 1) : 0,
      answerRatePercentage: stats.attemptsSeen > 0 ? roundNumber((stats.answeredCount / attemptBase) * 100, 1) : 0,
      averageCorrectTimeMs: stats.correctCount > 0 ? Math.round(stats.correctTimeMs / stats.correctCount) : 0,
      averageWrongTimeMs: stats.wrongCount > 0 ? Math.round(stats.wrongTimeMs / stats.wrongCount) : 0,
      correctCount: stats.correctCount,
      wrongCount: stats.wrongCount,
      skippedCount: stats.skippedCount,
      attemptsSeen: stats.attemptsSeen,
      answeredCount: stats.answeredCount,
      accuracyOnAnswered: stats.answeredCount > 0 ? roundNumber((stats.correctCount / answeredBase) * 100, 1) : 0,
      wrongAnswerFrequency: stats.wrongAnswerFrequency,
    };
  });

  const solvedQuestions = questionWiseAccuracy.filter((question) => question.correctCount > 0);
  const fastestSolvedQuestion = solvedQuestions.length
    ? [...solvedQuestions].sort((left, right) => left.averageCorrectTimeMs - right.averageCorrectTimeMs)[0]
    : null;
  const slowestSolvedQuestion = solvedQuestions.length
    ? [...solvedQuestions].sort((left, right) => right.averageCorrectTimeMs - left.averageCorrectTimeMs)[0]
    : null;

  const dominantSpeedBand = [...speedBandCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] || 'unclassified';

  return {
    totalAttempts: completedAttempts.length,
    avgScore: roundNumber(scoreTotal / completedAttempts.length, 1),
    highestScore,
    lowestScore: Number.isFinite(lowestScore) ? lowestScore : 0,
    passRate: Math.round((passCount / completedAttempts.length) * 100),
    averageCompletionTimeMs: Math.round(totalQuizTimeMs / completedAttempts.length),
    averageQuestionTimeMs: questions.length > 0
      ? Math.round((totalQuizTimeMs / completedAttempts.length) / questions.length)
      : 0,
    averageTimePerQuestionMs: questions.length > 0
      ? Math.round((totalQuizTimeMs / completedAttempts.length) / questions.length)
      : 0,
    fastestSolvedQuestion,
    slowestSolvedQuestion,
    questionWiseAccuracy,
    mostSkippedQuestions: [...questionWiseAccuracy]
      .sort((left, right) => right.skippedCount - left.skippedCount)
      .slice(0, 5),
    skippedQuestions: [...questionWiseAccuracy]
      .sort((left, right) => right.skippedCount - left.skippedCount),
    mostIncorrectlyAnsweredQuestions: [...questionWiseAccuracy]
      .sort((left, right) => right.wrongCount - left.wrongCount)
      .slice(0, 5),
    wrongAnswerFrequency: questionWiseAccuracy.reduce((acc, question) => {
      acc[question.questionId] = question.wrongAnswerFrequency;
      return acc;
    }, {}),
    responseSpeed: {
      averageQuizTimeMs: Math.round(totalQuizTimeMs / completedAttempts.length),
      averageAnsweredQuestionMs: totalAnsweredCount > 0 ? Math.round(totalAnsweredQuestionMs / totalAnsweredCount) : 0,
      averageCorrectAnswerMs: totalCorrectCount > 0 ? Math.round(totalCorrectQuestionMs / totalCorrectCount) : 0,
      averageWrongAnswerMs: totalWrongCount > 0 ? Math.round(totalWrongQuestionMs / totalWrongCount) : 0,
      averageAnswersPerMinute: roundNumber(
        completedAttempts.reduce((sum, attempt) => sum + (attempt.analytics?.responseSpeed?.answersPerMinute || 0), 0) /
        completedAttempts.length,
        2
      ),
      averageCorrectAnswersPerMinute: roundNumber(
        completedAttempts.reduce((sum, attempt) => sum + (attempt.analytics?.responseSpeed?.correctAnswersPerMinute || 0), 0) /
        completedAttempts.length,
        2
      ),
      dominantSpeedBand,
    },
    completionEfficiency: {
      averageCompletionRate: roundNumber(completionRateSum / completedAttempts.length, 1),
      averageAccuracyOnAnswered: roundNumber(accuracyOnAnsweredSum / completedAttempts.length, 1),
      averageEfficiencyScore: roundNumber(efficiencyScoreSum / completedAttempts.length, 1),
      quickModeUsageRate: roundNumber((quickModeCount / completedAttempts.length) * 100, 1),
    },
  };
};
