import crypto from 'crypto';
import Quiz from '../models/Quiz.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import Upload from '../models/Upload.model.js';
import User from '../models/User.model.js';
import { catchAsync, AppError } from '../middleware/error.middleware.js';
import { extractOptions } from '../services/parser/optionExtractor.js';
import { normalizeAnswer } from '../services/parser/answerDetector.js';
import { logger } from '../utils/logger.js';
import { TimerStrategyFactory } from '../services/quiz/timer/TimerStrategyFactory.js';
import { ParserRegistry } from '../services/parser/strategies/ParserRegistry.js';
import { calculateFileHash, findDuplicateQuiz, withGenerationLock } from '../services/upload/fileHash.service.js';
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
  createQuizPublishedActivity,
  decorateQuizzesForViewer,
  deleteQuizSocialData,
  recordActivity,
} from '../services/social/activity.service.js';
import memoryCache from '../services/cache/cache.service.js';
import { RankingService } from '../domain/services/RankingService.js';

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

export const sanitizeQuestionsForClient = (questions, { isOwner = false, isChallenge = false, deadlinePassed = false } = {}) => {
  const shouldRevealAnswers = isChallenge ? Boolean(deadlinePassed) : Boolean(isOwner);

  return (questions || []).map((q) => {
    const raw = typeof q?.toObject === 'function' ? q.toObject() : { ...q };

    if (shouldRevealAnswers) {
      return raw;
    }

    const { correctAnswer, explanation, ...safeQuestion } = raw;

    if (Array.isArray(safeQuestion.options)) {
      safeQuestion.options = safeQuestion.options.map((opt) => {
        const optObj = typeof opt?.toObject === 'function' ? opt.toObject() : { ...opt };
        delete optObj.isCorrect;
        return optObj;
      });
    }

    return safeQuestion;
  });
};

