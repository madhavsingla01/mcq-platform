import mongoose from 'mongoose';
import Challenge, { generateChallengeCode } from '../models/Challenge.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import env from '../config/env.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';

export const sanitizeQuestionsForContest = (questions = [], deadlinePassed = false) => {
  return questions.map((q) => {
    const raw = q.toObject ? q.toObject() : { ...q };
    if (!deadlinePassed) {
      delete raw.correctOption;
      delete raw.correctAnswer;
      delete raw.explanation;
      if (Array.isArray(raw.options)) {
        raw.options = raw.options.map((opt) => {
          if (typeof opt === 'object' && opt !== null) {
            const { isCorrect, ...rest } = opt;
            return rest;
          }
          return opt;
        });
      }
    }
    return raw;
  });
};

/**
 * Normalizes question inputs whether coming from UI ManualBuilder or raw REST payload
 */
export const normalizeChallengeQuestionInput = (q, index) => {
  if (!q || typeof q !== 'object' || Array.isArray(q)) throw new AppError(`Question #${index + 1} must be an object.`, 400);
  const rawText = q.questionText ?? q.text;
  if (typeof rawText !== 'string') {
    throw new AppError(`Question #${index + 1} text must be a string.`, 400);
  }
  const text = rawText.trim();
  const rawOptions = Array.isArray(q.options) ? q.options : [];

  let optionsForDoc = [];
  let optionStrings = [];
  let correctOptionIndex = -1;
  let correctAnswer = null;

  if (rawOptions.length > 0 && typeof rawOptions[0] === 'object' && rawOptions[0] !== null) {
    // UI ManualBuilder format: [{ label: 'A', text: '...', isCorrect: true }]
    optionsForDoc = rawOptions.map((opt, optIdx) => {
      const label = String.fromCharCode(65 + optIdx);
      const rawOptionText = opt.text ?? opt.optionText;
      if (typeof rawOptionText !== 'string') {
        throw new AppError(`Question #${index + 1} option #${optIdx + 1} text must be a string.`, 400);
      }
      const optText = rawOptionText.trim();
      const isCorrect = opt.isCorrect === true;
      if (isCorrect && correctOptionIndex === -1) {
        correctOptionIndex = optIdx;
      }
      return { label, text: optText, isCorrect };
    });
    optionStrings = optionsForDoc.map((o) => o.text);
    if (q.correctOption !== undefined) {
      if (!['number', 'string'].includes(typeof q.correctOption) || q.correctOption === '') {
        throw new AppError(`Question #${index + 1} has an invalid correct option index.`, 400);
      }
      const explicitCorrectOption = Number(q.correctOption);
      if (!Number.isInteger(explicitCorrectOption) || explicitCorrectOption < 0 || explicitCorrectOption >= optionsForDoc.length) {
        throw new AppError(`Question #${index + 1} has an invalid correct option index.`, 400);
      }
      correctOptionIndex = explicitCorrectOption;
      optionsForDoc.forEach((o, idx) => {
        o.isCorrect = idx === correctOptionIndex;
      });
    } else if (optionsForDoc.filter((option) => option.isCorrect).length !== 1) {
      throw new AppError(`Question #${index + 1} must mark exactly one correct option.`, 400);
    }
    if (correctOptionIndex >= 0 && correctOptionIndex < optionsForDoc.length) {
      correctAnswer = optionsForDoc[correctOptionIndex].label;
    }
  } else {
    // Array of strings format: ['Opt1', 'Opt2']
    if (rawOptions.some((opt) => typeof opt !== 'string')) {
      throw new AppError(`Question #${index + 1} options must be strings or option objects.`, 400);
    }
    optionStrings = rawOptions.map((opt) => opt.trim());
    if (q.correctOption === undefined || !['number', 'string'].includes(typeof q.correctOption) || q.correctOption === '') {
      throw new AppError(`Question #${index + 1} must select one correct option.`, 400);
    }
    correctOptionIndex = Number(q.correctOption);
    if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= optionStrings.length) {
      throw new AppError(`Question #${index + 1} has an invalid correct option index.`, 400);
    }
    optionsForDoc = optionStrings.map((txt, optIdx) => ({
      label: String.fromCharCode(65 + optIdx),
      text: txt,
      isCorrect: optIdx === correctOptionIndex,
    }));
    if (correctOptionIndex >= 0 && correctOptionIndex < optionsForDoc.length) {
      correctAnswer = optionsForDoc[correctOptionIndex].label;
    }
  }

  if (q.marks !== undefined && !['number', 'string'].includes(typeof q.marks)) {
    throw new AppError(`Question #${index + 1} marks must be numeric.`, 400);
  }
  const marks = q.marks === undefined ? 1 : Number(q.marks);
  if (!Number.isFinite(marks) || marks <= 0) {
    throw new AppError(`Question #${index + 1} marks must be a positive number.`, 400);
  }
  const explanation = String(q.explanation || '').trim();

  return {
    questionText: text,
    optionsForDoc,
    optionStrings,
    correctOption: correctOptionIndex,
    correctAnswer,
    explanation,
    marks,
    orderIndex: index,
  };
};

