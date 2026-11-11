import crypto from 'crypto';
import { normalizeMediaClips, stableOptionId, validateQuestionMedia } from '../services/questionMedia.service.js';
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
import { assertUploadAccess } from '../services/upload/authorizeUpload.js';
import { persistGeneratedQuestions } from '../services/quiz/persistGeneratedQuestions.js';
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
import env from '../config/env.js';
import { RankingService } from '../domain/services/RankingService.js';
import { UpdateQuizUseCase } from '../application/use-cases/UpdateQuizUseCase.js';
import { DeleteQuizUseCase } from '../application/use-cases/DeleteQuizUseCase.js';
import { MongooseQuizRepository } from '../infrastructure/repositories/MongooseQuizRepository.js';
import { MongooseQuestionRepository } from '../infrastructure/repositories/MongooseQuestionRepository.js';
import { MongooseAttemptRepository } from '../infrastructure/repositories/MongooseAttemptRepository.js';
import { DomainError } from '../domain/errors/DomainError.js';

const quizRepository = new MongooseQuizRepository();
const questionRepository = new MongooseQuestionRepository();
const attemptRepository = new MongooseAttemptRepository();

const updateQuizUseCase = new UpdateQuizUseCase({
  quizRepository,
  attemptRepository,
  questionRepository,
});

const deleteQuizUseCase = new DeleteQuizUseCase({
  quizRepository,
  attemptRepository,
  questionRepository,
});

const normalizeCoverReference = (thumbnail) => {
  const value = String(thumbnail || '').trim();
  if (value.startsWith('data:')) {
    throw new AppError('Inline image data is not accepted. Upload the image through the media service.', 400);
  }
  return value;
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

const participantMedia = clips => (clips || []).map(clip => ({
  kind: clip.kind, assetId: clip.assetId, label: clip.label, transcript: clip.transcript,
  language: clip.language, purpose: clip.purpose, signedLanguage: clip.signedLanguage,
  captionAssetId: clip.captionAssetId, captionLanguage: clip.captionLanguage,
  describedAssetId: clip.describedAssetId, describedCaptionAssetId: clip.describedCaptionAssetId,
}));
const withParticipantMedia = item => item.accessibilityMedia?.length
  ? { ...item, accessibilityMedia: participantMedia(item.accessibilityMedia) }
  : item;

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
        return withParticipantMedia(optObj);
      });
    }

    return withParticipantMedia(safeQuestion);
  });
};