export const sanitizeAttemptForClient = (attemptDoc, { isOwner = false, isChallenge = false, deadlinePassed = false } = {}) => {
  if (!attemptDoc) return null;
  const attempt = typeof attemptDoc?.toObject === 'function' ? attemptDoc.toObject() : { ...attemptDoc };
  const isCompleted = attempt.status === 'completed';
  const revealChallengeResults = isChallenge && deadlinePassed;
  const canRevealFullAnswers = isChallenge ? revealChallengeResults : isCompleted;

  if (Array.isArray(attempt.answers)) {
    attempt.answers = attempt.answers.map((ans) => {
      const sanitized = typeof ans?.toObject === 'function' ? ans.toObject() : { ...ans };

      if (!canRevealFullAnswers) {
        delete sanitized.correctOptionId;
      }

      if (isChallenge && !deadlinePassed) {
        sanitized.isCorrect = false;
        sanitized.marksAwarded = 0;
      } else if (!isCompleted && !attempt.instantFeedback) {
        sanitized.isCorrect = false;
        sanitized.marksAwarded = 0;
      }

      return sanitized;
    });
  }

  if (isChallenge && !deadlinePassed) {
    attempt.score = null;
    attempt.percentage = null;
    attempt.correctCount = null;
    attempt.wrongCount = null;
    attempt.unansweredCount = null;
    if (attempt.analytics) {
      attempt.analytics = null;
    }
  }

  return attempt;
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

const publicQuizCountFilterFor = (userId) => ({
  uploader: userId,
  $or: [{ visibility: 'public' }, { isPublic: true }],
});

const syncUserPublicQuizCount = async (userId) => {
  if (!userId) return null;

  const quizCount = await Quiz.countDocuments(publicQuizCountFilterFor(userId));
  await User.findByIdAndUpdate(userId, { quizCount });
  return quizCount;
};

const normalizeDifficulty = (difficulty) => {
  if (!difficulty) return 'All Levels';
  const val = String(difficulty).trim().toLowerCase();
  if (val === 'beginner' || val === 'easy') return 'Beginner';
  if (val === 'intermediate' || val === 'medium') return 'Intermediate';
  if (val === 'advanced' || val === 'hard') return 'Advanced';
  if (val === 'all levels' || val === 'all') return 'All Levels';
  return ['Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(difficulty)
    ? difficulty
    : 'All Levels';
};

const assertQuizManageAccess = (quiz, req) => {
  if (!req.user) {
    throw new AppError('Not authorized', 401);
  }

  const isOwner = toObjectIdString(quiz.uploader?._id || quiz.uploader) === toObjectIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw new AppError('Not authorized to manage this quiz', 403);
  }
};

const assertQuizReadAccess = async (quiz, req) => {
  const isExplicitlyPrivate = quiz.visibility === 'private' || quiz.metadata?.savedAsDraft === true;
  const isPubliclyAccessible = !isExplicitlyPrivate && (quiz.visibility === 'public' || quiz.visibility === 'unlisted' || quiz.isPublic === true);

  if (isPubliclyAccessible) {
    return;
  }

  if (!req.user) {
    throw new AppError('Not authorized to view this quiz', 401);
  }

  const isOwner = toObjectIdString(quiz.uploader?._id || quiz.uploader) === toObjectIdString(req.user._id);
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

  const isChallenge = Boolean(payload.isChallenge);
  let durationMinutes = 0;
  let deadlineAt = null;
  let accessType = 'public';
  let inviteAccessType = null;
  let challengeStatus = 'active';

  if (isChallenge) {
    durationMinutes = Math.max(Number(payload.durationMinutes ?? payload.settings?.timeLimit ?? payload.timeLimit ?? 0) || 0, 0);
    if (!durationMinutes || durationMinutes <= 0) {
      throw new AppError('Challenges require a valid duration in minutes', 400);
    }

    if (!payload.deadlineAt) {
      throw new AppError('Challenges require a valid future finalization deadline', 400);
    }
    deadlineAt = new Date(payload.deadlineAt);
    if (isNaN(deadlineAt.getTime()) || deadlineAt <= new Date()) {
      throw new AppError('Challenges require a valid future finalization deadline', 400);
    }

    accessType = payload.accessType === 'invite_only' ? 'invite_only' : 'public';
    inviteAccessType = accessType === 'invite_only'
      ? (payload.inviteAccessType === 'approval' ? 'approval' : 'invitation')
      : null;
    challengeStatus = ['draft', 'active', 'ended'].includes(payload.challengeStatus)
      ? payload.challengeStatus
      : 'active';
  }

  const rawTimerMode = isChallenge ? 'strict' : (payload.timerMode ?? payload.settings?.timerMode ?? 'none');
  const timerMode = ['none', 'soft', 'strict'].includes(rawTimerMode) ? rawTimerMode : 'none';

  return {
    title,
    description: String(payload.description || '').trim(),
    category: String(payload.category || 'General').trim() || 'General',
    difficulty: normalizeDifficulty(payload.difficulty),
    thumbnail: String(payload.thumbnail || '').trim(),
    visibility: normalizeVisibility(payload.visibility, payload.isPublic ? 'public' : 'private'),
    isChallenge,
    deadlineAt,
    durationMinutes,
    accessType,
    inviteAccessType,
    challengeStatus,
    quickModeEnabled: isChallenge ? false : (payload.quickModeEnabled !== false && payload.quick_mode_enabled !== false),
    settings: {
      timeLimit: isChallenge ? durationMinutes : 0, // Requirement 1: Quiz: unlimited questions, no time limit
      timerMode: isChallenge ? 'strict' : timerMode,
      instantFeedback: isChallenge ? false : (payload.instantFeedback === true || payload.settings?.instantFeedback === true),
      shuffleQuestions: payload.shuffleQuestions === true || payload.settings?.shuffleQuestions === true,
      shuffleOptions: payload.shuffleOptions === true || payload.settings?.shuffleOptions === true,
      showExplanation: payload.showExplanation !== false && payload.settings?.showExplanation !== false,
      allowReview: isChallenge ? false : (payload.allowReview !== false && payload.settings?.allowReview !== false),
    },
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : [],
  };
};


export const generateQuiz = catchAsync(async (req, res, next) => {
  const { uploadId, title, description, settings, forceGenerate, allowDuplicate } = req.body;

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

  // Ensure fileHash is generated and saved
  const fileHash = upload.fileHash || (await calculateFileHash(upload.filePath));
  if (!upload.fileHash) {
    upload.fileHash = fileHash;
    await upload.save();
  }

  // Duplicate check before quiz generation unless explicitly forced/allowed
  const shouldBypassDuplicate = Boolean(forceGenerate || allowDuplicate);
  if (!shouldBypassDuplicate) {
    const existingQuiz = await findDuplicateQuiz({
      fileHash,
      uploaderId: upload.userId || req.user?._id || null,
    });

    if (existingQuiz) {
      logger.info(`Duplicate quiz found for fileHash ${fileHash}: Quiz "${existingQuiz.title}" [${existingQuiz._id}]`);
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        existingQuizId: existingQuiz._id,
        message: 'A quiz generated from this identical file already exists',
        data: {
          isDuplicate: true,
          existingQuizId: existingQuiz._id,
          quiz: existingQuiz,
        },
      });
    }
  }

  // Concurrency-safe generation with lock by fileHash
  const generationResult = await withGenerationLock(shouldBypassDuplicate ? null : fileHash, async () => {
    const { columnMapping } = upload;
    const { rows } = await ParserRegistry.parse(upload.fileType, upload.filePath);
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
      throw new AppError('No valid questions extracted', 422);
    }

    const totalMarks = getQuizTotalMarks(questions);
    const rawTimerMode = settings?.timerMode || 'none';
    const timerMode = ['none', 'soft', 'strict'].includes(rawTimerMode) ? rawTimerMode : 'none';
    const normalizedSettings = {
      timeLimit: Math.max(Number(settings?.timeLimit ?? 0) || 0, 0),
      timerMode,
      instantFeedback: settings?.instantFeedback === true,
      shuffleQuestions: settings?.shuffleQuestions === true,
      shuffleOptions: settings?.shuffleOptions === true,
      showExplanation: settings?.showExplanation !== false,
      allowReview: settings?.allowReview !== false,
    };
    const quiz = await Quiz.create({
      title: String(title || `Quiz from ${upload.originalName}`).trim().slice(0, 70),
      description: description || '',
      category: req.body.category || 'General',
      difficulty: normalizeDifficulty(req.body.difficulty),
      thumbnail: req.body.thumbnail || '',
      visibility: normalizeVisibility(req.body.visibility, req.body.isPublic ? 'public' : 'private'),
      uploader: upload.userId || req.user?._id || null,
      questionCount: questions.length,
      totalMarks,
      quickModeEnabled: req.body.quickModeEnabled !== false,
      settings: normalizedSettings,
      sourceFile: {
        name: upload.originalName,
        type: upload.fileType,
        size: upload.fileSize,
        hash: fileHash,
      },
      fileHash,
      columnMapping,
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
    await syncUserPublicQuizCount(quiz.uploader);
    await createQuizPublishedActivity({ quiz, actorId: quiz.uploader });

    logger.info(`Quiz: "${quiz.title}" — ${questions.length} questions, ${skipped} skipped [hash: ${fileHash.slice(0, 8)}...]`);

    return {
      quiz,
      questionCount: questions.length,
      skipped,
    };
  });

  if (generationResult.isDuplicate) {
    return res.status(200).json({
      success: true,
      isDuplicate: true,
      existingQuizId: generationResult.existingQuizId || generationResult.quiz._id,
      message: 'A quiz generated from this identical file already exists',
      data: {
        isDuplicate: true,
        existingQuizId: generationResult.existingQuizId || generationResult.quiz._id,
        quiz: generationResult.quiz,
      },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      quiz: generationResult.quiz,
      questionCount: generationResult.questionCount,
      skipped: generationResult.skipped,
    },
  });
});

