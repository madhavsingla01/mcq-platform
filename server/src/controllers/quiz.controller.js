import Quiz from '../models/Quiz.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import Upload from '../models/Upload.model.js';
import QuestionAnalytics from '../models/QuestionAnalytics.model.js';
import { catchAsync, AppError } from '../middleware/error.middleware.js';
import { parseExcel } from '../services/parser/excelParser.js';
import { parseCsv } from '../services/parser/csvParser.js';
import { parseJson } from '../services/parser/jsonParser.js';
import { extractOptions } from '../services/parser/optionExtractor.js';
import { normalizeAnswer } from '../services/parser/answerDetector.js';
import { generateShareCode } from '../utils/generateId.js';
import { logger } from '../utils/logger.js';
import {
  assertAttemptReadAccess,
  assertAttemptWriteAccess,
  buildAttemptAnalytics,
  buildAttemptOwnerFilter,
  buildInitialAnswerStates,
  buildQuizAnalytics,
  getRequestSessionId,
  mergeAttemptTrackingPayload,
} from '../services/quiz/attemptTracking.service.js';
import {
  recordAnswerChanges,
  recordEvent,
  recordSearch,
  upsertRecentQuiz,
} from '../services/activity/activity.service.js';

const getParser = (fileType) => {
  if (fileType === 'xlsx' || fileType === 'xls') {
    return parseExcel;
  }

  if (fileType === 'csv') {
    return parseCsv;
  }

  if (fileType === 'json') {
    return parseJson;
  }

  throw new AppError(`Unsupported: ${fileType}`, 400);
};

const syncQuizAggregateFields = async (quizId) => {
  const [aggregate] = await Attempt.aggregate([
    {
      $match: {
        quizId,
        status: 'completed',
      },
    },
    {
      $group: {
        _id: null,
        totalAttempts: { $sum: 1 },
        avgScore: { $avg: '$score' },
        avgPercentage: { $avg: '$percentage' },
      },
    },
  ]);

  await Quiz.findByIdAndUpdate(quizId, {
    totalAttempts: aggregate?.totalAttempts || 0,
    avgScore: aggregate?.avgPercentage ? Math.round(aggregate.avgPercentage * 10) / 10 : 0,
  });
};

const getQuizQuestionsSorted = (quizId) => {
  return Question.find({ quizId })
    .select('-metadata -createdAt -updatedAt -__v')
    .sort({ orderIndex: 1, questionNumber: 1 });
};

const toObjectIdString = (value) => (value ? String(value) : '');

const clampPagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const getQuizTotalMarks = (questions) => {
  return questions.reduce((sum, question) => {
    const marks = Number(question.marks);
    return sum + (Number.isFinite(marks) && marks >= 0 ? marks : 1);
  }, 0);
};

const normalizeVisibility = (visibility, fallback = 'private') => {
  return ['public', 'private', 'unlisted'].includes(visibility) ? visibility : fallback;
};

const normalizeDifficulty = (difficulty) => {
  return ['Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(difficulty)
    ? difficulty
    : 'All Levels';
};

const assertQuizManageAccess = (quiz, req) => {
  if (!req.user) {
    throw new AppError('Not authorized', 401);
  }

  const isOwner = toObjectIdString(quiz.uploader) === toObjectIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw new AppError('Not authorized to manage this quiz', 403);
  }
};

const assertQuizReadAccess = (quiz, req) => {
  if (quiz.visibility === 'public' || quiz.visibility === 'unlisted' || quiz.isPublic) {
    return;
  }

  if (!req.user) {
    throw new AppError('Not authorized to view this quiz', 401);
  }

  const isOwner = toObjectIdString(quiz.uploader) === toObjectIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw new AppError('Not authorized to view this quiz', 403);
  }
};

const normalizeQuestionInput = (question, index) => {
  const questionText = String(question.question || question.questionText || '').trim();

  if (!questionText) {
    throw new AppError(`Question ${index + 1} text is required`, 400);
  }

  const rawOptions = Array.isArray(question.options) ? question.options : [];

  if (rawOptions.length < 2) {
    throw new AppError(`Question ${index + 1} needs at least two options`, 400);
  }

  const correctAnswerInput = question.correctAnswer || question.correct_answer || question.answer;
  const options = rawOptions.map((option, optionIndex) => {
    const label = String(option.label || String.fromCharCode(65 + optionIndex)).trim().toUpperCase();
    const text = String(option.text || option.optionText || option.option_text || '').trim();

    if (!text) {
      throw new AppError(`Question ${index + 1} option ${optionIndex + 1} text is required`, 400);
    }

    return {
      label,
      text,
      isCorrect: option.isCorrect === true || option.is_correct === true,
    };
  });

  let correctAnswer = options.find((option) => option.isCorrect)?.label || '';

  if (!correctAnswer && correctAnswerInput) {
    const normalizedAnswer = String(correctAnswerInput).trim().toUpperCase();
    const matchingOption = options.find(
      (option) => option.label === normalizedAnswer || option.text.trim().toUpperCase() === normalizedAnswer
    );

    correctAnswer = matchingOption?.label || '';
  }

  if (!correctAnswer) {
    throw new AppError(`Question ${index + 1} correct answer is required`, 400);
  }

  return {
    questionNumber: index + 1,
    questionText,
    options: options.map((option) => ({
      ...option,
      isCorrect: option.label === correctAnswer,
    })),
    correctAnswer,
    explanation: String(question.explanation || '').trim(),
    difficulty: normalizeDifficulty(question.difficulty),
    category: String(question.category || 'General').trim() || 'General',
    marks: Math.max(Number(question.marks ?? 1) || 1, 0),
    negativeMarks: Math.max(Number(question.negativeMarks ?? question.negative_marks ?? 0) || 0, 0),
    orderIndex: Number.isFinite(Number(question.orderIndex ?? question.order_index))
      ? Number(question.orderIndex ?? question.order_index)
      : index,
    metadata: question.metadata || {},
  };
};

