/**
 * Session controller — shared quiz session management and chat history.
 */

import QuizSession from '../models/QuizSession.model.js';
import SessionMessage from '../models/SessionMessage.model.js';
import JoinedSession from '../models/JoinedSession.model.js';
import Quiz from '../models/Quiz.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateShareCode } from '../utils/generateId.js';
import {
  recordEvent,
  recordSessionActivity,
  upsertRecentQuiz,
} from '../services/activity/activity.service.js';

/**
 * POST /api/v1/sessions/:quizId/share
 * Create or retrieve a shared session for a quiz.
 * Only the quiz creator can share it.
 */
export const shareQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return next(new AppError('Quiz not found.', 404));
    }

    // Only quiz creator can share
    if (!quiz.uploader || quiz.uploader.toString() !== req.user._id.toString()) {
      return next(new AppError('Only the quiz creator can share this quiz.', 403));
    }

    // Upsert — return existing session or create one
    let session = await QuizSession.findOne({ quizId });

    if (!session) {
      const shareCode = quiz.shareCode || generateShareCode();

      session = await QuizSession.create({
        quizId,
        creatorId: req.user._id,
        shareCode,
        participantCount: 1,
        participants: [req.user._id],
        isPublic: true,
      });
    }

    await recordSessionActivity({
      req,
      eventType: 'SHARE_LINK',
      sessionId: session._id,
      quizId: session.quizId,
      metadata: {
        shareCode: session.shareCode,
        shareUrl: `/session/${session.shareCode}`,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        session,
        shareUrl: `/session/${session.shareCode}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sessions/code/:shareCode
 * Get session details by share code — for the join page.
 */
export const getSessionByCode = async (req, res, next) => {
  try {
    const { shareCode } = req.params;

    const session = await QuizSession.findOne({ shareCode })
      .populate('creatorId', 'name avatar')
      .populate('quizId', 'title description questionCount category difficulty settings tags');

    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    await recordSessionActivity({
      req,
      eventType: 'SESSION_REOPENED',
      sessionId: session._id,
      quizId: session.quizId?._id || session.quizId,
      metadata: {
        shareCode,
      },
    });

    // Check if current user has already joined
    const hasJoined = req.user
      ? session.participants.some((p) => p.toString() === req.user._id.toString())
      : false;

    res.status(200).json({
      success: true,
      data: {
        session: {
          _id: session._id,
          shareCode: session.shareCode,
          participantCount: session.participantCount,
          isPublic: session.isPublic,
          createdAt: session.createdAt,
          quiz: session.quizId,
          creator: session.creatorId,
        },
        hasJoined,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/sessions/:sessionId/join
 * Join a session — adds user to participants (idempotent).
 */
export const joinSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await QuizSession.findById(sessionId);
    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    const userId = req.user._id.toString();
    const alreadyJoined = session.participants.some((p) => p.toString() === userId);

    if (!alreadyJoined) {
      session.participants.push(req.user._id);
      session.participantCount = session.participants.length;
      await session.save();
    }

    // Upsert JoinedSession to track for dashboard
    await JoinedSession.findOneAndUpdate(
      { userId: req.user._id, sessionId: session._id },
      {
        $setOnInsert: { quizId: session.quizId, joinedAt: new Date() },
        $set: { lastOpenedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    await Promise.all([
      recordSessionActivity({
        req,
        eventType: alreadyJoined ? 'SESSION_REOPENED' : 'JOIN_SESSION',
        sessionId: session._id,
        quizId: session.quizId,
        metadata: {
          participantCount: session.participantCount,
          alreadyJoined,
        },
      }),
      upsertRecentQuiz({
        req,
        quizId: session.quizId,
        sessionId: session._id,
        progress: { status: 'session_joined' },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        session,
        quizId: session.quizId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sessions/:sessionId/messages
 * Paginated chat history — cursor-based, newest first.
 * Query params: ?before=<messageId>&limit=20
 */
export const getMessages = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { before, limit = 30 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 30, 50);

    const query = { sessionId };

    if (before) {
      const cursorMessage = await SessionMessage.findById(before);
      if (cursorMessage) {
        query.createdAt = { $lt: cursorMessage.createdAt };
      }
    }

    const messages = await SessionMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1)
      .populate('senderId', 'name avatar')
      .lean();

    const hasMore = messages.length > parsedLimit;
    if (hasMore) messages.pop();

    // Reverse for chronological order in the client
    messages.reverse();

    await recordSessionActivity({
      req,
      eventType: 'CHAT_HISTORY_LOADED',
      sessionId,
      metadata: {
        count: messages.length,
        hasMore,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        messages,
        hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sessions/recent
 * Recently shared public quizzes — for homepage discovery.
 */
export const getRecentSessions = async (req, res, next) => {
  try {
    const sessions = await QuizSession.find({ isPublic: true })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('creatorId', 'name avatar')
      .populate('quizId', 'title description questionCount category difficulty tags')
      .lean();

    // Filter out sessions whose quiz has been deleted
    const validSessions = sessions.filter((s) => s.quizId);
    await recordEvent({
      req,
      eventType: 'RECENT_SESSIONS_VIEWED',
      category: 'dashboard',
      metadata: {
        resultCount: validSessions.length,
      },
    });

    res.status(200).json({
      success: true,
      data: { sessions: validSessions },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sessions/joined
 * Get recent sessions joined by the authenticated user.
 */
export const getJoinedSessions = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 10, 50);

    const joined = await JoinedSession.find({ userId: req.user._id })
      .sort({ lastOpenedAt: -1 })
      .limit(parsedLimit)
      .populate({
        path: 'quizId',
        select: 'title questionCount description',
      })
      .populate({
        path: 'sessionId',
        select: 'participantCount shareCode creatorId createdAt',
        populate: {
          path: 'creatorId',
          select: 'name',
        },
      });

    // Format output
    const formatted = joined.map(j => ({
      _id: j._id,
      joinedAt: j.joinedAt,
      lastOpenedAt: j.lastOpenedAt,
      progress: j.progress,
      quiz: j.quizId,
      session: {
        _id: j.sessionId?._id,
        shareCode: j.sessionId?.shareCode,
        participantCount: j.sessionId?.participantCount,
        creatorName: j.sessionId?.creatorId?.name,
        createdAt: j.sessionId?.createdAt,
      }
    })).filter(j => j.quiz && j.session);

    await recordEvent({
      req,
      eventType: 'JOINED_SESSIONS_VIEWED',
      category: 'dashboard',
      metadata: {
        resultCount: formatted.length,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        sessions: formatted,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/sessions/open-link
 * Validate share link, automatically join session, and upsert dashboard persistence.
 */
export const openLink = async (req, res, next) => {
  try {
    const { linkOrCode } = req.body;
    if (!linkOrCode) {
      return next(new AppError('Link or code is required', 400));
    }

    // Extract share code (handles full URLs or just the code)
    const match = linkOrCode.match(/(?:session\/)?([a-zA-Z0-9_-]+)$/);
    const shareCode = match ? match[1] : linkOrCode.trim();

    // 1. Validate session
    const session = await QuizSession.findOne({ shareCode })
      .populate('quizId', 'title description questionCount category difficulty settings tags')
      .populate('creatorId', 'name avatar');

    if (!session) {
      return next(new AppError('Session not found or link has expired', 404));
    }

    // 2. Join session (idempotent)
    const userId = req.user._id.toString();
    const alreadyJoined = session.participants.some((p) => p.toString() === userId);

    if (!alreadyJoined) {
      session.participants.push(req.user._id);
      session.participantCount = session.participants.length;
      await session.save();
    }

    // 3. Upsert JoinedSession (for dashboard persistence)
    await JoinedSession.findOneAndUpdate(
      { userId: req.user._id, sessionId: session._id },
      {
        $setOnInsert: { quizId: session.quizId._id, joinedAt: new Date() },
        $set: { lastOpenedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    await Promise.all([
      recordSessionActivity({
        req,
        eventType: alreadyJoined ? 'SESSION_REOPENED' : 'JOIN_SESSION',
        sessionId: session._id,
        quizId: session.quizId._id,
        metadata: {
          source: 'open_link',
          shareCode: session.shareCode,
          participantCount: session.participantCount,
        },
      }),
      upsertRecentQuiz({
        req,
        quizId: session.quizId._id,
        sessionId: session._id,
        progress: { status: 'session_opened' },
      }),
    ]);

    // 4. Return quiz metadata
    res.status(200).json({
      success: true,
      data: {
        session,
        shareCode: session.shareCode
      },
    });
  } catch (error) {
    next(error);
  }
};