export const getQuiz = catchAsync(async (req, res, next) => {
  const quizId = req.params.id;
  const isAnonymous = !req.user;
  const cacheKey = `quiz:public:${quizId}`;

  if (isAnonymous) {
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          quiz: cached,
        },
      });
    }
  }

  const quiz = await Quiz.findById(quizId).populate('uploader', 'name username avatar bio followersCount quizCount');

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);

  const [decorated] = await decorateQuizzesForViewer([quiz], req.user?._id);
  const finalQuiz = decorated || quiz;

  if (isAnonymous && (quiz.visibility === 'public' || quiz.isPublic)) {
    memoryCache.set(cacheKey, finalQuiz, 30000);
  }

  res.json({
    success: true,
    data: {
      quiz: finalQuiz,
    },
  });
});

export const getQuizQuestions = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);

  const rawQuestions = await getQuizQuestionsSorted(quiz._id);

  const isOwner = req.user && (
    toObjectIdString(quiz.uploader?._id || quiz.uploader) === toObjectIdString(req.user._id) ||
    req.user.role === 'admin'
  );
  const isChallenge = Boolean(quiz.isChallenge);
  const deadlinePassed = quiz.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;

  const questions = sanitizeQuestionsForClient(rawQuestions, {
    isOwner,
    isChallenge,
    deadlinePassed,
  });

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

  await assertQuizReadAccess(quiz, req);

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

  const isChallenge = Boolean(quiz.isChallenge);
  const deadlinePassed = quiz.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isChallenge, deadlinePassed }),
    },
  });
});

