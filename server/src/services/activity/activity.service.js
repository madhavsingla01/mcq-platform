import mongoose from 'mongoose';
import AppEvent from '../../models/AppEvent.model.js';
import AnswerHistory from '../../models/AnswerHistory.model.js';
import RecentQuiz from '../../models/RecentQuiz.model.js';
import MappingConfig from '../../models/MappingConfig.model.js';
import AIInteraction from '../../models/AIInteraction.model.js';
import SearchHistory from '../../models/SearchHistory.model.js';
import SessionActivity from '../../models/SessionActivity.model.js';
import { logger } from '../../utils/logger.js';

const asObjectId = (value) => {
  if (!value) {
    return null;
  }

  const id = value?._id || value;
  return mongoose.isValidObjectId(id) ? id : null;
};

export const getClientSessionId = (req) => {
  return (
    req?.get?.('x-quiz-session-id') ||
    req?.get?.('x-client-session-id') ||
    req?.body?.sessionId ||
    req?.query?.sessionId ||
    null
  );
};

const getActor = (req) => ({
  userId: asObjectId(req?.user?._id),
  clientSessionId: getClientSessionId(req),
});

const getRequestContext = (req) => {
  if (!req) {
    return undefined;
  }

  return {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.get?.('user-agent') || '',
  };
};

export const recordEvent = async ({
  req = null,
  eventType,
  category,
  source = 'api',
  userId = null,
  clientSessionId = null,
  quizId = null,
  attemptId = null,
  questionId = null,
  sessionId = null,
  uploadId = null,
  messageId = null,
  metadata = {},
}) => {
  if (!eventType || !category) {
    return null;
  }

  const actor = getActor(req);

  try {
    return await AppEvent.create({
      eventType,
      category,
      source,
      userId: asObjectId(userId) || actor.userId,
      clientSessionId: clientSessionId || actor.clientSessionId,
      quizId: asObjectId(quizId),
      attemptId: asObjectId(attemptId),
      questionId: asObjectId(questionId),
      sessionId: asObjectId(sessionId),
      uploadId: asObjectId(uploadId),
      messageId: asObjectId(messageId),
      metadata,
      request: getRequestContext(req),
    });
  } catch (error) {
    logger.debug(`Failed to record event ${eventType}: ${error.message}`);
    return null;
  }
};

export const recordSessionActivity = async ({
  req = null,
  eventType,
  sessionId,
  quizId = null,
  userId = null,
  metadata = {},
  source = 'api',
}) => {
  if (!eventType || !asObjectId(sessionId)) {
    return null;
  }

  const actor = getActor(req);
  const resolvedUserId = asObjectId(userId) || actor.userId;

  try {
    const activity = await SessionActivity.create({
      sessionId: asObjectId(sessionId),
      quizId: asObjectId(quizId),
      userId: resolvedUserId,
      eventType,
      metadata,
    });

    await recordEvent({
      req,
      eventType,
      category: 'session',
      source,
      userId: resolvedUserId,
      sessionId,
      quizId,
      metadata,
    });

    return activity;
  } catch (error) {
    logger.debug(`Failed to record session activity ${eventType}: ${error.message}`);
    return null;
  }
};

export const recordAnswerChanges = async ({
  req = null,
  attempt,
  changes = [],
  source = 'sync',
}) => {
  if (!attempt?._id || !changes.length) {
    return [];
  }

  const actor = getActor(req);
  const userId = asObjectId(attempt.userId) || actor.userId;
  const clientSessionId = attempt.sessionId || actor.clientSessionId;

  const docs = changes
    .filter((change) => change && change.previousAnswer !== change.newAnswer)
    .map((change) => ({
      attemptId: attempt._id,
      quizId: attempt.quizId,
      questionId: change.questionId,
      userId,
      clientSessionId,
      previousAnswer: change.previousAnswer || null,
      newAnswer: change.newAnswer || null,
      changedAt: change.changedAt || new Date(),
      stateVersion: change.stateVersion || attempt.syncVersion || 0,
      source,
      metadata: change.metadata || {},
    }));

  if (!docs.length) {
    return [];
  }

  try {
    const inserted = await AnswerHistory.insertMany(docs, { ordered: false });

    await Promise.all(inserted.map((item) => recordEvent({
      req,
      eventType: 'ANSWER_CHANGED',
      category: 'answer',
      source: 'api',
      userId,
      clientSessionId,
      quizId: item.quizId,
      attemptId: item.attemptId,
      questionId: item.questionId,
      metadata: {
        previousAnswer: item.previousAnswer,
        newAnswer: item.newAnswer,
        stateVersion: item.stateVersion,
        changeId: item._id,
      },
    })));

    return inserted;
  } catch (error) {
    logger.debug(`Failed to record answer changes: ${error.message}`);
    return [];
  }
};