const saveChallengeDraft = async (req, res) => {
  const body = req.body;
  if (typeof body.description === 'string' && body.description.length > 2000) throw new AppError('Description cannot exceed 2000 characters.', 400);
  if (typeof body.category === 'string' && body.category.length > 100) throw new AppError('Category cannot exceed 100 characters.', 400);
  if (typeof body.title === 'string' && body.title.length > 120) throw new AppError('Title cannot exceed 120 characters.', 400);
  if (Array.isArray(body.questions) && body.questions.length > 10) throw new AppError('Challenges are capped at 10 questions.', 400);
  if (Array.isArray(body.tags) && (body.tags.length > 8 || body.tags.some((tag) => typeof tag !== 'string' || tag.length > 40))) {
    throw new AppError('Tags must contain at most 8 strings of 40 characters or fewer.', 400);
  }
  const title = typeof body.title === 'string' && body.title.trim().length >= 3
    ? body.title.trim()
    : 'Untitled Challenge';
  const duration = Number(body.durationMinutes);
  const validDuration = Number.isInteger(duration) && duration >= 1 && duration <= 180;
  const deadline = body.deadlineAt ? new Date(body.deadlineAt) : null;
  const validDeadline = deadline && Number.isFinite(deadline.getTime()) && deadline > new Date();
  const accessType = body.accessType === 'invite_only' ? 'invite_only' : 'public';
  const inviteAccessType = ['invitation', 'approval'].includes(body.inviteAccessType) ? body.inviteAccessType : null;
  if (accessType === 'invite_only' && !inviteAccessType) {
    throw new AppError('Private challenges require an invitation or approval access mode.', 400);
  }

  const draftData = {
    title,
    description: typeof body.description === 'string' ? body.description : '',
    thumbnail: typeof body.thumbnail === 'string' ? body.thumbnail : null,
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'General',
    difficulty: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(body.difficulty) ? body.difficulty : 'Intermediate',
    durationMinutes: validDuration ? duration : null,
    deadlineAt: validDeadline ? deadline.toISOString() : null,
    accessType,
    inviteAccessType: accessType === 'invite_only' ? inviteAccessType : null,
    tags: Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string').slice(0, 8) : [],
    settings: body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings : {},
    questions: Array.isArray(body.questions) ? body.questions : [],
  };

  let challenge;
  if (body.draftId) {
    challenge = await Challenge.findOne({
      _id: body.draftId,
      uploader: req.user._id,
      isChallenge: true,
      challengeStatus: 'draft',
    }).select('+draftData');
    if (!challenge) throw new AppError('Challenge draft not found.', 404);
  } else {
    challenge = new Challenge({
      title,
      uploader: req.user._id,
      isChallenge: true,
      challengeStatus: 'draft',
      durationMinutes: validDuration ? duration : undefined,
      deadlineAt: validDeadline ? deadline : undefined,
    });
  }

  Object.assign(challenge, {
    title,
    description: draftData.description,
    thumbnail: draftData.thumbnail,
    category: draftData.category,
    difficulty: draftData.difficulty,
    durationMinutes: validDuration ? duration : undefined,
    deadlineAt: validDeadline ? deadline : undefined,
    accessType,
    inviteAccessType: draftData.inviteAccessType,
    visibility: body.visibility === 'private' || accessType === 'invite_only' ? 'private' : 'public',
    isPublic: false,
    challengeStatus: 'draft',
    questions: [],
  });
  challenge.set('draftData', draftData);
  await challenge.save();

  res.status(body.draftId ? 200 : 201).json({
    success: true,
    message: 'Challenge draft saved.',
    data: {
      challengeId: challenge._id,
      challenge: { _id: challenge._id, title: challenge.title, challengeStatus: challenge.challengeStatus, updatedAt: challenge.updatedAt },
    },
  });
};