export const startAttempt = catchAsync(async (req, res, next) => {
  const quizId = req.params.id || req.body.quizId;
  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);

  const ownerFilter = buildAttemptOwnerFilter(req);
  const forceNew = req.body.forceNew === true;
  const isChallenge = Boolean(quiz.isChallenge);
  const deadlinePassed = quiz.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;
  const isCreator = req.user && toObjectIdString(quiz.uploader?._id || quiz.uploader) === toObjectIdString(req.user._id);

  if (isChallenge) {
    if (deadlinePassed) {
      throw new AppError('This challenge has concluded and is no longer accepting attempts.', 400);
    }

    if (!isCreator && ownerFilter) {
      const priorAttempt = await Attempt.findOne({
        quizId: quiz._id,
        ...ownerFilter,
        status: { $in: ['completed', 'abandoned'] },
      });

      if (priorAttempt) {
        throw new AppError('Only one attempt is permitted per participant for this challenge.', 403);
      }
    }
  }

  let existingAttempt = ownerFilter
    ? await Attempt.findOne({
        quizId: quiz._id,
        status: 'in_progress',
        ...ownerFilter,
      }).sort({ createdAt: -1 })
    : null;

  if (existingAttempt && forceNew && !isChallenge) {
    existingAttempt.status = 'abandoned';
    existingAttempt.completed = false;
    existingAttempt.syncStatus = 'synced';
    await existingAttempt.save();
    existingAttempt = null;
  }

  if (existingAttempt) {

    if (req.body.instantFeedback === true && existingAttempt.instantFeedback !== true && !isChallenge) {
      existingAttempt.instantFeedback = true;
      await existingAttempt.save();
    }

    return res.json({
      success: true,
      data: {
        attempt: sanitizeAttemptForClient(existingAttempt, { isChallenge, deadlinePassed }),
        recovered: true,
      },
    });
  }

  const questions = await getQuizQuestionsSorted(quiz._id);
  const isQuickMode = !isChallenge && quiz.quickModeEnabled !== false && req.body.isQuickMode === true;
  const instantFeedback = !isChallenge && (quiz.settings?.instantFeedback === true || req.body.instantFeedback === true || isQuickMode);

  // Timer architecture: compute deadline from quiz settings or attempt request
  const timeLimitMinutes = isChallenge
    ? (quiz.durationMinutes || quiz.settings?.timeLimit || 0)
    : Number(req.body.timeLimit !== undefined ? req.body.timeLimit : (quiz.settings?.timeLimit || 0));
  const rawTimerMode = isChallenge ? 'strict' : (req.body.timerMode || quiz.settings?.timerMode || 'none');
  const timerMode = ['none', 'soft', 'strict'].includes(rawTimerMode) ? rawTimerMode : 'none';
  const allowedDurationMs = timeLimitMinutes > 0 ? timeLimitMinutes * 60 * 1000 : 0;
  const startedAt = new Date();
  let deadlineAt = allowedDurationMs > 0 && timerMode !== 'none'
    ? new Date(startedAt.getTime() + allowedDurationMs)
    : null;

  // For challenges, attempt deadline cannot exceed challenge finalization deadline
  if (isChallenge && quiz.deadlineAt) {
    const challengeDeadline = new Date(quiz.deadlineAt);
    if (!deadlineAt || deadlineAt > challengeDeadline) {
      deadlineAt = challengeDeadline;
    }
  }

  const guestSessionId = req.user?._id ? null : (getRequestSessionId(req) || crypto.randomUUID());

  const attempt = await Attempt.create({
    quizId: quiz._id,
    userId: req.user?._id || null,
    sessionId: guestSessionId,
    answers: buildInitialAnswerStates(questions),
    totalQuestions: quiz.questionCount,
    totalMarks: isChallenge ? quiz.questionCount : (quiz.totalMarks || getQuizTotalMarks(questions)),
    isQuickMode,
    isPractice: Boolean(isChallenge && isCreator),
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

  res.status(201).json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isChallenge, deadlinePassed }),
      sessionId: guestSessionId,
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

  const quiz = await Quiz.findById(attempt.quizId).select('isChallenge deadlineAt');
  const isChallenge = Boolean(quiz?.isChallenge);
  const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isChallenge, deadlinePassed }),
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

    const quiz = await Quiz.findById(attempt.quizId).select('uploader title visibility isPublic isChallenge deadlineAt');
    const isChallenge = Boolean(quiz?.isChallenge);
    const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;
    const isOwner = req.user && String(req.user._id) === String(quiz?.uploader);

    return res.json({
      success: true,
      data: {
        attempt: sanitizeAttemptForClient(attempt, { isOwner, isChallenge, deadlinePassed }),
        score: isChallenge && !deadlinePassed ? null : attempt.score,
        total: attempt.totalQuestions,
        percentage: isChallenge && !deadlinePassed ? null : attempt.percentage,
        isChallenge,
        deadlinePassed,
      },
    });
  }

  // Deadline validation via extensible TimerStrategyFactory (SOLID OCP & SRP)
  const timerStrategy = TimerStrategyFactory.getStrategy(attempt.timerMode);
  const { isLate, flags: timerFlags } = timerStrategy.validateSubmission({ attempt });

  if (isLate) {
    logger.info(`Late submission flagged for attempt ${attempt._id}`);
  }

  const { flags, answerChanges } = mergeAttemptTrackingPayload({
    attempt,
    questions,
    payload: req.body,
    finalizing: true,
  });

  if (isLate || (timerFlags && timerFlags.length > 0)) {
    attempt.suspiciousActivity = attempt.suspiciousActivity || {};
    attempt.suspiciousActivity.flags = [
      ...(attempt.suspiciousActivity.flags || []),
      ...(timerFlags || [{ code: 'LATE_SUBMISSION', message: 'Submitted after deadline expired', createdAt: new Date() }]),
    ];
  }

  await attempt.save();
  
  await syncQuizAggregateFields(attempt.quizId);
  const quiz = await Quiz.findById(attempt.quizId).select('uploader title visibility isPublic isChallenge deadlineAt');
  if (req.user?._id && quiz && (quiz.visibility === 'public' || quiz.isPublic === true)) {
    await recordActivity({
      actorId: req.user._id,
      verb: 'quiz_attempted',
      quizId: quiz._id,
      notifyRecipientId: quiz.uploader,
      visibility: 'public',
      metadata: {
        percentage: attempt.percentage,
        score: attempt.score,
      },
    });
  }

  const isChallenge = Boolean(quiz?.isChallenge);
  const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;
  const isOwner = req.user && String(req.user._id) === String(quiz?.uploader);

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isOwner, isChallenge, deadlinePassed }),
      score: isChallenge && !deadlinePassed ? null : attempt.score,
      total: attempt.totalQuestions,
      percentage: isChallenge && !deadlinePassed ? null : attempt.percentage,
      isChallenge,
      deadlinePassed,
    },
  });
});