export const upsertRecentQuiz = async ({
  req = null,
  quizId,
  attempt = null,
  sessionId = null,
  lastVisitedQuestionId = null,
  progress = null,
}) => {
  const actor = getActor(req);
  const resolvedQuizId = asObjectId(quizId || attempt?.quizId);

  if (!resolvedQuizId || (!actor.userId && !actor.clientSessionId)) {
    return null;
  }

  const filter = actor.userId
    ? { userId: actor.userId, quizId: resolvedQuizId }
    : { clientSessionId: actor.clientSessionId, quizId: resolvedQuizId };

  const answeredCount = Array.isArray(attempt?.answers)
    ? attempt.answers.filter((answer) => Boolean(answer.selectedAnswer)).length
    : Number(progress?.answeredCount || 0);
  const totalQuestions = Number(attempt?.totalQuestions || progress?.totalQuestions || 0);
  const percentage = totalQuestions > 0
    ? Math.round((answeredCount / totalQuestions) * 100)
    : Number(progress?.percentage || 0);

  try {
    const recent = await RecentQuiz.findOneAndUpdate(
      filter,
      {
        $set: {
          userId: actor.userId,
          clientSessionId: actor.userId ? null : actor.clientSessionId,
          quizId: resolvedQuizId,
          attemptId: asObjectId(attempt?._id),
          sessionId: asObjectId(sessionId),
          lastVisitedQuestionId: asObjectId(lastVisitedQuestionId || attempt?.lastActiveQuestionId),
          progress: {
            answeredCount,
            totalQuestions,
            percentage,
            status: attempt?.status || progress?.status || 'opened',
          },
          lastOpenedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await recordEvent({
      req,
      eventType: 'QUIZ_OPENED',
      category: 'quiz',
      quizId: resolvedQuizId,
      attemptId: attempt?._id,
      sessionId,
      metadata: { progress: recent.progress },
    });

    return recent;
  } catch (error) {
    logger.debug(`Failed to upsert recent quiz: ${error.message}`);
    return null;
  }
};

export const recordSearch = async ({
  req = null,
  query,
  context = 'quiz_search',
  filters = {},
  resultCount = 0,
}) => {
  const actor = getActor(req);
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery || (!actor.userId && !actor.clientSessionId)) {
    return null;
  }

  try {
    const search = await SearchHistory.create({
      userId: actor.userId,
      clientSessionId: actor.clientSessionId,
      query: normalizedQuery,
      context,
      filters,
      resultCount,
    });

    await recordEvent({
      req,
      eventType: 'SEARCH_PERFORMED',
      category: 'search',
      metadata: {
        query: normalizedQuery,
        context,
        filters,
        resultCount,
      },
    });

    return search;
  } catch (error) {
    logger.debug(`Failed to record search: ${error.message}`);
    return null;
  }
};

export const recordMappingConfig = async ({
  req = null,
  upload,
  mappedColumns,
  source = 'manual',
  validationErrors = [],
}) => {
  if (!upload?._id || !mappedColumns) {
    return null;
  }

  try {
    const config = await MappingConfig.create({
      uploadId: upload._id,
      userId: asObjectId(upload.userId) || asObjectId(req?.user?._id),
      detectedColumns: upload.parsedData?.headers || [],
      mappedColumns,
      autoMapping: upload.autoMapping || null,
      confidence: upload.autoMapping?.overallConfidence ?? null,
      validationErrors,
      source,
    });

    await recordEvent({
      req,
      eventType: 'MAPPING_CONFIG_SAVED',
      category: 'mapping',
      uploadId: upload._id,
      metadata: {
        mappingConfigId: config._id,
        mappedColumns,
        detectedColumnCount: config.detectedColumns.length,
        source,
      },
    });

    return config;
  } catch (error) {
    logger.debug(`Failed to record mapping config: ${error.message}`);
    return null;
  }
};

export const recordAIInteraction = async ({
  req = null,
  quizId = null,
  questionId = null,
  attemptId = null,
  interactionType = 'explanation',
  prompt,
  response,
  provider = 'stub',
  metadata = {},
}) => {
  const actor = getActor(req);
  const normalizedPrompt = String(prompt || '').trim();

  if (!normalizedPrompt) {
    return null;
  }

  try {
    const interaction = await AIInteraction.create({
      userId: actor.userId,
      clientSessionId: actor.clientSessionId,
      quizId: asObjectId(quizId),
      questionId: asObjectId(questionId),
      attemptId: asObjectId(attemptId),
      interactionType,
      prompt: normalizedPrompt,
      response: String(response || ''),
      provider,
      metadata,
    });

    await recordEvent({
      req,
      eventType: interactionType === 'search' ? 'AI_SEARCH_REQUESTED' : 'AI_EXPLANATION_REQUESTED',
      category: 'ai',
      quizId,
      questionId,
      attemptId,
      metadata: {
        interactionId: interaction._id,
        interactionType,
        provider,
      },
    });

    return interaction;
  } catch (error) {
    logger.debug(`Failed to record AI interaction: ${error.message}`);
    return null;
  }
};