/**
 * POST /api/v1/challenges
 * Create a new competitive challenge (strictly <= 10 questions).
 */
export const createChallenge = catchAsync(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new AppError('Request body must be an object.', 400);
  }

  if (req.body.isDraft === true) {
    await saveChallengeDraft(req, res);
    return;
  }

  let existingDraft = null;
  if (req.body.draftId) {
    existingDraft = await Challenge.findOne({
      _id: req.body.draftId,
      uploader: req.user._id,
      isChallenge: true,
    }).select('+draftData');
    if (!existingDraft) throw new AppError('Challenge draft not found.', 404);
    if (existingDraft.challengeStatus === 'publishing') {
      throw new AppError('Challenge publication is already in progress.', 409);
    }
    if (existingDraft.challengeStatus !== 'draft') {
      res.json({
        success: true,
        message: 'Challenge was already published.',
        data: { challengeId: existingDraft._id, quizId: existingDraft._id, challenge: existingDraft },
      });
      return;
    }
    req.body = { ...(existingDraft.draftData || {}), ...req.body };
  }

  const {
    title,
    description = '',
    category = 'General',
    difficulty = 'Intermediate',
    thumbnail = null,
    durationMinutes,
    deadlineAt,
    accessType = 'public',
    inviteAccessType = null,
    questions = [],
    tags = [],
  } = req.body;

  if (typeof title !== 'string' || !title.trim()) {
    throw new AppError('Challenge title is required.', 400);
  }
  if (typeof description !== 'string' || typeof category !== 'string') {
    throw new AppError('Description and category must be strings.', 400);
  }
  if (title.trim().length > 120 || description.length > 2000 || category.trim().length > 100) {
    throw new AppError('Title, description, or category exceeds its maximum length.', 400);
  }
  if (thumbnail !== null && thumbnail !== undefined && typeof thumbnail !== 'string') {
    throw new AppError('Thumbnail must be a string or null.', 400);
  }
  if (!['Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(difficulty)) {
    throw new AppError('Difficulty must be Beginner, Intermediate, Advanced, or All Levels.', 400);
  }
  if (!Array.isArray(tags) || tags.length > 8 || tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) {
    throw new AppError('Tags must contain at most 8 strings of 40 characters or fewer.', 400);
  }
  if (!['public', 'invite_only'].includes(accessType)) {
    throw new AppError('accessType must be public or invite_only.', 400);
  }
  if (accessType === 'invite_only' && !['invitation', 'approval'].includes(inviteAccessType)) {
    throw new AppError('Private challenges require an invitation or approval access mode.', 400);
  }

  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
    throw new AppError('Challenges require a valid duration in minutes (1–180).', 400);
  }

  if (!deadlineAt) {
    throw new AppError('Challenges require a future finalization deadline (deadlineAt).', 400);
  }

  const deadlineDate = new Date(deadlineAt);
  if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
    throw new AppError('The deadline must be a valid timestamp in the future.', 400);
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new AppError('At least 1 question is required to create a challenge.', 400);
  }

  if (questions.length > 10) {
    throw new AppError('Competitive challenges are strictly capped at a maximum of 10 questions.', 400);
  }

  // Normalize questions for both embedded challenge document and shared questions collection
  const normalizedList = questions.map((q, idx) => normalizeChallengeQuestionInput(q, idx));

  for (let i = 0; i < normalizedList.length; i++) {
    const nq = normalizedList[i];
    if (!nq.questionText) {
      throw new AppError(`Question #${i + 1} is missing questionText.`, 400);
    }
    if (nq.optionsForDoc.length < 2 || nq.optionsForDoc.length > 8) {
      throw new AppError(`Question #${i + 1} must have between 2 and 8 options.`, 400);
    }
    if (nq.optionsForDoc.some((option) => !option.text)) {
      throw new AppError(`Question #${i + 1} options cannot be empty.`, 400);
    }
    if (!Number.isInteger(nq.correctOption) || nq.correctOption < 0 || nq.correctOption >= nq.optionsForDoc.length) {
      throw new AppError(`Question #${i + 1} has an invalid correctOption selection.`, 400);
    }
  }

  const totalMarks = normalizedList.reduce((sum, question) => sum + question.marks, 0);
  if (!Number.isFinite(totalMarks)) throw new AppError('Total challenge marks exceed the supported range.', 400);

  const challengeCode = generateChallengeCode();

  // Embedded question format for Challenge document
  const embeddedQuestions = normalizedList.map((nq) => ({
    questionText: nq.questionText,
    options: nq.optionStrings,
    correctOption: nq.correctOption,
    explanation: nq.explanation,
    marks: nq.marks,
  }));

  if (existingDraft) {
    const claimedDraft = await Challenge.findOneAndUpdate(
      { _id: existingDraft._id, uploader: req.user._id, challengeStatus: 'draft' },
      { $set: { challengeStatus: 'publishing' } },
      { new: true }
    ).select('+draftData');
    if (!claimedDraft) {
      const current = await Challenge.findById(existingDraft._id);
      if (current && ['active', 'ended'].includes(current.challengeStatus)) {
        res.json({
          success: true,
          message: 'Challenge was already published.',
          data: { challengeId: current._id, quizId: current._id, challenge: current },
        });
        return;
      }
      throw new AppError('Challenge publication is already in progress.', 409);
    }
    existingDraft = claimedDraft;
  }

  const challenge = existingDraft || new Challenge();
  const draftDataToRestore = existingDraft?.draftData;
  Object.assign(challenge, {
    title: title.trim(),
    challengeCode,
    quizCode: challengeCode,
    description: description.trim(),
    category: category.trim(),
    difficulty,
    thumbnail,
    uploader: req.user._id,
    durationMinutes: duration,
    deadlineAt: deadlineDate,
    accessType: accessType === 'invite_only' ? 'invite_only' : 'public',
    visibility: accessType === 'invite_only' ? 'private' : 'public',
    isPublic: false,
    inviteAccessType: accessType === 'invite_only' ? inviteAccessType : null,
    challengeStatus: existingDraft ? 'publishing' : 'draft',
    questions: embeddedQuestions,
    totalQuestions: normalizedList.length,
    questionCount: normalizedList.length,
    totalMarks,
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
    settings: {
      timeLimit: duration,
      timerMode: 'strict',
      instantFeedback: false,
      allowReview: false,
    },
  });
  challenge.set('draftData', undefined);

  // Also insert into shared 'questions' collection so attempt-service has 100% interoperability
  const questionDocs = normalizedList.map((nq, idx) => ({
    quizId: challenge._id,
    questionNumber: idx + 1,
    questionText: nq.questionText,
    questionType: 'multiple_choice',
    options: nq.optionsForDoc,
    correctAnswer: nq.correctAnswer,
    explanation: nq.explanation,
    difficulty,
    category: category.trim(),
    marks: nq.marks,
    orderIndex: idx,
  }));

  try {
    await challenge.save();
    await Question.insertMany(questionDocs);
    challenge.challengeStatus = 'active';
    challenge.isPublic = accessType === 'public';
    await challenge.save();
  } catch (error) {
    await Question.deleteMany({ quizId: challenge._id });
    if (existingDraft) {
      challenge.challengeStatus = 'draft';
      challenge.questions = [];
      challenge.set('draftData', draftDataToRestore);
      await challenge.save();
    } else {
      await Challenge.deleteOne({ _id: challenge._id });
    }
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'Challenge created successfully.',
    data: {
      challengeId: challenge._id,
      quizId: challenge._id,
      challenge,
    },
  });
});