const getAttemptResultPayload = async ({ attemptId, req }) => {
  const attempt = await Attempt.findById(attemptId)
    .populate({
      path: 'quizId',
      select: 'title uploader questionCount settings isChallenge deadlineAt',
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

  const isOwner = req.user && String(req.user._id) === String(attempt.quizId?.uploader);
  const isChallenge = Boolean(attempt.quizId?.isChallenge);
  const deadlinePassed = attempt.quizId?.deadlineAt ? new Date() >= new Date(attempt.quizId.deadlineAt) : false;

  const canReviewAnswers = isChallenge
    ? deadlinePassed
    : (attempt.quizId?.settings?.allowReview !== false || isOwner);

  const hideExplanations = isChallenge
    ? !deadlinePassed
    : (attempt.quizId?.settings?.showExplanation === false && !isOwner);

  const sanitizedQuestions = canReviewAnswers
    ? (hideExplanations
        ? questions.map((q) => {
            const obj = q.toObject ? q.toObject() : { ...q };
            obj.explanation = '';
            return obj;
          })
        : questions)
    : [];

  const sanitizedAttempt = sanitizeAttemptForClient(attempt, {
    isOwner,
    isChallenge,
    deadlinePassed,
  });

  return {
    attempt: sanitizedAttempt,
    questions: sanitizedQuestions,
    allowReview: canReviewAnswers,
    showExplanation: !hideExplanations,
    isChallenge,
    deadlinePassed,
  };
};

export const getResult = catchAsync(async (req, res) => {
  const data = await getAttemptResultPayload({
    attemptId: req.params.attemptId || req.params.id,
    req,
  });

  res.json({
    success: true,
    data,
  });
});

export const getResultByAttemptId = catchAsync(async (req, res) => {
  const data = await getAttemptResultPayload({
    attemptId: req.params.attemptId || req.params.id,
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
        pagination: {
          total: 0,
          page: 1,
          limit: 50,
          pages: 1,
          hasMore: false,
          hasNext: false,
          hasPrev: false,
        },
      },
    });
  }

  const { page, limit, skip } = clampPagination(req.query);
  const filter = { uploader: req.user._id };

  const [rawQuizzes, total] = await Promise.all([
    Quiz.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploader', 'name username avatar bio followersCount quizCount')
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  const quizzes = await decorateQuizzesForViewer(rawQuizzes, req.user._id);
  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      quizzes,
      pagination: {
        total,
        page,
        limit,
        pages: totalPages,
        hasMore: page < totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
  });
});

export const listQuizzes = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query);
  const publicOnly = req.query.publicOnly === 'true' || req.query.scope === 'public';
  const mineOnly = req.query.mine === 'true' || req.query.scope === 'mine' || req.query.scope === 'my';
  const canonicalPublic = {
    visibility: { $ne: 'private' },
    $or: [{ visibility: 'public' }, { isPublic: true }],
    'metadata.savedAsDraft': { $ne: true },
  };

  let visibilityFilter;
  if (mineOnly) {
    if (!req.user) {
      throw new AppError('Authentication required to view your quizzes', 401);
    }
    visibilityFilter = { uploader: req.user._id };
  } else if (publicOnly || !req.user) {
    visibilityFilter = canonicalPublic;
  } else {
    visibilityFilter = { $or: [canonicalPublic, { uploader: req.user._id }] };
  }

  const andFilters = [visibilityFilter];
  const search = String(req.query.search || req.query.q || '').trim();
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (search) {
    const searchRegex = new RegExp(escapedSearch, 'i');
    const matchingUsers = await User.find({
      $or: [
        { username: searchRegex },
        { name: searchRegex },
      ],
    })
      .select('_id')
      .limit(50)
      .lean();

    andFilters.push({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
        { tags: searchRegex },
        { uploader: { $in: matchingUsers.map((user) => user._id) } },
      ],
    });
  }

  if (req.query.category && String(req.query.category).trim().toLowerCase() !== 'all') {
    andFilters.push({ category: String(req.query.category).trim() });
  }

  if (req.query.difficulty) {
    const rawDiff = String(req.query.difficulty).trim().toLowerCase();
    if (rawDiff !== 'all' && rawDiff !== 'all levels') {
      andFilters.push({ difficulty: normalizeDifficulty(req.query.difficulty) });
    }
  }

  const filter = andFilters.length === 1 ? andFilters[0] : { $and: andFilters };

  let sort = { createdAt: -1 };
  const sortKey = String(req.query.sort || '').trim().toLowerCase();
  if (sortKey === 'popular') {
    sort = { likeCount: -1, totalAttempts: -1, avgScore: -1, createdAt: -1 };
  } else if (sortKey === 'top' || sortKey === 'rating') {
    sort = { avgScore: -1, totalAttempts: -1, likeCount: -1, createdAt: -1 };
  } else if (sortKey === 'newest' || sortKey === 'recent') {
    sort = { createdAt: -1 };
  } else if (sortKey === 'oldest') {
    sort = { createdAt: 1 };
  } else if (sortKey === 'questions') {
    sort = { questionCount: -1, createdAt: -1 };
  } else if (sortKey === 'title' || sortKey === 'alphabetical') {
    sort = { title: 1, createdAt: -1 };
  } else if (sortKey === 'active') {
    sort = { lastSocialActivityAt: -1, createdAt: -1 };
  }

  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('uploader', 'name username avatar bio followersCount quizCount')
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  const decoratedQuizzes = await decorateQuizzesForViewer(quizzes, req.user?._id);
  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      quizzes: decoratedQuizzes,
      pagination: {
        total,
        page,
        limit,
        pages: totalPages,
        hasMore: page < totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
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

  if (quizInput.isChallenge && questionsInput.length > 10) {
    throw new AppError('Challenges cannot have more than 10 questions', 400);
  }

  const questions = questionsInput.map(normalizeQuestionInput);
  const quiz = await Quiz.create({
    ...quizInput,
    uploader: req.user._id,
    questionCount: questions.length,
    totalMarks: getQuizTotalMarks(questions),
    isPublic: quizInput.visibility === 'public',
  });

  const createdQuestions = await Question.insertMany(
    questions.map((question) => ({
      ...question,
      quizId: quiz._id,
    }))
  );
  await syncUserPublicQuizCount(quiz.uploader);
  await createQuizPublishedActivity({ quiz, actorId: quiz.uploader });

  

  res.status(201).json({
    success: true,
    data: {
      quiz,
      questions: createdQuestions,
    },
  });
});