const normalizeQuizInput = (payload) => {
  const title = String(payload.title || '').trim();

  if (!title) {
    throw new AppError('title is required', 400);
  }

  const rawTimerMode = payload.timerMode ?? payload.settings?.timerMode ?? 'none';
  const timerMode = ['none', 'soft', 'strict'].includes(rawTimerMode) ? rawTimerMode : 'none';

  return {
    title,
    description: String(payload.description || '').trim(),
    category: String(payload.category || 'General').trim() || 'General',
    difficulty: normalizeDifficulty(payload.difficulty),
    thumbnail: String(payload.thumbnail || '').trim(),
    visibility: normalizeVisibility(payload.visibility, payload.isPublic ? 'public' : 'private'),
    quickModeEnabled: payload.quickModeEnabled !== false && payload.quick_mode_enabled !== false,
    settings: {
      timeLimit: Math.max(Number(payload.timeLimit ?? payload.time_limit ?? payload.settings?.timeLimit ?? 0) || 0, 0),
      timerMode,
      instantFeedback: payload.instantFeedback === true || payload.settings?.instantFeedback === true,
      shuffleQuestions: payload.shuffleQuestions === true || payload.settings?.shuffleQuestions === true,
      shuffleOptions: payload.shuffleOptions === true || payload.settings?.shuffleOptions === true,
      showExplanation: payload.showExplanation !== false && payload.settings?.showExplanation !== false,
      allowReview: payload.allowReview !== false && payload.settings?.allowReview !== false,
    },
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : [],
  };
};

const syncQuestionAnalyticsForQuiz = async (quizId) => {
  const [questions, attempts] = await Promise.all([
    getQuizQuestionsSorted(quizId).lean(),
    Attempt.find({ quizId, status: 'completed' }).lean(),
  ]);

  const operations = questions.map((question) => {
    const questionId = toObjectIdString(question._id);
    const wrongAnswerFrequency = {};
    let totalAttempts = 0;
    let correctAttempts = 0;
    let wrongAttempts = 0;
    let skippedAttempts = 0;
    let totalTime = 0;

    attempts.forEach((attempt) => {
      const answer = (attempt.answers || []).find(
        (item) => toObjectIdString(item.questionId) === questionId
      );

      totalAttempts += 1;

      if (!answer || !answer.selectedAnswer) {
        skippedAttempts += 1;
        return;
      }

      totalTime += Number(answer.timeTakenMs) || Number(answer.timeTaken || 0) * 1000;

      if (answer.isCorrect) {
        correctAttempts += 1;
      } else {
        wrongAttempts += 1;
        wrongAnswerFrequency[answer.selectedAnswer] = (wrongAnswerFrequency[answer.selectedAnswer] || 0) + 1;
      }
    });

    return {
      updateOne: {
        filter: { questionId: question._id },
        update: {
          $set: {
            quizId,
            totalAttempts,
            correctAttempts,
            wrongAttempts,
            skippedAttempts,
            avgTimeTaken: totalAttempts > 0 ? Math.round(totalTime / totalAttempts) : 0,
            accuracyPercentage: totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 1000) / 10 : 0,
            wrongAnswerFrequency,
          },
        },
        upsert: true,
      },
    };
  });

  if (operations.length) {
    await QuestionAnalytics.bulkWrite(operations);
  }
};