/**
 * GET /api/v1/challenges
 * List challenges with active/ended status filters and search.
 */
export const listChallenges = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(
    env.CHALLENGE_LIST_MAX_PAGE_SIZE,
    Math.max(1, requestedLimit || env.CHALLENGE_LIST_DEFAULT_PAGE_SIZE)
  );
  const skip = (page - 1) * limit;

  const status = String(req.query.status || 'active').toLowerCase();
  if (!['active', 'ended'].includes(status)) throw new AppError('Status must be active or ended.', 400);
  const category = req.query.category;
  const search = String(req.query.search || req.query.q || '').trim();

  const filter = {
    isChallenge: true,
    isRestricted: { $ne: true },
    accessType: 'public',
    visibility: 'public',
  };
  const additionalConditions = [];

  const now = new Date();
  if (status === 'active') {
    filter.deadlineAt = { $gt: now };
    filter.challengeStatus = 'active';
  } else if (status === 'ended') {
    filter.challengeStatus = { $in: ['active', 'ended'] };
    additionalConditions.push({ $or: [{ deadlineAt: { $lte: now } }, { challengeStatus: 'ended' }] });
  }

  if (category && category !== 'all' && category !== 'All') {
    const escapedCategory = String(category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.category = new RegExp(`^${escapedCategory}$`, 'i');
  }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    additionalConditions.push({ $or: [{ title: regex }, { challengeCode: regex }, { tags: regex }] });
  }
  if (additionalConditions.length) filter.$and = additionalConditions;

  const [challenges, total] = await Promise.all([
    Challenge.find(filter)
      .populate('uploader', 'name username avatar')
      .sort({ deadlineAt: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-questions.correctOption -questions.explanation')
      .lean(),
    Challenge.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      challenges,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

/**
 * GET /api/v1/challenges/:idOrCode
 * Resolve challenge by ObjectId or symbolic challengeCode (!QZ-XXXXXX).
 */
export const getChallengeByIdOrCode = catchAsync(async (req, res) => {
  const { idOrCode } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrCode);

  const query = isObjectId
    ? { _id: new mongoose.Types.ObjectId(idOrCode), isChallenge: true }
    : {
        $or: [
          { challengeCode: idOrCode.toUpperCase() },
          { quizCode: idOrCode.toUpperCase() },
        ],
        isChallenge: true,
      };

  const challenge = await Challenge.findOne(query).populate('uploader', 'name username avatar bio');
  if (!challenge) {
    throw new AppError('Challenge not found', 404);
  }

  const isOwner = req.user && String(req.user._id) === String(challenge.uploader?._id || challenge.uploader);
  const isAdmin = req.user?.role === 'admin';
  if (['draft', 'publishing'].includes(challenge.challengeStatus) && !isOwner && !isAdmin) {
    throw new AppError('Challenge not found', 404);
  }
  if ((challenge.isRestricted || challenge.accessType !== 'public' || challenge.visibility !== 'public') && !isOwner && !isAdmin) {
    throw new AppError('Challenge not found', 404);
  }
  const deadlinePassed = challenge.deadlineAt && new Date(challenge.deadlineAt) <= new Date();
  const shouldRevealAnswers = deadlinePassed || isOwner;

  let questions = [];
  if (Array.isArray(challenge.questions) && challenge.questions.length > 0) {
    questions = sanitizeQuestionsForContest(challenge.questions, shouldRevealAnswers);
  } else {
    // If not embedded, fetch from shared Question collection
    const rawQuestions = await Question.find({ quizId: challenge._id }).sort({ orderIndex: 1, questionNumber: 1 });
    questions = sanitizeQuestionsForContest(rawQuestions, shouldRevealAnswers);
  }

  const sanitized = challenge.toObject();
  sanitized.questions = questions;
  sanitized.questionCount = challenge.questionCount || sanitized.totalQuestions || questions.length;
  sanitized.deadlinePassed = Boolean(deadlinePassed);

  res.json({
    success: true,
    data: {
      challenge: sanitized,
      quiz: sanitized, // Backward compatibility alias
      deadlinePassed: Boolean(deadlinePassed),
    },
  });
});

/**
 * PUT /api/v1/challenges/:idOrCode
 * Update challenge metadata.
 */
export const updateChallenge = catchAsync(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new AppError('Request body must be an object.', 400);
  }
  const { idOrCode } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrCode);
  const query = isObjectId
    ? { _id: new mongoose.Types.ObjectId(idOrCode), isChallenge: true }
    : { challengeCode: idOrCode.toUpperCase(), isChallenge: true };

  const challenge = await Challenge.findOne(query);
  if (!challenge) throw new AppError('Challenge not found', 404);

  const isOwner = req.user && String(req.user._id) === String(challenge.uploader);
  if (!isOwner && req.user?.role !== 'admin') {
    throw new AppError('You are not authorized to update this challenge.', 403);
  }

  const { title, description, thumbnail, tags, category, difficulty } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length < 3) throw new AppError('Title must be at least 3 characters.', 400);
    challenge.title = title.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string') throw new AppError('Description must be a string.', 400);
    challenge.description = description.trim();
  }
  if (thumbnail !== undefined && thumbnail !== null && typeof thumbnail !== 'string') {
    throw new AppError('Thumbnail must be a string or null.', 400);
  }
  if (thumbnail !== undefined) challenge.thumbnail = thumbnail;
  if (category !== undefined) {
    if (typeof category !== 'string' || !category.trim()) throw new AppError('Category must be a non-empty string.', 400);
    challenge.category = category.trim();
  }
  if (difficulty !== undefined) {
    if (!['Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(difficulty)) {
      throw new AppError('Difficulty must be Beginner, Intermediate, Advanced, or All Levels.', 400);
    }
    challenge.difficulty = difficulty;
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
      throw new AppError('Tags must be an array of strings.', 400);
    }
    challenge.tags = tags.map((tag) => tag.trim()).filter(Boolean);
  }

  await challenge.save();

  res.json({
    success: true,
    message: 'Challenge updated successfully.',
    data: { challenge },
  });
});

/**
 * DELETE /api/v1/challenges/:idOrCode
 */
export const deleteChallenge = catchAsync(async (req, res) => {
  const { idOrCode } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrCode);
  const query = isObjectId
    ? { _id: new mongoose.Types.ObjectId(idOrCode), isChallenge: true }
    : { challengeCode: idOrCode.toUpperCase(), isChallenge: true };

  const challenge = await Challenge.findOne(query);
  if (!challenge) throw new AppError('Challenge not found', 404);

  const isOwner = req.user && String(req.user._id) === String(challenge.uploader);
  if (!isOwner && req.user?.role !== 'admin') {
    throw new AppError('You are not authorized to delete this challenge.', 403);
  }

  const competitiveAttemptCount = await Attempt.countDocuments({
    quizId: challenge._id,
    userId: { $ne: null },
    isPractice: { $ne: true },
  });
  if (competitiveAttemptCount > 0) {
    throw new AppError('A challenge with competitive participation cannot be deleted.', 409);
  }

  await Promise.all([
    challenge.deleteOne(),
    Question.deleteMany({ quizId: challenge._id }),
  ]);

  res.json({
    success: true,
    message: 'Challenge deleted successfully.',
  });
});