export const saveManualDraft = catchAsync(async (req, res, next) => {
  const { title, description, questions, isDraft, builderMode = 'exam', contentKind = 'quiz', metadata = {} } = req.body;
  const allowedContentKinds = ['quiz', 'form', 'coding', 'upload', 'rating', 'survey', 'universal'];
  const normalizedContentKind = allowedContentKinds.includes(contentKind) ? contentKind : 'quiz';
  const effectiveDraft = normalizedContentKind === 'quiz' ? Boolean(isDraft) : true;

  if (!title) {
    return next(new AppError('title is required', 400));
  }
  
  if (!Array.isArray(questions)) {
    return next(new AppError('questions array is required', 400));
  }

  if (!effectiveDraft) {
    const unsupportedQuestion = questions.find((q) => {
      const questionType = q.questionType || q.type || 'multiple_choice';
      return !['multiple_choice', 'dropdown'].includes(questionType);
    });

    if (unsupportedQuestion) {
      return next(new AppError('Only multiple choice and dropdown questions can be published in quiz mode right now.', 400));
    }

    const questionMissingAnswer = questions.find((q) => {
      const options = Array.isArray(q.options) ? q.options : [];
      const hasMarkedAnswer = options.some((option) => option.isCorrect === true);
      return !q.correctAnswer && !hasMarkedAnswer;
    });

    if (questionMissingAnswer) {
      return next(new AppError('Every published question needs a correct answer.', 400));
    }
  }

  const visibility = effectiveDraft ? 'private' : 'public';
  const uploader = req.user._id;
  const normalizeManualQuestion = (q, index) => {
    const questionType = q.questionType || q.type || 'multiple_choice';
    const optionTypes = ['multiple_choice', 'checkboxes', 'dropdown'];
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const options = optionTypes.includes(questionType)
      ? rawOptions.map((option, optionIndex) => {
          const label = String(option.label || String.fromCharCode(65 + optionIndex)).trim().toUpperCase();
          return {
            label,
            text: String(option.text || option.optionText || `Option ${optionIndex + 1}`).trim(),
            isCorrect: option.isCorrect === true,
          };
        }).filter((option) => option.text)
      : [];

    let correctAnswer = q.correctAnswer ?? q.correctAnswers ?? null;
    if (optionTypes.includes(questionType)) {
      const correctLabels = options.filter((option) => option.isCorrect).map((option) => option.label);
      if (questionType === 'checkboxes') {
        correctAnswer = Array.isArray(correctAnswer) && correctAnswer.length ? correctAnswer : correctLabels;
      } else {
        correctAnswer = Array.isArray(correctAnswer) ? correctAnswer[0] || correctLabels[0] || null : correctAnswer || correctLabels[0] || null;
      }
    }

    return {
      questionNumber: q.questionNumber || index + 1,
      questionText: String(q.questionText || q.question || `Question ${index + 1}`).trim(),
      questionType,
      options,
      correctAnswer,
      explanation: String(q.explanation || '').trim(),
      difficulty: normalizeDifficulty(q.difficulty),
      category: String(q.category || 'General').trim() || 'General',
      marks: Number.isFinite(Number(q.marks)) ? Math.max(Number(q.marks), 0) : 1,
      negativeMarks: Number.isFinite(Number(q.negativeMarks)) ? Math.max(Number(q.negativeMarks), 0) : 0,
      orderIndex: Number.isFinite(Number(q.orderIndex)) ? Number(q.orderIndex) : index,
      media: q.media?.url ? { type: q.media.type || 'image', url: String(q.media.url).trim() } : undefined,
      grid: q.grid
        ? {
            rows: q.grid.rows || [],
            columns: q.grid.columns || q.grid.cols || [],
          }
        : undefined,
      settings: q.settings || {},
      metadata: q.metadata || {},
    };
  };

  const rawSettings = req.body.settings || {};
  const timerMode = ['none', 'soft', 'strict'].includes(rawSettings.timerMode) ? rawSettings.timerMode : 'none';

  const isChallenge = Boolean(req.body.isChallenge);
  if (isChallenge && questions.length > 10) {
    return next(new AppError('Challenges cannot have more than 10 questions', 400));
  }
  let durationMinutes = 0;
  let deadlineAt = null;
  let accessType = 'public';
  let inviteAccessType = null;
  let challengeStatus = 'active';

  if (isChallenge) {
    durationMinutes = Math.max(Number(req.body.durationMinutes ?? rawSettings.timeLimit ?? 0) || 0, 0);
    if (!durationMinutes || durationMinutes <= 0) {
      return next(new AppError('Challenges require a valid duration in minutes', 400));
    }
    if (!req.body.deadlineAt) {
      return next(new AppError('Challenges require a valid future finalization deadline', 400));
    }
    deadlineAt = new Date(req.body.deadlineAt);
    if (isNaN(deadlineAt.getTime()) || deadlineAt <= new Date()) {
      return next(new AppError('Challenges require a valid future finalization deadline', 400));
    }
    accessType = req.body.accessType === 'invite_only' ? 'invite_only' : 'public';
    inviteAccessType = accessType === 'invite_only' ? (req.body.inviteAccessType === 'approval' ? 'approval' : 'invitation') : null;
    challengeStatus = ['draft', 'active', 'ended'].includes(req.body.challengeStatus) ? req.body.challengeStatus : 'active';
  }

  const quiz = await Quiz.create({
    title: String(title || 'Untitled Quiz').trim().slice(0, 70),
    description: description || '',
    thumbnail: String(req.body.thumbnail || req.body.coverUrl || '').trim(),
    tags: Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    category: String(req.body.category || 'General').trim() || 'General',
    difficulty: normalizeDifficulty(req.body.difficulty),
    visibility,
    isPublic: visibility === 'public',
    isChallenge,
    deadlineAt,
    durationMinutes,
    accessType,
    inviteAccessType,
    challengeStatus,
    contentKind: effectiveDraft ? normalizedContentKind : 'quiz',
    builderMode: String(builderMode || 'exam').trim() || 'exam',
    settings: {
      timeLimit: isChallenge ? durationMinutes : 0, // Requirement 1: Quiz: unlimited questions, no time limit
      timerMode: isChallenge ? 'strict' : timerMode,
      instantFeedback: isChallenge ? false : rawSettings.instantFeedback === true,
      shuffleQuestions: rawSettings.shuffleQuestions === true,
      shuffleOptions: rawSettings.shuffleOptions === true,
      showExplanation: rawSettings.showExplanation !== false,
      allowReview: isChallenge ? false : rawSettings.allowReview !== false,
    },
    metadata: {
      ...metadata,
      createdWith: 'universal_builder',
      savedAsDraft: effectiveDraft,
    },
    uploader,
    questionCount: questions.length,
  });

  if (questions.length > 0) {
    const questionDocs = questions.map((q, index) => ({
      ...normalizeManualQuestion(q, index),
      quizId: quiz._id,
    }));

    await Question.insertMany(questionDocs);
  }

  await syncUserPublicQuizCount(uploader);
  await createQuizPublishedActivity({ quiz, actorId: uploader });

  res.status(201).json({
    success: true,
    data: {
      quizId: quiz._id
    }
  });
});