export const generateQuiz = catchAsync(async (req, res, next) => {
  const { uploadId, title, description, settings } = req.body;

  if (!uploadId) {
    return next(new AppError('uploadId required', 400));
  }

  const upload = await Upload.findById(uploadId);

  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  if (upload.status !== 'mapped') {
    return next(new AppError('Must be mapped first', 400));
  }

  const { columnMapping } = upload;
  const { rows } = getParser(upload.fileType)(upload.filePath);
  const questions = [];
  let skipped = 0;

  for (const row of rows) {
    const questionText = row[columnMapping.question];

    if (!questionText || !String(questionText).trim()) {
      skipped += 1;
      continue;
    }

    const options = extractOptions(row, columnMapping.options);

    if (options.length < 2) {
      skipped += 1;
      continue;
    }

    let correctAnswer = '';

    if (columnMapping.answer) {
      correctAnswer = normalizeAnswer(row[columnMapping.answer], options);
    }

    let explanation = '';

    if (columnMapping.explanation) {
      explanation = String(row[columnMapping.explanation] || '').trim();
    }

    questions.push({
      questionNumber: questions.length + 1,
      questionText: String(questionText).trim(),
      options: options.map((option) => ({
        ...option,
        isCorrect: option.label === correctAnswer,
      })),
      correctAnswer,
      explanation,
      difficulty: normalizeDifficulty(row[columnMapping.difficulty]),
      category: String(row[columnMapping.category] || 'General').trim() || 'General',
      marks: Math.max(Number(row[columnMapping.marks] ?? 1) || 1, 0),
      negativeMarks: Math.max(Number(row[columnMapping.negativeMarks] ?? 0) || 0, 0),
      orderIndex: questions.length,
      metadata: columnMapping.serial ? { serial: row[columnMapping.serial] } : {},
    });
  }

  if (!questions.length) {
    return next(new AppError('No valid questions extracted', 422));
  }

  const totalMarks = getQuizTotalMarks(questions);
  const normalizedSettings = settings || {};
  const quiz = await Quiz.create({
    title: title || `Quiz from ${upload.originalName}`,
    description: description || '',
    category: req.body.category || 'General',
    difficulty: normalizeDifficulty(req.body.difficulty),
    thumbnail: req.body.thumbnail || '',
    visibility: normalizeVisibility(req.body.visibility, req.body.isPublic ? 'public' : 'private'),
    uploader: upload.userId || null,
    questionCount: questions.length,
    totalMarks,
    quickModeEnabled: req.body.quickModeEnabled !== false,
    settings: normalizedSettings,
    sourceFile: {
      name: upload.originalName,
      type: upload.fileType,
      size: upload.fileSize,
    },
    columnMapping,
    shareCode: generateShareCode(),
  });

  await Question.insertMany(
    questions.map((question) => ({
      ...question,
      quizId: quiz._id,
    }))
  );

  upload.status = 'generated';
  upload.quizId = quiz._id;
  await upload.save();

  await recordEvent({
    req,
    eventType: 'QUIZ_CREATED',
    category: 'quiz',
    quizId: quiz._id,
    uploadId: upload._id,
    metadata: {
      questionCount: questions.length,
      skipped,
      sourceFile: upload.originalName,
      generatedFromUpload: true,
    },
  });

  logger.info(`Quiz: "${quiz.title}" — ${questions.length} questions, ${skipped} skipped`);

  res.status(201).json({
    success: true,
    data: {
      quiz,
      questionCount: questions.length,
      skipped,
    },
  });
});

export const getQuiz = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id).populate('uploader', 'name');

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  assertQuizReadAccess(quiz, req);
  await upsertRecentQuiz({ req, quizId: quiz._id });

  res.json({
    success: true,
    data: {
      quiz,
    },
  });
});

export const getQuizQuestions = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  assertQuizReadAccess(quiz, req);

  const questions = await getQuizQuestionsSorted(quiz._id);

  res.json({
    success: true,
    data: {
      questions,
      total: quiz.questionCount,
    },
  });
});

export const getActiveAttempt = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  assertQuizReadAccess(quiz, req);

  const ownerFilter = buildAttemptOwnerFilter(req);

  if (!ownerFilter) {
    return res.json({
      success: true,
      data: {
        attempt: null,
      },
    });
  }

  const explicitAttemptId = req.query.attemptId;
  let attempt = null;

  if (explicitAttemptId) {
    attempt = await Attempt.findOne({
      _id: explicitAttemptId,
      quizId: quiz._id,
      status: 'in_progress',
      ...ownerFilter,
    });
  }

  if (!attempt) {
    attempt = await Attempt.findOne({
      quizId: quiz._id,
      status: 'in_progress',
      ...ownerFilter,
    }).sort({ createdAt: -1 });
  }

  res.json({
    success: true,
    data: {
      attempt,
    },
  });
});