export const sanitizeAttemptForClient = (attemptDoc, { isOwner = false, isChallenge = false, deadlinePassed = false, allowReview = true } = {}) => {
  if (!attemptDoc) return null;
  const attempt = typeof attemptDoc?.toObject === 'function' ? attemptDoc.toObject() : { ...attemptDoc };
  delete attempt.questionSnapshot;
  delete attempt.sessionId;
  const isCompleted = attempt.status === 'completed';
  const revealChallengeResults = isChallenge && deadlinePassed;
  const canRevealFullAnswers = isChallenge ? revealChallengeResults : isCompleted && (allowReview || isOwner);

  if (Array.isArray(attempt.answers)) {
    attempt.answers = attempt.answers.map((ans) => {
      const sanitized = typeof ans?.toObject === 'function' ? ans.toObject() : { ...ans };

      if (!canRevealFullAnswers) {
        delete sanitized.correctOptionId;
      }

      if (isChallenge && !deadlinePassed) {
        sanitized.isCorrect = false;
        sanitized.marksAwarded = 0;
      } else if (!canRevealFullAnswers && !(attempt.instantFeedback && !isCompleted && sanitized.isLocked)) {
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
  const isExplicitlyPrivate = quiz.visibility === 'private' ||
    quiz.accessType === 'invite_only' ||
    quiz.isRestricted === true ||
    (quiz.isChallenge && ['draft', 'publishing'].includes(quiz.challengeStatus)) ||
    quiz.metadata?.savedAsDraft === true;
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

  if (!questionText && !question.accessibilityMedia?.length) {
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

    if (!text && !option.accessibilityMedia?.length) {
      throw new AppError(`Question ${index + 1} option ${optionIndex + 1} text is required`, 400);
    }

    return {
      label,
      text,
      optionId: stableOptionId(option),
      accessibilityMedia: normalizeMediaClips(option.accessibilityMedia),
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
    accessibilityMedia: normalizeMediaClips(question.accessibilityMedia),
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

  assertUploadAccess(upload, req);

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
  const uploaderId = upload.userId || req.user?._id || null;
  if (!shouldBypassDuplicate) {
    const existingQuiz = await findDuplicateQuiz({
      fileHash,
      uploaderId,
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

      if (!correctAnswer || !options.some((option) => option.label === correctAnswer)) {
        skipped += 1;
        continue;
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
      tags: Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean) : [],
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

    await persistGeneratedQuestions(quiz, questions);

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
  }, { uploaderId });

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

/**
 * Resolves a Quiz document by MongoDB _id OR symbolic quizCode (e.g., '!QZ-Y3C9DT', 'QZ-Y3C9DT', '#QZ-Y3C9DT').
 * @param {string} identifier - 24-hex ObjectId or symbolic quizCode
 * @param {object} options - { populateUploader: boolean, select: string }
 * @returns {Promise<Quiz|null>}
 */
export const resolveQuizDoc = async (identifier, { populateUploader = false, select = null } = {}) => {
  if (!identifier) return null;
  const raw = String(identifier).trim();

  let query;
  if (/^[0-9a-fA-F]{24}$/.test(raw)) {
    query = Quiz.findById(raw);
  } else {
    let code = raw.toUpperCase();
    if (!code.startsWith('!') && !code.startsWith('#')) {
      code = '!' + code;
    } else if (code.startsWith('#')) {
      code = '!' + code.slice(1);
    }

    query = Quiz.findOne({
      $or: [
        { quizCode: code },
        { quizCode: raw.toUpperCase() },
        { quizCode: `!${raw.toUpperCase()}` },
      ],
    });
  }

  if (select) query = query.select(select);
  if (populateUploader) {
    query = query.populate('uploader', 'name username avatar bio followersCount quizCount');
  }

  return query.exec();
};

export const getQuizByCode = catchAsync(async (req, res, next) => {
  const code = req.params.quizCode;
  const quiz = await resolveQuizDoc(code, { populateUploader: true });

  if (!quiz) {
    return next(new AppError('Quiz not found for the specified code', 404));
  }

  await assertQuizReadAccess(quiz, req);

  const [decorated] = await decorateQuizzesForViewer([quiz], req.user?._id);
  const finalQuiz = decorated || quiz;

  res.json({
    success: true,
    data: {
      quiz: finalQuiz,
    },
  });
});

export const getQuiz = catchAsync(async (req, res, next) => {
  const quizId = req.params.id;
  // Re-read policy on every detail request. Admin changes bypass this cache.
  const quiz = await resolveQuizDoc(quizId, { populateUploader: true });

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);

  const [decorated] = await decorateQuizzesForViewer([quiz], req.user?._id);
  const finalQuiz = decorated || quiz;

  res.json({
    success: true,
    data: {
      quiz: finalQuiz,
    },
  });
});

export const getQuizQuestions = catchAsync(async (req, res, next) => {
  const quiz = await resolveQuizDoc(req.params.id);

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
  const quiz = await resolveQuizDoc(req.params.id);

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
  const quiz = await resolveQuizDoc(quizId);

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
  const quizDoc = await resolveQuizDoc(req.params.id);
  const quizObjectId = quizDoc?._id || req.params.id;

  const attempt = await Attempt.findOne({
    _id: req.params.attemptId,
    quizId: quizObjectId,
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
  const quizDoc = await resolveQuizDoc(req.params.id);
  const quizObjectId = quizDoc?._id || req.params.id;

  const attempt = await Attempt.findOne({
    _id: req.params.attemptId,
    quizId: quizObjectId,
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
        attemptId: attempt._id,
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
  const includeDrafts = req.query.includeDrafts === 'true';
  const filter = includeDrafts
    ? { uploader: req.user._id }
    : { uploader: req.user._id, 'metadata.savedAsDraft': { $ne: true } };

  const [rawQuizzes, total, draftsCount] = await Promise.all([
    Quiz.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploader', 'name username avatar bio followersCount quizCount')
      .lean(),
    Quiz.countDocuments(filter),
    Quiz.countDocuments({ uploader: req.user._id, 'metadata.savedAsDraft': true }),
  ]);

  const quizzes = await decorateQuizzesForViewer(rawQuizzes, req.user._id);
  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      quizzes,
      draftsCount,
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

export const normalizeManualQuestion = (q, index) => {
  const questionType = q.questionType || q.type || 'multiple_choice';
  const optionTypes = ['multiple_choice', 'checkboxes', 'dropdown'];
  const rawOptions = Array.isArray(q.options) ? q.options : [];
  const options = optionTypes.includes(questionType)
    ? rawOptions.map((option, optionIndex) => {
        const label = String(option.label || String.fromCharCode(65 + optionIndex)).trim().toUpperCase();
        return {
          label,
          optionId: stableOptionId(option),
          accessibilityMedia: normalizeMediaClips(option.accessibilityMedia),
          text: String(option.text || option.optionText || (option.accessibilityMedia?.length ? '' : `Option ${optionIndex + 1}`)).trim(),
          isCorrect: option.isCorrect === true,
        };
      }).filter(option => option.text || option.accessibilityMedia.length)
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
    accessibilityMedia: normalizeMediaClips(q.accessibilityMedia),
    questionNumber: q.questionNumber || index + 1,
    questionText: String(q.questionText ?? q.question ?? (q.accessibilityMedia?.length ? '' : `Question ${index + 1}`)).trim(),
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

export const getDrafts = catchAsync(async (req, res) => {
  if (!req.user) {
    return res.json({
      success: true,
      data: { drafts: [], pagination: { total: 0, page: 1, limit: 50, pages: 1 } },
    });
  }

  const { page, limit, skip } = clampPagination(req.query);
  const search = String(req.query.search || req.query.q || '').trim();
  const sortBy = req.query.sortBy || 'newest';

  const filter = {
    uploader: req.user._id,
    $or: [{ 'metadata.savedAsDraft': true }, { isChallenge: true, challengeStatus: 'draft' }],
  };

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$and = [{ $or: [
      { title: regex },
      { category: regex },
      { tags: regex },
      { description: regex },
    ] }];
  }

  let sort = { updatedAt: -1, createdAt: -1 };
  if (sortBy === 'oldest') sort = { createdAt: 1 };
  else if (sortBy === 'title') sort = { title: 1 };
  else if (sortBy === 'questions') sort = { questionCount: -1 };

  const [rawDrafts, total] = await Promise.all([
    Quiz.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  const drafts = rawDrafts.map(({ draftData, ...draft }) => {
    const questionCount = draftData?.questions?.length ?? draft.questionCount ?? 0;
    let score = 0;
    if (draft.title && draft.title !== 'Untitled Quiz') score += 25;
    if (draft.category && draft.category !== 'General') score += 15;
    if (questionCount > 0) score += 35;
    if (draft.description) score += 10;
    if (draft.thumbnail) score += 15;
    const readiness = Math.min(100, Math.max(15, score));

    return {
      ...draft,
      questionCount,
      isDraft: true,
      readiness,
      isReadyToPublish: questionCount >= 1 && Boolean(draft.title),
    };
  });

  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      drafts,
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

export const getDraftById = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findOne({
    _id: req.params.id,
    uploader: req.user._id,
  }).lean();

  if (!quiz) {
    return next(new AppError('Draft not found or unauthorized', 404));
  }

  const { draftData, ...draft } = quiz;
  const challengeDraft = draft.isChallenge && draft.challengeStatus === 'draft' ? draftData : null;
  const questions = challengeDraft?.questions ?? await Question.find({ quizId: quiz._id })
    .sort({ orderIndex: 1, questionNumber: 1 })
    .lean();

  res.json({
    success: true,
    data: {
      draft: {
        ...draft,
        ...challengeDraft,
        questions,
      },
    },
  });
});

export const updateDraft = catchAsync(async (req, res, next) => {
  if (Array.isArray(req.body.questions)) req.body.questions = await validateQuestionMedia(req.body.questions, req, { draft: true });
  const quiz = await Quiz.findOne({
    _id: req.params.id,
    uploader: req.user._id,
  });

  if (!quiz) {
    return next(new AppError('Draft not found or unauthorized', 404));
  }

  const {
    title,
    description,
    category,
    difficulty,
    thumbnail,
    tags,
    settings,
    questions,
    builderMode,
    contentKind,
    isChallenge,
    durationMinutes,
    deadlineAt,
    accessType,
    inviteAccessType,
    metadata = {},
  } = req.body;

  if (title !== undefined) quiz.title = String(title).trim().slice(0, 70);
  if (description !== undefined) quiz.description = String(description).trim();
  if (category !== undefined) quiz.category = String(category).trim() || 'General';
  if (difficulty !== undefined) quiz.difficulty = normalizeDifficulty(difficulty);
  if (thumbnail !== undefined) {
    const thumbStr = typeof thumbnail === 'string' ? thumbnail.trim() : (thumbnail?.url || '');
    if (thumbStr && thumbStr !== '[object Object]') {
      quiz.thumbnail = thumbStr;
    } else if (thumbnail === '') {
      quiz.thumbnail = '';
    }
  }
  if (Array.isArray(tags)) quiz.tags = tags.map((t) => String(t).trim()).filter(Boolean);
  if (builderMode) quiz.builderMode = builderMode;
  if (contentKind) quiz.contentKind = contentKind;
  if (typeof isChallenge === 'boolean') quiz.isChallenge = isChallenge;
  if (durationMinutes !== undefined) quiz.durationMinutes = Number(durationMinutes) || 0;
  if (deadlineAt !== undefined) quiz.deadlineAt = deadlineAt ? new Date(deadlineAt) : null;
  if (accessType !== undefined) quiz.accessType = accessType === 'invite_only' ? 'invite_only' : 'public';
  if (inviteAccessType !== undefined) {
    quiz.inviteAccessType = ['invitation', 'approval'].includes(inviteAccessType) ? inviteAccessType : null;
  }
  if (quiz.isChallenge) {
    if ((Array.isArray(questions) ? questions.length : quiz.questionCount) > 10) {
      return next(new AppError('Challenges cannot have more than 10 questions.', 400));
    }
    quiz.visibility = 'private';
    quiz.isPublic = false;
    quiz.challengeStatus = 'draft';
  }

  if (settings && typeof settings === 'object') {
    quiz.settings = {
      ...quiz.settings,
      ...settings,
    };
  }

  quiz.metadata = {
    ...quiz.metadata,
    ...metadata,
    savedAsDraft: true,
    lastAutosavedAt: new Date(),
  };

  if (Array.isArray(questions)) {
    await Question.deleteMany({ quizId: quiz._id });
    if (questions.length > 0) {
      const questionDocs = questions.map((q, index) => ({
        ...normalizeManualQuestion(q, index),
        quizId: quiz._id,
      }));
      await Question.insertMany(questionDocs);
    }
    quiz.questionCount = questions.length;
    quiz.totalMarks = questions.reduce((acc, q) => acc + (Number(q.marks) || 1), 0);
  }

  await quiz.save();

  res.json({
    success: true,
    message: 'Draft updated successfully',
    data: {
      draft: quiz,
    },
  });
});

export const publishDraft = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findOne({
    _id: req.params.id,
    uploader: req.user._id,
  });

  if (!quiz) {
    return next(new AppError('Draft not found or unauthorized', 404));
  }

  const questions = await Question.find({ quizId: quiz._id });
  if (!questions || questions.length === 0) {
    return next(new AppError('Cannot publish an empty draft. Please add at least 1 question.', 400));
  }

  if (quiz.isChallenge) {
    if (questions.length > 10) {
      return next(new AppError('Challenges cannot have more than 10 questions.', 400));
    }
    if (!Number.isFinite(Number(quiz.durationMinutes)) || Number(quiz.durationMinutes) <= 0) {
      return next(new AppError('Challenges require a valid duration in minutes.', 400));
    }
    if (!quiz.deadlineAt || Number.isNaN(new Date(quiz.deadlineAt).getTime()) || new Date(quiz.deadlineAt) <= new Date()) {
      return next(new AppError('Challenges require a valid future deadline.', 400));
    }
  }

  for (const q of questions) {
    if (q.questionType === 'short_answer' && !String(q.correctAnswer || '').trim()) {
      return next(new AppError(`Question ${q.questionNumber || ''} is missing its expected answer.`, 400));
    }
    if (['multiple_choice', 'dropdown', 'checkboxes'].includes(q.questionType)) {
      if (!q.options || q.options.length < 2) {
        return next(new AppError(`Question ${q.questionNumber || ''} must have at least 2 options.`, 400));
      }
      const hasAnswer = Array.isArray(q.correctAnswer)
        ? q.correctAnswer.length > 0
        : Boolean(String(q.correctAnswer || '').trim());
      const hasCorrect = q.options.some((o) => o.isCorrect) || hasAnswer;
      if (!hasCorrect) {
        return next(new AppError(`Question ${q.questionNumber || ''} is missing a correct answer.`, 400));
      }
    }
  }

  await validateQuestionMedia(questions.map(q => q.toObject()), req);

  const visibility = quiz.isChallenge
    ? quiz.accessType === 'invite_only' ? 'private' : 'public'
    : req.body.visibility === 'private' ? 'private' : 'public';
  quiz.visibility = visibility;
  quiz.isPublic = visibility === 'public';
  if (quiz.isChallenge) quiz.challengeStatus = 'active';
  quiz.metadata = {
    ...quiz.metadata,
    savedAsDraft: false,
    publishedAt: new Date(),
  };

  await quiz.save();

  if (quiz.visibility === 'public') {
    await syncUserPublicQuizCount(quiz.uploader);
    await createQuizPublishedActivity({ quiz, actorId: quiz.uploader });
  }

  res.json({
    success: true,
    message: 'Quiz published successfully!',
    data: {
      quiz,
    },
  });
});

export const duplicateDraft = catchAsync(async (req, res, next) => {
  const original = await Quiz.findOne({
    _id: req.params.id,
    uploader: req.user._id,
  }).lean();

  if (!original) {
    return next(new AppError('Quiz or draft not found or unauthorized', 404));
  }

  const originalQuestions = await Question.find({ quizId: original._id }).lean();

  const { _id, createdAt, updatedAt, totalAttempts, avgScore, ...rest } = original;

  const newQuiz = await Quiz.create({
    ...rest,
    title: `${original.title || 'Untitled'} (Copy)`.slice(0, 70),
    visibility: 'private',
    isPublic: false,
    totalAttempts: 0,
    avgScore: 0,
    metadata: {
      ...original.metadata,
      savedAsDraft: true,
      duplicatedFrom: original._id,
      duplicatedAt: new Date(),
    },
    uploader: req.user._id,
  });

  if (originalQuestions.length > 0) {
    const clonedQuestions = originalQuestions.map((q) => {
      const { _id: qId, createdAt: qC, updatedAt: qU, ...qRest } = q;
      return {
        ...qRest,
        quizId: newQuiz._id,
      };
    });
    await Question.insertMany(clonedQuestions);
  }

  res.status(201).json({
    success: true,
    message: 'Draft duplicated successfully',
    data: {
      draft: newQuiz,
    },
  });
});

export const deleteDraft = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findOne({
    _id: req.params.id,
    uploader: req.user._id,
  });

  if (!quiz) {
    return next(new AppError('Draft not found or unauthorized', 404));
  }

  await Question.deleteMany({ quizId: quiz._id });
  await Quiz.findByIdAndDelete(quiz._id);

  res.json({
    success: true,
    message: 'Draft discarded successfully',
    data: null,
  });
});

export const listQuizzes = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query);
  const publicOnly = req.query.publicOnly === 'true' || req.query.scope === 'public';
  const mineOnly = req.query.mine === 'true' || req.query.scope === 'mine' || req.query.scope === 'my';
  const canonicalPublic = {
    visibility: { $ne: 'private' },
    $or: [{ visibility: 'public' }, { isPublic: true }],
    accessType: { $ne: 'invite_only' },
    $nor: [{ isChallenge: true, challengeStatus: { $in: ['draft', 'publishing'] } }],
    'metadata.savedAsDraft': { $ne: true },
    isRestricted: { $ne: true },
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

  const uploader = { path: 'uploader', select: 'name username avatar bio followersCount quizCount', options: { lean: true } };
  const pageQuery = sort.avgScore
    ? Quiz.aggregate([
      { $match: filter },
      { $set: { avgScore: { $cond: [
        { $and: [{ $eq: ['$isChallenge', true] }, { $or: [
          { $ne: [{ $type: '$deadlineAt' }, 'date'] }, { $gt: ['$deadlineAt', '$$NOW'] },
        ] }] },
        0,
        '$avgScore',
      ] } } },
      { $sort: sort }, { $skip: skip }, { $limit: limit },
    ]).then(rows => Quiz.populate(rows, uploader))
    : Quiz.find(filter).sort(sort).skip(skip).limit(limit).populate(uploader).lean();
  const [quizzes, total] = await Promise.all([pageQuery, Quiz.countDocuments(filter)]);

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
  if (Array.isArray(req.body.questions)) req.body.questions = await validateQuestionMedia(req.body.questions, req);
  const quizInput = normalizeQuizInput(req.body);
  const questionsInput = Array.isArray(req.body.questions) ? req.body.questions : [];

  if (!questionsInput.length) {
    throw new AppError('questions are required', 400);
  }

  if (quizInput.isChallenge && questionsInput.length > 10) {
    throw new AppError('Challenges cannot have more than 10 questions', 400);
  }

  const questions = questionsInput.map(normalizeQuestionInput);
  const thumbnail = normalizeCoverReference(quizInput.thumbnail);
  const quiz = await Quiz.create({
    ...quizInput,
    thumbnail,
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
  if (Array.isArray(req.body.questions)) req.body.questions = await validateQuestionMedia(req.body.questions, req, { draft: req.body.isDraft === true });
  const { title, description, questions, isDraft, builderMode = 'exam', contentKind = 'quiz', metadata = {} } = req.body;
  const allowedContentKinds = ['quiz', 'form', 'coding', 'upload', 'rating', 'survey', 'universal'];
  const normalizedContentKind = allowedContentKinds.includes(contentKind) ? contentKind : 'quiz';
  const effectiveDraft = normalizedContentKind === 'quiz' ? Boolean(isDraft) : true;
  const isChallenge = Boolean(req.body.isChallenge);

  if (!title) {
    return next(new AppError('title is required', 400));
  }
  
  if (!Array.isArray(questions)) {
    return next(new AppError('questions array is required', 400));
  }

  if (isChallenge && questions.length > 10) {
    return next(new AppError('Challenges cannot have more than 10 questions.', 400));
  }

  const durationMinutes = Number(req.body.durationMinutes ?? req.body.settings?.timeLimit ?? 0);
  const deadlineAt = req.body.deadlineAt ? new Date(req.body.deadlineAt) : null;
  const accessType = req.body.accessType === 'invite_only' ? 'invite_only' : 'public';
  const inviteAccessType = ['invitation', 'approval'].includes(req.body.inviteAccessType)
    ? req.body.inviteAccessType
    : null;

  if (isChallenge && (!Number.isFinite(durationMinutes) || (req.body.durationMinutes !== undefined && durationMinutes < 0))) {
    return next(new AppError('Challenge duration must be a valid non-negative number.', 400));
  }
  if (isChallenge && req.body.deadlineAt && Number.isNaN(deadlineAt?.getTime())) {
    return next(new AppError('Challenge deadline must be a valid date.', 400));
  }

  if (isChallenge && !effectiveDraft) {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return next(new AppError('Challenges require a valid duration in minutes.', 400));
    }
    if (!deadlineAt || Number.isNaN(deadlineAt.getTime()) || deadlineAt <= new Date()) {
      return next(new AppError('Challenges require a valid future deadline.', 400));
    }
    const invalidQuestion = questions.find((question) => {
      const questionType = question.questionType || question.type || 'multiple_choice';
      if (questionType === 'short_answer') return !String(question.correctAnswer || '').trim();
      const options = Array.isArray(question.options) ? question.options : [];
      const answer = Array.isArray(question.correctAnswer)
        ? question.correctAnswer.length > 0
        : Boolean(String(question.correctAnswer || '').trim());
      return options.length < 2 || !answer && !options.some((option) => option.isCorrect === true);
    });
    if (invalidQuestion) {
      return next(new AppError('Every published challenge question needs valid options and a correct answer.', 400));
    }
  }

  if (!effectiveDraft && !isChallenge) {
    const unsupportedIndex = questions.findIndex((q) => {
      const questionType = q.questionType || q.type || 'multiple_choice';
      return !['multiple_choice', 'dropdown', 'checkboxes', 'short_answer'].includes(questionType);
    });

    if (unsupportedIndex !== -1) {
      return next(new AppError(`Question ${unsupportedIndex + 1}: choose a supported quiz question type.`, 400));
    }

    for (const [index, input] of questions.entries()) {
      const question = normalizeManualQuestion(input, index);
      if (question.questionType === 'short_answer') {
        if (typeof question.correctAnswer !== 'string' || !question.correctAnswer.trim()) {
          return next(new AppError(`Question ${index + 1}: enter the expected answer.`, 400));
        }
        continue;
      }
      if (question.options.length < 2) {
        return next(new AppError(`Question ${index + 1}: add at least two answer choices.`, 400));
      }
      const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
      const labels = new Set(question.options.map(option => option.label.toUpperCase()));
      if (!answers.length || answers.some(answer => typeof answer !== 'string' || !labels.has(answer.trim().toUpperCase()))) {
        return next(new AppError(`Question ${index + 1}: mark the correct answer.`, 400));
      }
    }
  }

  const visibility = effectiveDraft
    ? 'private'
    : isChallenge && accessType === 'invite_only'
      ? 'private'
      : normalizeVisibility(req.body.visibility, 'public');
  const uploader = req.user._id;

  // Support in-place draft update if draftId is supplied
  if (req.body.draftId) {
    const existingDraft = await Quiz.findOne({ _id: req.body.draftId, uploader });
    if (existingDraft) {
      existingDraft.title = String(title || 'Untitled Quiz').trim().slice(0, 70);
      existingDraft.description = description || '';
      if (req.body.thumbnail !== undefined || req.body.coverUrl !== undefined) {
        existingDraft.thumbnail = normalizeCoverReference(req.body.thumbnail || req.body.coverUrl);
      }
      existingDraft.tags = Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
      existingDraft.category = String(req.body.category || 'General').trim() || 'General';
      existingDraft.difficulty = normalizeDifficulty(req.body.difficulty);
      existingDraft.isChallenge = isChallenge;
      existingDraft.deadlineAt = isChallenge ? deadlineAt : null;
      existingDraft.durationMinutes = isChallenge ? durationMinutes : 0;
      existingDraft.accessType = isChallenge ? accessType : 'public';
      existingDraft.inviteAccessType = isChallenge ? inviteAccessType : null;
      existingDraft.challengeStatus = isChallenge
        ? (effectiveDraft ? 'draft' : 'active')
        : 'active';
      existingDraft.settings = {
        ...(existingDraft.settings?.toObject?.() || existingDraft.settings || {}),
        ...req.body.settings,
      };
      existingDraft.visibility = visibility;
      existingDraft.isPublic = visibility === 'public';
      existingDraft.metadata = {
        ...existingDraft.metadata,
        ...metadata,
        savedAsDraft: effectiveDraft,
        lastAutosavedAt: new Date(),
      };
      await Question.deleteMany({ quizId: existingDraft._id });
      if (questions.length > 0) {
        const questionDocs = questions.map((q, index) => ({
          ...normalizeManualQuestion(q, index),
          quizId: existingDraft._id,
        }));
        await Question.insertMany(questionDocs);
      }
      existingDraft.questionCount = questions.length;
      existingDraft.totalMarks = questions.reduce((acc, question) => acc + (Number(question.marks) || 1), 0);
      await existingDraft.save();

      await syncUserPublicQuizCount(uploader);
      if (!effectiveDraft && existingDraft.visibility === 'public') {
        await createQuizPublishedActivity({ quiz: existingDraft, actorId: uploader });
      }

      return res.status(200).json({
        success: true,
        data: {
          quizId: existingDraft._id,
          quiz: existingDraft,
        },
      });
    }
  }

  const rawSettings = req.body.settings || {};
  const timerMode = ['none', 'soft', 'strict'].includes(rawSettings.timerMode) ? rawSettings.timerMode : 'none';

  const requestedThumbnail = normalizeCoverReference(req.body.thumbnail || req.body.coverUrl);

  const quiz = await Quiz.create({
    title: String(title || 'Untitled Quiz').trim().slice(0, 70),
    description: description || '',
    thumbnail: requestedThumbnail,
    tags: Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    category: String(req.body.category || 'General').trim() || 'General',
    difficulty: normalizeDifficulty(req.body.difficulty),
    visibility,
    isPublic: visibility === 'public',
    isChallenge,
    deadlineAt: isChallenge ? deadlineAt : null,
    durationMinutes: isChallenge ? durationMinutes : 0,
    accessType: isChallenge ? accessType : 'public',
    inviteAccessType: isChallenge ? inviteAccessType : null,
    challengeStatus: isChallenge && effectiveDraft ? 'draft' : 'active',
    contentKind: effectiveDraft ? normalizedContentKind : 'quiz',
    builderMode: String(builderMode || 'exam').trim() || 'exam',
    settings: {
      timeLimit: isChallenge ? durationMinutes : 0,
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
    totalMarks: questions.reduce((acc, question) => acc + (Number(question.marks) || 1), 0),
  });

  if (questions.length > 0) {
    const questionDocs = questions.map((q, index) => ({
      ...normalizeManualQuestion(q, index),
      quizId: quiz._id,
    }));

    await Question.insertMany(questionDocs);
  }

  if (!effectiveDraft && quiz.visibility === 'public') {
    await syncUserPublicQuizCount(uploader);
    await createQuizPublishedActivity({ quiz, actorId: uploader });
  }

  res.status(201).json({
    success: true,
    data: {
      quizId: quiz._id,
      quiz,
    }
  });
});

export const updateQuiz = catchAsync(async (req, res, next) => {
  if (Array.isArray(req.body.questions)) req.body.questions = await validateQuestionMedia(req.body.questions, req);
  const quiz = await resolveQuizDoc(req.params.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);
  const originalUploaderId = quiz.uploader;
  const wasPublic = quiz.visibility === 'public' || quiz.isPublic === true;

  try {
    let normalizedQuestions = undefined;
    if (Array.isArray(req.body.questions)) {
      normalizedQuestions = req.body.questions.map(normalizeQuestionInput);
    }

    const quizInput = normalizeQuizInput({
      ...quiz.toObject(),
      ...req.body,
      title: req.body.title ?? quiz.title,
    });

    const updatePayload = {
      ...quizInput,
      ...(normalizedQuestions ? { questions: normalizedQuestions } : {}),
      totalMarks: normalizedQuestions
        ? (quiz.isChallenge ? normalizedQuestions.length : getQuizTotalMarks(normalizedQuestions))
        : quiz.totalMarks,
    };

    const updatedQuiz = await updateQuizUseCase.execute({
      quizId: quiz._id,
      updatePayload,
      userId: req.user?._id,
      isAdmin: req.user?.role === 'admin',
    });

    await syncUserPublicQuizCount(originalUploaderId);
    const isNowPublic = updatedQuiz.visibility === 'public' || updatedQuiz.isPublic === true;
    if (!wasPublic && isNowPublic) {
      await createQuizPublishedActivity({ quiz: updatedQuiz, actorId: updatedQuiz.uploader });
    }

    memoryCache.del(`quiz:public:${quiz._id}`);
    if (quiz.quizCode) {
      memoryCache.del(`quiz:public:${quiz.quizCode}`);
    }
    memoryCache.del(`leaderboard:${quiz._id}`);

    res.json({
      success: true,
      data: {
        quiz: updatedQuiz,
      },
    });
  } catch (err) {
    if (err instanceof DomainError || err.message?.includes('immutable') || err.message?.includes('cannot') || err.message?.includes('Cannot')) {
      return next(new AppError(err.message, 409));
    }
    next(err);
  }
});

export const deleteQuiz = catchAsync(async (req, res, next) => {
  const quiz = await resolveQuizDoc(req.params.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);

  try {
    await deleteQuizUseCase.execute({
      quizId: quiz._id,
      userId: req.user?._id,
      isAdmin: req.user?.role === 'admin',
    });

    await Promise.all([
      deleteQuizSocialData(quiz._id),
      Upload.updateMany({ quizId: quiz._id }, { $set: { quizId: null } }).catch(() => {}),
      syncUserPublicQuizCount(quiz.uploader),
    ]);

    memoryCache.del(`quiz:public:${quiz._id}`);
    memoryCache.del(`leaderboard:${quiz._id}`);

    res.json({
      success: true,
      data: null,
    });
  } catch (err) {
    if (err instanceof DomainError || err.message?.includes('Cannot delete') || err.message?.includes('cannot')) {
      return next(new AppError(err.message, 409));
    }
    next(err);
  }
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
          attemptId: attempt._id,
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
  const quiz = await resolveQuizDoc(req.params.id);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);

  if (quiz.isChallenge && !(quiz.deadlineAt && new Date(quiz.deadlineAt) <= new Date())) {
    return next(new AppError('Challenge results are sealed until the deadline', 403));
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

  const quiz = await resolveQuizDoc(quizId);

  if (!quiz) {
    return next(new AppError('Quiz not found', 404));
  }

  await assertQuizReadAccess(quiz, req);
  const deadlinePassed = quiz.deadlineAt ? new Date() >= quiz.deadlineAt : false;
  if (quiz.isChallenge && !deadlinePassed) {
    return res.json({
      success: true,
      data: { attempts: [], pagination: { total: 0, page, limit, pages: 0 }, quarantined: true },
    });
  }

  const matchCondition = {
    quizId: quiz._id,
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
      attempts: attempts.map(attempt => sanitizeAttemptForClient(attempt, {
        isChallenge: quiz.isChallenge, deadlinePassed, allowReview: quiz.settings?.allowReview !== false,
        isOwner: String(quiz.uploader) === String(req.user._id),
      })),
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
  const quiz = await resolveQuizDoc(req.params.id);
  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  assertQuizManageAccess(quiz, req);

  const coverUrl = normalizeCoverReference(req.body.imageUrl);
  if (!coverUrl.startsWith('/media/assets/')) {
    throw new AppError('Quiz covers must be uploaded through the media service', 400);
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
  const quiz = await resolveQuizDoc(req.params.id);
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
  const quiz = await resolveQuizDoc(req.params.id);

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
  memoryCache.set(cacheKey, payload, env.CACHE_SHORT_TTL_MS);

  res.json({
    success: true,
    data: payload,
  });
});

export const createChallenge = (req, res, next) => {
  req.body = {
    ...req.body,
    isDraft: false,
    isChallenge: true,
    contentKind: 'quiz',
    builderMode: 'challenge',
  };
  return saveManualDraft(req, res, next);
};