export const updateQuiz = catchAsync(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);
  const originalUploaderId = quiz.uploader;
  const wasPublic = quiz.visibility === 'public' || quiz.isPublic === true;

  const attemptCount = await Attempt.countDocuments({ quizId: quiz._id });
  if (quiz.isChallenge && attemptCount > 0) {
    const isModifyingQuestions = Array.isArray(req.body.questions);
    const isModifyingDuration = req.body.durationMinutes !== undefined || req.body.settings?.timeLimit !== undefined;
    const isModifyingDeadline = req.body.deadlineAt !== undefined;
    const isModifyingRules = req.body.settings !== undefined || req.body.accessType !== undefined || req.body.inviteAccessType !== undefined;

    if (isModifyingQuestions || isModifyingDuration || isModifyingDeadline || isModifyingRules) {
      throw new AppError('Challenge questions, duration, and rules are immutable once participants have joined', 409);
    }
  }

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
    if (attemptCount > 0) {
      throw new AppError('Questions cannot be replaced after attempts exist', 409);
    }

    if (quiz.isChallenge && req.body.questions.length > 10) {
      throw new AppError('Challenges cannot have more than 10 questions', 400);
    }

    const questions = req.body.questions.map(normalizeQuestionInput);
    await Question.deleteMany({ quizId: quiz._id });
    await Question.insertMany(questions.map((question) => ({ ...question, quizId: quiz._id })));
    quiz.questionCount = questions.length;
    quiz.totalMarks = quiz.isChallenge ? questions.length : getQuizTotalMarks(questions);
  }

  await quiz.save();
  await syncUserPublicQuizCount(originalUploaderId);
  const isNowPublic = quiz.visibility === 'public' || quiz.isPublic === true;
  if (!wasPublic && isNowPublic) {
    await createQuizPublishedActivity({ quiz, actorId: quiz.uploader });
  }

  memoryCache.del(`quiz:public:${quiz._id}`);
  memoryCache.del(`leaderboard:${quiz._id}`);

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

  const attemptCount = await Attempt.countDocuments({ quizId: quiz._id });
  if (attemptCount > 0) {
    throw new AppError('Cannot delete or cancel after participants have started', 409);
  }

  await Question.deleteMany({ quizId: quiz._id });
  await Attempt.deleteMany({ quizId: quiz._id });
  await deleteQuizSocialData(quiz._id);
  await Upload.updateMany({ quizId: quiz._id }, { $set: { quizId: null } });
  await quiz.deleteOne();
  
  await syncUserPublicQuizCount(quiz.uploader);

  memoryCache.del(`quiz:public:${quiz._id}`);
  memoryCache.del(`leaderboard:${quiz._id}`);

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

  const quiz = await Quiz.findById(attempt.quizId).select('isChallenge deadlineAt');
  const isChallenge = Boolean(quiz?.isChallenge);
  const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;

  if (isChallenge && deadlinePassed) {
    throw new AppError('This challenge has concluded and can no longer be answered.', 400);
  }

  if (
    !isChallenge &&
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
        isLocked: !isChallenge && (attempt.isQuickMode || attempt.instantFeedback || req.body.locked === true),
        lockedAt: req.body.lockedAt || req.body.locked_at,
        lastClientUpdatedAt: req.body.clientTimestamp || new Date().toISOString(),
      }],
    },
    finalizing: false,
  });

  attempt.syncStatus = 'synced';
  await attempt.save();

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isChallenge, deadlinePassed }),
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

  const quiz = await Quiz.findById(attempt.quizId).select('isChallenge deadlineAt');
  const isChallenge = Boolean(quiz?.isChallenge);
  const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isChallenge, deadlinePassed }),
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
    .populate('quizId', 'title questionCount settings isChallenge deadlineAt')
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

  let quiz = null;
  if (attempt.status !== 'completed') {
    const { answerChanges } = mergeAttemptTrackingPayload({
      attempt,
      questions,
      payload: req.body,
      finalizing: true,
    });

    await attempt.save();
    
    await syncQuizAggregateFields(attempt.quizId);
    quiz = await Quiz.findById(attempt.quizId).select('uploader visibility isPublic isChallenge deadlineAt');
    if (req.user?._id && quiz && (quiz.visibility === 'public' || quiz.isPublic === true)) {
      await recordActivity({
        actorId: req.user._id,
        verb: 'quiz_attempted',
        quizId: quiz._id,
        notifyRecipientId: quiz.uploader,
        visibility: 'public',
        metadata: {
          percentage: attempt.percentage,
          score: attempt.score,
        },
      });
    }
  }

  if (!quiz) {
    quiz = await Quiz.findById(attempt.quizId).select('uploader visibility isPublic isChallenge deadlineAt');
  }

  const isChallenge = Boolean(quiz?.isChallenge);
  const deadlinePassed = quiz?.deadlineAt ? new Date() >= new Date(quiz.deadlineAt) : false;
  const isOwner = req.user && String(req.user._id) === String(quiz?.uploader);

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isOwner, isChallenge, deadlinePassed }),
      score: isChallenge && !deadlinePassed ? null : attempt.score,
      total: attempt.totalQuestions,
      percentage: isChallenge && !deadlinePassed ? null : attempt.percentage,
      isChallenge,
      deadlinePassed,
    },
  });
});