export const startAttempt = catchAsync(async (req, res, next) => {
  const quizId = req.params.id || req.body.quizId;
  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  assertQuizReadAccess(quiz, req);

  const sessionId = getRequestSessionId(req);

  if (!req.user && !sessionId) {
    return next(new AppError('sessionId required for guest attempts', 400));
  }

  const ownerFilter = buildAttemptOwnerFilter(req);
  const forceNew = req.body.forceNew === true;
  let existingAttempt = ownerFilter
    ? await Attempt.findOne({
        quizId: quiz._id,
        status: 'in_progress',
        ...ownerFilter,
      }).sort({ createdAt: -1 })
    : null;

  if (existingAttempt && forceNew) {
    existingAttempt.status = 'abandoned';
    existingAttempt.completed = false;
    existingAttempt.syncStatus = 'synced';
    await existingAttempt.save();
    existingAttempt = null;
  }

  if (existingAttempt) {
    await Promise.all([
      upsertRecentQuiz({ req, quizId: quiz._id, attempt: existingAttempt }),
      recordEvent({
        req,
        eventType: 'ATTEMPT_RECOVERED',
        category: 'attempt',
        quizId: quiz._id,
        attemptId: existingAttempt._id,
        metadata: {
          status: existingAttempt.status,
          recoveryMode: 'server',
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        attempt: existingAttempt,
        recovered: true,
      },
    });
  }

  const questions = await getQuizQuestionsSorted(quiz._id);
  const isQuickMode = quiz.quickModeEnabled !== false && req.body.isQuickMode === true;
  const instantFeedback = quiz.settings?.instantFeedback === true || req.body.instantFeedback === true || isQuickMode;

  // Timer architecture: compute deadline from quiz settings
  const timeLimitMinutes = Number(quiz.settings?.timeLimit || 0);
  const timerMode = quiz.settings?.timerMode || 'none';
  const allowedDurationMs = timeLimitMinutes > 0 ? timeLimitMinutes * 60 * 1000 : 0;
  const startedAt = new Date();
  const deadlineAt = allowedDurationMs > 0 && timerMode !== 'none'
    ? new Date(startedAt.getTime() + allowedDurationMs)
    : null;

  const attempt = await Attempt.create({
    quizId: quiz._id,
    userId: req.user?._id || null,
    sessionId: sessionId || null,
    answers: buildInitialAnswerStates(questions),
    totalQuestions: quiz.questionCount,
    totalMarks: quiz.totalMarks || getQuizTotalMarks(questions),
    isQuickMode,
    instantFeedback,
    timerMode,
    allowedDurationMs,
    deadlineAt,
    startedAt,
    lastServerSyncAt: new Date(),
    syncStatus: 'synced',
    progress: {
      currentQuestionId: questions[0]?._id || null,
      answeredCount: 0,
      markedForReviewCount: 0,
      totalQuestions: questions.length,
      percentage: 0,
      updatedAt: new Date(),
    },
  });

  await Promise.all([
    upsertRecentQuiz({ req, quizId: quiz._id, attempt }),
    recordEvent({
      req,
      eventType: 'ATTEMPT_STARTED',
      category: 'attempt',
      quizId: quiz._id,
      attemptId: attempt._id,
      metadata: {
        totalQuestions: questions.length,
        timerMode,
        isQuickMode,
        instantFeedback,
      },
    }),
  ]);

  res.status(201).json({
    success: true,
    data: {
      attempt,
      recovered: false,
    },
  });
});

export const syncAttempt = catchAsync(async (req, res, next) => {
  const attempt = await Attempt.findOne({
    _id: req.params.attemptId,
    quizId: req.params.id,
  });

  if (!attempt) {
    return next(new AppError('Attempt not found', 404));
  }

  assertAttemptWriteAccess(attempt, req);

  if (attempt.status !== 'in_progress') {
    return next(new AppError('Attempt is no longer in progress', 400));
  }

  const questions = await getQuizQuestionsSorted(attempt.quizId);
  const { flags, answerChanges } = mergeAttemptTrackingPayload({
    attempt,
    questions,
    payload: req.body,
    finalizing: false,
  });

  attempt.syncStatus = 'synced';
  await attempt.save();
  await Promise.all([
    recordAnswerChanges({ req, attempt, changes: answerChanges, source: 'sync' }),
    upsertRecentQuiz({
      req,
      quizId: attempt.quizId,
      attempt,
      lastVisitedQuestionId: attempt.lastActiveQuestionId,
    }),
    recordEvent({
      req,
      eventType: 'ATTEMPT_SYNCED',
      category: 'attempt',
      quizId: attempt.quizId,
      attemptId: attempt._id,
      questionId: attempt.lastActiveQuestionId,
      metadata: {
        stateVersion: attempt.syncVersion,
        progress: attempt.progress,
        suspiciousFlagCount: flags.length,
      },
    }),
    req.body.currentQuestionId ? recordEvent({
      req,
      eventType: 'QUESTION_NAVIGATED',
      category: 'attempt',
      quizId: attempt.quizId,
      attemptId: attempt._id,
      questionId: req.body.currentQuestionId,
      metadata: {
        stateVersion: attempt.syncVersion,
      },
    }) : null,
    Array.isArray(req.body.markedForReview) ? recordEvent({
      req,
      eventType: 'MARKED_FOR_REVIEW_UPDATED',
      category: 'attempt',
      quizId: attempt.quizId,
      attemptId: attempt._id,
      metadata: {
        markedForReview: req.body.markedForReview,
      },
    }) : null,
  ]);

  res.json({
    success: true,
    data: {
      attempt,
      sync: {
        serverTime: new Date().toISOString(),
        deadlineAt: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
        timerMode: attempt.timerMode || 'none',
        suspiciousFlags: flags,
      },
    },
  });
});

export const submitAttempt = catchAsync(async (req, res, next) => {
  const attempt = await Attempt.findOne({
    _id: req.params.attemptId,
    quizId: req.params.id,
  });

  if (!attempt) {
    return next(new AppError('Attempt not found', 404));
  }

  assertAttemptWriteAccess(attempt, req);

  const questions = await getQuizQuestionsSorted(attempt.quizId);

  if (attempt.status === 'completed') {
    if (!attempt.analytics?.responseSpeed) {
      attempt.analytics = buildAttemptAnalytics({ attempt, questions });
      await attempt.save();
    }
    await syncQuestionAnalyticsForQuiz(attempt.quizId);

    return res.json({
      success: true,
      data: {
        attempt,
        score: attempt.score,
        total: attempt.totalQuestions,
        percentage: attempt.percentage,
      },
    });
  }

  // Deadline validation for strict timer mode
  const isLateSubmission = attempt.timerMode === 'strict' &&
    attempt.deadlineAt &&
    new Date() > new Date(attempt.deadlineAt);

  if (isLateSubmission) {
    logger.info(`Late submission flagged for attempt ${attempt._id}`);
  }

  const { flags, answerChanges } = mergeAttemptTrackingPayload({
    attempt,
    questions,
    payload: req.body,
    finalizing: true,
  });

  if (isLateSubmission) {
    attempt.suspiciousActivity = attempt.suspiciousActivity || {};
    attempt.suspiciousActivity.flags = [
      ...(attempt.suspiciousActivity.flags || []),
      { code: 'LATE_SUBMISSION', message: 'Submitted after deadline expired', createdAt: new Date() },
    ];
  }

  await attempt.save();
  await Promise.all([
    recordAnswerChanges({ req, attempt, changes: answerChanges, source: 'submit' }),
    upsertRecentQuiz({
      req,
      quizId: attempt.quizId,
      attempt,
      lastVisitedQuestionId: attempt.lastActiveQuestionId,
    }),
    recordEvent({
      req,
      eventType: 'ATTEMPT_SUBMITTED',
      category: 'attempt',
      quizId: attempt.quizId,
      attemptId: attempt._id,
      metadata: {
        score: attempt.score,
        percentage: attempt.percentage,
        totalQuestions: attempt.totalQuestions,
        suspiciousFlagCount: flags.length + (isLateSubmission ? 1 : 0),
      },
    }),
  ]);
  await syncQuizAggregateFields(attempt.quizId);
  await syncQuestionAnalyticsForQuiz(attempt.quizId);

  res.json({
    success: true,
    data: {
      attempt,
      score: attempt.score,
      total: attempt.totalQuestions,
      percentage: attempt.percentage,
    },
  });
});

const getAttemptResultPayload = async ({ attemptId, req }) => {
  const attempt = await Attempt.findById(attemptId).populate({
    path: 'quizId',
    select: 'title uploader questionCount settings',
  });

  if (!attempt) {
    throw new AppError('Attempt not found', 404);
  }

  assertAttemptReadAccess({
    attempt,
    req,
    allowUploader: true,
    quizUploaderId: attempt.quizId?.uploader,
  });

  const questions = await getQuizQuestionsSorted(attempt.quizId?._id || attempt.quizId);

  if (!attempt.analytics?.responseSpeed) {
    attempt.analytics = buildAttemptAnalytics({ attempt, questions });
  }

  return {
    attempt,
    questions,
  };
};

export const getResult = catchAsync(async (req, res) => {
  const data = await getAttemptResultPayload({
    attemptId: req.params.attemptId,
    req,
  });

  res.json({
    success: true,
    data,
  });
});

export const getResultByAttemptId = catchAsync(async (req, res) => {
  const data = await getAttemptResultPayload({
    attemptId: req.params.attemptId,
    req,
  });

  res.json({
    success: true,
    data,
  });
});

export const getMyQuizzes = catchAsync(async (req, res) => {
  if (!req.user) {
    return res.json({
      success: true,
      data: {
        quizzes: [],
      },
    });
  }

  const quizzes = await Quiz.find({ uploader: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    data: {
      quizzes,
    },
  });
});

export const listQuizzes = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query);
  const search = String(req.query.search || '').trim();
  const filter = req.user
    ? {
        $or: [
          { visibility: 'public' },
          { isPublic: true },
          { uploader: req.user._id },
        ],
      }
    : {
        $or: [
          { visibility: 'public' },
          { isPublic: true },
        ],
      };

  if (search) {
    filter.$and = [{
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ],
    }];
  }

  if (req.query.category) {
    filter.category = String(req.query.category).trim();
  }

  if (req.query.difficulty) {
    filter.difficulty = normalizeDifficulty(req.query.difficulty);
  }

  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .populate('uploader', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  if (search) {
    await recordSearch({
      req,
      query: search,
      context: 'quiz_search',
      filters: {
        category: req.query.category || null,
        difficulty: req.query.difficulty || null,
      },
      resultCount: total,
    });
  }

  res.json({
    success: true,
    data: {
      quizzes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const createQuiz = catchAsync(async (req, res) => {
  const quizInput = normalizeQuizInput(req.body);
  const questionsInput = Array.isArray(req.body.questions) ? req.body.questions : [];

  if (!questionsInput.length) {
    throw new AppError('questions are required', 400);
  }

  const questions = questionsInput.map(normalizeQuestionInput);
  const quiz = await Quiz.create({
    ...quizInput,
    uploader: req.user._id,
    questionCount: questions.length,
    totalMarks: getQuizTotalMarks(questions),
    isPublic: quizInput.visibility === 'public',
    shareCode: generateShareCode(),
  });

  const createdQuestions = await Question.insertMany(
    questions.map((question) => ({
      ...question,
      quizId: quiz._id,
    }))
  );

  await recordEvent({
    req,
    eventType: 'QUIZ_CREATED',
    category: 'quiz',
    quizId: quiz._id,
    metadata: {
      questionCount: questions.length,
      createdManually: true,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      quiz,
      questions: createdQuestions,
    },
  });
});

export const updateQuiz = catchAsync(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);

  const quizInput = normalizeQuizInput({
    ...quiz.toObject(),
    ...req.body,
    title: req.body.title ?? quiz.title,
  });

  Object.assign(quiz, {
    ...quizInput,
    isPublic: quizInput.visibility === 'public',
  });

  if (Array.isArray(req.body.questions)) {
    const attemptCount = await Attempt.countDocuments({ quizId: quiz._id });

    if (attemptCount > 0) {
      throw new AppError('Questions cannot be replaced after attempts exist', 409);
    }

    const questions = req.body.questions.map(normalizeQuestionInput);
    await Question.deleteMany({ quizId: quiz._id });
    await Question.insertMany(questions.map((question) => ({ ...question, quizId: quiz._id })));
    quiz.questionCount = questions.length;
    quiz.totalMarks = getQuizTotalMarks(questions);
  }

  await quiz.save();
  await recordEvent({
    req,
    eventType: 'QUIZ_UPDATED',
    category: 'quiz',
    quizId: quiz._id,
    metadata: {
      fields: Object.keys(req.body || {}),
    },
  });

  res.json({
    success: true,
    data: {
      quiz,
    },
  });
});

export const deleteQuiz = catchAsync(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);

  await Promise.all([
    Quiz.deleteOne({ _id: quiz._id }),
    Question.deleteMany({ quizId: quiz._id }),
    Attempt.deleteMany({ quizId: quiz._id }),
    QuestionAnalytics.deleteMany({ quizId: quiz._id }),
  ]);

  await recordEvent({
    req,
    eventType: 'QUIZ_DELETED',
    category: 'quiz',
    quizId: quiz._id,
    metadata: {
      title: quiz.title,
    },
  });

  res.json({
    success: true,
    data: null,
  });
});

