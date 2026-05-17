import AppEvent from '../models/AppEvent.model.js';
import RecentQuiz from '../models/RecentQuiz.model.js';
import SearchHistory from '../models/SearchHistory.model.js';
import { catchAsync } from '../middleware/error.middleware.js';
import {
  getClientSessionId,
  recordEvent,
  recordSearch,
} from '../services/activity/activity.service.js';

export const trackEvent = catchAsync(async (req, res) => {
  const event = await recordEvent({
    req,
    eventType: req.body.eventType,
    category: req.body.category || 'client',
    source: 'client',
    quizId: req.body.quizId,
    attemptId: req.body.attemptId,
    questionId: req.body.questionId,
    sessionId: req.body.sessionId,
    uploadId: req.body.uploadId,
    messageId: req.body.messageId,
    metadata: req.body.metadata || {},
  });

  res.status(202).json({
    success: true,
    data: { eventId: event?._id || null },
  });
});

export const getRecentQuizzes = catchAsync(async (req, res) => {
  const clientSessionId = getClientSessionId(req);
  const filter = req.user?._id
    ? { userId: req.user._id }
    : clientSessionId
      ? { clientSessionId }
      : null;

  if (!filter) {
    return res.json({ success: true, data: { quizzes: [] } });
  }

  const quizzes = await RecentQuiz.find(filter)
    .sort({ lastOpenedAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 20, 50))
    .populate('quizId', 'title description questionCount category difficulty tags settings')
    .populate('attemptId', 'status progress totalQuestions updatedAt')
    .populate('sessionId', 'shareCode participantCount')
    .lean();

  await recordEvent({
    req,
    eventType: 'RECENT_QUIZZES_VIEWED',
    category: 'dashboard',
    metadata: {
      resultCount: quizzes.length,
    },
  });

  res.json({
    success: true,
    data: {
      quizzes: quizzes.filter((item) => item.quizId),
    },
  });
});

export const saveSearch = catchAsync(async (req, res) => {
  const search = await recordSearch({
    req,
    query: req.body.query,
    context: req.body.context || 'client_search',
    filters: req.body.filters || {},
    resultCount: Number(req.body.resultCount || 0),
  });

  res.status(202).json({
    success: true,
    data: { searchId: search?._id || null },
  });
});

export const getActivityFeed = catchAsync(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const filter = {};

  if (req.query.quizId) filter.quizId = req.query.quizId;
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.attemptId) filter.attemptId = req.query.attemptId;

  if (!filter.quizId && !filter.sessionId && !filter.attemptId) {
    if (req.user?._id) {
      filter.userId = req.user._id;
    } else {
      const clientSessionId = getClientSessionId(req);
      if (clientSessionId) filter.clientSessionId = clientSessionId;
    }
  }

  if (!filter.quizId && !filter.sessionId && !filter.attemptId && !filter.userId && !filter.clientSessionId) {
    return res.json({ success: true, data: { events: [] } });
  }

  const events = await AppEvent.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: { events },
  });
});

export const getSearchHistory = catchAsync(async (req, res) => {
  const clientSessionId = getClientSessionId(req);
  const filter = req.user?._id
    ? { userId: req.user._id }
    : clientSessionId
      ? { clientSessionId }
      : null;

  if (!filter) {
    return res.json({ success: true, data: { searches: [] } });
  }

  const searches = await SearchHistory.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 20, 50))
    .lean();

  res.json({
    success: true,
    data: { searches },
  });
});