export const getAttemptById = catchAsync(async (req, res) => {
  const attempt = await Attempt.findById(req.params.id)
    .populate({
      path: 'quizId',
      select: 'title uploader questionCount totalMarks settings isChallenge deadlineAt',
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

  const isOwner = req.user && String(req.user._id) === String(attempt.quizId?.uploader);
  const isChallenge = Boolean(attempt.quizId?.isChallenge);
  const deadlinePassed = attempt.quizId?.deadlineAt ? new Date() >= new Date(attempt.quizId.deadlineAt) : false;

  res.json({
    success: true,
    data: {
      attempt: sanitizeAttemptForClient(attempt, { isOwner, isChallenge, deadlinePassed }),
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
    Attempt.find({ quizId: quiz._id, status: 'completed' })
      .select('status score percentage totalTime totalTimeMs isQuickMode answers analytics completedAt createdAt')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean(),
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

export const uploadQuizCover = catchAsync(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);

  let coverUrl = '';
  if (req.file) {
    coverUrl = `/uploads/covers/${req.file.filename}`;
  } else if (req.body.imageUrl) {
    coverUrl = String(req.body.imageUrl).trim();
  } else if (req.body.image) {
    coverUrl = String(req.body.image).trim();
  } else if (req.body.thumbnail) {
    coverUrl = String(req.body.thumbnail).trim();
  }

  if (!coverUrl) {
    throw new AppError('No image provided', 400);
  }

  quiz.thumbnail = coverUrl;
  await quiz.save();

  res.json({
    success: true,
    data: {
      quizId: quiz._id,
      thumbnail: quiz.thumbnail,
      quiz,
    },
  });
});

export const removeQuizCover = catchAsync(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);

  quiz.thumbnail = '';
  await quiz.save();

  res.json({
    success: true,
    data: {
      quizId: quiz._id,
      thumbnail: '',
      quiz,
    },
  });
});

export const calculateDenseLeaderboard = (attempts) => {
  return RankingService.calculateRankings(attempts, 'competition');
};

export const getChallengeLeaderboard = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);

  const isChallenge = Boolean(quiz.isChallenge);
  const now = new Date();
  const deadlinePassed = quiz.deadlineAt ? now >= new Date(quiz.deadlineAt) : false;

  const participantCount = await Attempt.countDocuments({
    quizId: quiz._id,
    isPractice: { $ne: true },
  });

  // Before deadline, display ONLY participant count; hide identities, scores, and ranks
  if (isChallenge && !deadlinePassed) {
    return res.json({
      success: true,
      data: {
        isChallenge: true,
        deadlinePassed: false,
        deadlineAt: quiz.deadlineAt,
        participantCount,
        leaderboard: [],
        message: 'Leaderboard and ranks are quarantined until the finalization deadline.',
      },
    });
  }

  const cacheKey = `leaderboard:${quiz._id}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
    });
  }

  const completedAttempts = await Attempt.find({
    quizId: quiz._id,
    status: 'completed',
    isPractice: { $ne: true },
  })
    .select('userId score totalMarks totalTime totalTimeMs percentage completedAt updatedAt isPractice')
    .sort({ score: -1, totalTimeMs: 1, completedAt: 1 })
    .limit(100)
    .populate('userId', 'name username avatar')
    .lean();

  const rankedLeaderboard = calculateDenseLeaderboard(completedAttempts);

  const payload = {
    isChallenge,
    deadlinePassed: isChallenge ? true : null,
    deadlineAt: quiz.deadlineAt || null,
    participantCount,
    leaderboard: rankedLeaderboard,
  };

  // Cache leaderboard for 15s to withstand heavy concurrent contest traffic
  memoryCache.set(cacheKey, payload, 15000);

  res.json({
    success: true,
    data: payload,
  });
});