export const answerAttempt = catchAsync(async (req, res) => {
  const attempt = await Attempt.findById(req.params.id);

  if (!attempt) {
    throw new AppError('Attempt not found', 404);
  }

  assertAttemptWriteAccess(attempt, req);

  if (attempt.status !== 'in_progress') {
    throw new AppError('Attempt is no longer in progress', 400);
  }

  const questionId = req.body.questionId;

  if (!questionId) {
    throw new AppError('questionId is required', 400);
  }

  const questions = await getQuizQuestionsSorted(attempt.quizId);
  const question = questions.find((item) => toObjectIdString(item._id) === toObjectIdString(questionId));

  if (!question) {
    throw new AppError('Question not found for this attempt', 404);
  }

  const existingAnswer = attempt.answers.find(
    (answer) => toObjectIdString(answer.questionId) === toObjectIdString(question._id)
  );

  if (
    existingAnswer?.isLocked &&
    existingAnswer.selectedAnswer &&
    req.body.selectedAnswer &&
    existingAnswer.selectedAnswer !== req.body.selectedAnswer
  ) {
    throw new AppError('Locked answers cannot be changed', 409);
  }

  const { flags, answerChanges } = mergeAttemptTrackingPayload({
    attempt,
    questions,
    payload: {
      sessionId: req.body.sessionId,
      totalElapsedMs: req.body.totalElapsedMs,
      totalTimeMs: req.body.totalTimeMs,
      totalTime: req.body.totalTime,
      currentQuestionId: question._id,
      clientTimestamp: req.body.clientTimestamp || new Date().toISOString(),
      questionStates: [{
        questionId: question._id,
        selectedAnswer: req.body.selectedAnswer,
        timeSpentMs: req.body.timeSpentMs ?? req.body.time_spent,
        visitTimestamps: req.body.visitTimestamps,
        submittedAt: req.body.answeredAt || req.body.answered_at || new Date().toISOString(),
        submissionTimestamps: req.body.submissionTimestamps,
        isLocked: attempt.isQuickMode || req.body.locked === true,
        lockedAt: req.body.lockedAt || req.body.locked_at,
        lastClientUpdatedAt: req.body.clientTimestamp || new Date().toISOString(),
      }],
    },
    finalizing: false,
  });

  attempt.syncStatus = 'synced';
  await attempt.save();
  await Promise.all([
    recordAnswerChanges({ req, attempt, changes: answerChanges, source: 'answer' }),
    upsertRecentQuiz({
      req,
      quizId: attempt.quizId,
      attempt,
      lastVisitedQuestionId: attempt.lastActiveQuestionId,
    }),
    recordEvent({
      req,
      eventType: 'ANSWER_SELECTED',
      category: 'answer',
      quizId: attempt.quizId,
      attemptId: attempt._id,
      questionId,
      metadata: {
        selectedAnswer: req.body.selectedAnswer || null,
        suspiciousFlagCount: flags.length,
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      attempt,
      sync: {
        serverTime: new Date().toISOString(),
        suspiciousFlags: flags,
      },
    },
  });
});

export const syncAttemptTime = catchAsync(async (req, res) => {
  const attempt = await Attempt.findById(req.params.id);

  if (!attempt) {
    throw new AppError('Attempt not found', 404);
  }

  assertAttemptWriteAccess(attempt, req);

  if (attempt.status !== 'in_progress') {
    throw new AppError('Attempt is no longer in progress', 400);
  }

  const questions = await getQuizQuestionsSorted(attempt.quizId);
  const { flags, answerChanges } = mergeAttemptTrackingPayload({
    attempt,
    questions,
    payload: {
      sessionId: req.body.sessionId,
      totalElapsedMs: req.body.totalElapsedMs,
      totalTimeMs: req.body.totalTimeMs,
      totalTime: req.body.totalTime,
      currentQuestionId: req.body.currentQuestionId,
      clientTimestamp: req.body.clientTimestamp || new Date().toISOString(),
      questionStates: req.body.questionStates || [],
    },
    finalizing: false,
  });

  attempt.syncStatus = 'synced';
  await attempt.save();
  await Promise.all([
    recordAnswerChanges({ req, attempt, changes: answerChanges, source: 'sync' }),
    upsertRecentQuiz({
      req,
      quizId: attempt.quizId,
      attempt,
      lastVisitedQuestionId: attempt.lastActiveQuestionId,
    }),
    recordEvent({
      req,
      eventType: 'ATTEMPT_TIME_SYNCED',
      category: 'attempt',
      quizId: attempt.quizId,
      attemptId: attempt._id,
      questionId: attempt.lastActiveQuestionId,
      metadata: {
        totalTimeMs: attempt.totalTimeMs,
        progress: attempt.progress,
        suspiciousFlagCount: flags.length,
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      attempt,
      sync: {
        serverTime: new Date().toISOString(),
        suspiciousFlags: flags,
      },
    },
  });
});

/**
 * GET /api/v1/attempts/in-progress
 * Fetch the authenticated user's active/in-progress attempts.
 */
export const getInProgressAttempts = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  
  const attempts = await Attempt.find({
    userId: req.user._id,
    completed: false,
    status: 'in_progress',
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, 50))
    .populate('quizId', 'title questionCount settings')
    .lean();

  res.status(200).json({
    success: true,
    data: {
      attempts: attempts.filter(a => a.quizId),
    },
  });
});

export const submitAttemptById = catchAsync(async (req, res) => {
  const attempt = await Attempt.findById(req.params.id);

  if (!attempt) {
    throw new AppError('Attempt not found', 404);
  }

  assertAttemptWriteAccess(attempt, req);

  const questions = await getQuizQuestionsSorted(attempt.quizId);

  if (attempt.status !== 'completed') {
    const { answerChanges } = mergeAttemptTrackingPayload({
      attempt,
      questions,
      payload: req.body,
      finalizing: true,
    });

    await attempt.save();
    await Promise.all([
      recordAnswerChanges({ req, attempt, changes: answerChanges, source: 'submit' }),
      upsertRecentQuiz({
        req,
        quizId: attempt.quizId,
        attempt,
        lastVisitedQuestionId: attempt.lastActiveQuestionId,
      }),
      recordEvent({
        req,
        eventType: 'ATTEMPT_SUBMITTED',
        category: 'attempt',
        quizId: attempt.quizId,
        attemptId: attempt._id,
        metadata: {
          score: attempt.score,
          percentage: attempt.percentage,
          totalQuestions: attempt.totalQuestions,
        },
      }),
    ]);
    await syncQuizAggregateFields(attempt.quizId);
    await syncQuestionAnalyticsForQuiz(attempt.quizId);
  }

  res.json({
    success: true,
    data: {
      attempt,
      score: attempt.score,
      total: attempt.totalQuestions,
      percentage: attempt.percentage,
    },
  });
});

export const getAttemptById = catchAsync(async (req, res) => {
  const attempt = await Attempt.findById(req.params.id).populate({
    path: 'quizId',
    select: 'title uploader questionCount totalMarks settings',
  });

  if (!attempt) {
    throw new AppError('Attempt not found', 404);
  }

  assertAttemptReadAccess({
    attempt,
    req,
    allowUploader: true,
    quizUploaderId: attempt.quizId?.uploader,
  });

  res.json({
    success: true,
    data: {
      attempt,
    },
  });
});

export const getAttemptReview = catchAsync(async (req, res) => {
  const data = await getAttemptResultPayload({
    attemptId: req.params.id,
    req,
  });

  res.json({
    success: true,
    data,
  });
});

export const getQuizAnalytics = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  const [questions, attempts] = await Promise.all([
    getQuizQuestionsSorted(quiz._id).then((docs) => docs.map((doc) => doc.toObject())),
    Attempt.find({ quizId: quiz._id, status: 'completed' }).lean(),
  ]);

  const analytics = buildQuizAnalytics({
    quiz,
    questions,
    attempts,
  });

  res.json({
    success: true,
    data: {
      quiz,
      analytics,
    },
  });
});

export const getQuizAttempts = catchAsync(async (req, res, next) => {
  const quizId = req.params.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  if (!req.user) {
    return next(new AppError('Not authorized', 401));
  }

  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  const matchCondition = {
    quizId,
    status: 'completed',
  };

  if (String(quiz.uploader) !== String(req.user._id)) {
    matchCondition.userId = req.user._id;
  }

  const sortOption = {};
  const { sortBy } = req.query;

  if (sortBy === 'highest') {
    sortOption.score = -1;
  } else if (sortBy === 'lowest') {
    sortOption.score = 1;
  } else {
    sortOption.createdAt = -1;
  }

  const attempts = await Attempt.find(matchCondition)
    .sort(sortOption)
    .skip(skip)
    .limit(limit);

  const total = await Attempt.countDocuments(matchCondition);

  res.json({
    success: true,
    data: {
      attempts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const getQuestionAnalytics = catchAsync(async (req, res) => {
  const question = await Question.findById(req.params.id);

  if (!question) {
    throw new AppError('Question not found', 404);
  }

  const quiz = await Quiz.findById(question.quizId);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizReadAccess(quiz, req);

  let analytics = await QuestionAnalytics.findOne({ questionId: question._id }).lean();

  if (!analytics) {
    await syncQuestionAnalyticsForQuiz(question.quizId);
    analytics = await QuestionAnalytics.findOne({ questionId: question._id }).lean();
  }

  res.json({
    success: true,
    data: {
      question,
      analytics: analytics || {
        questionId: question._id,
        quizId: question.quizId,
        totalAttempts: 0,
        correctAttempts: 0,
        wrongAttempts: 0,
        skippedAttempts: 0,
        avgTimeTaken: 0,
        accuracyPercentage: 0,
        wrongAnswerFrequency: {},
      },
    },
  });
});

export const getUserAnalytics = catchAsync(async (req, res) => {
  const userId = req.params.id;

  if (!req.user) {
    throw new AppError('Not authorized', 401);
  }

  const isOwner = toObjectIdString(req.user._id) === toObjectIdString(userId);
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw new AppError('Not authorized to view this user analytics', 403);
  }

  const attempts = await Attempt.find({ userId, status: 'completed' })
    .populate({ path: 'quizId', select: 'title category difficulty questionCount totalMarks' })
    .sort({ completedAt: -1 })
    .limit(200)
    .lean();

  const totalAttempts = attempts.length;
  const totalScore = attempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0);
  const totalPercentage = attempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0);
  const totalTimeMs = attempts.reduce(
    (sum, attempt) => sum + (Number(attempt.totalTimeMs) || Number(attempt.totalTime || 0) * 1000),
    0
  );
  const passCount = attempts.filter((attempt) => Number(attempt.percentage || 0) >= 50).length;
  const highestAttempt = attempts.reduce(
    (best, attempt) => (!best || (Number(attempt.percentage || 0) > Number(best.percentage || 0))) ? attempt : best,
    null
  );
  const lowestAttempt = attempts.reduce(
    (worst, attempt) => (!worst || (Number(attempt.percentage || 0) < Number(worst.percentage || 0))) ? attempt : worst,
    null
  );

  res.json({
    success: true,
    data: {
      analytics: {
        totalAttempts,
        averageScore: totalAttempts ? Math.round((totalScore / totalAttempts) * 10) / 10 : 0,
        averagePercentage: totalAttempts ? Math.round((totalPercentage / totalAttempts) * 10) / 10 : 0,
        highestScore: highestAttempt?.score || 0,
        highestPercentage: highestAttempt?.percentage || 0,
        lowestScore: lowestAttempt?.score || 0,
        lowestPercentage: lowestAttempt?.percentage || 0,
        passRate: totalAttempts ? Math.round((passCount / totalAttempts) * 100) : 0,
        averageCompletionTimeMs: totalAttempts ? Math.round(totalTimeMs / totalAttempts) : 0,
      },
      recentAttempts: attempts.slice(0, 20),
    },
  });
});
