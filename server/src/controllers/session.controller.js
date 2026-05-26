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
  getSessionAccess,
  getSessionExpirationLabel,
  isSessionExpired,
  normalizeSessionSettings,
  publicSessionSettings,
} from '../utils/sessionSettings.js';
import {
  recordEvent,
  recordSessionActivity,
  upsertRecentQuiz,
} from '../services/activity/activity.service.js';

const buildShareUrl = (shareCode) => `/session/${shareCode}`;

const ensureUniqueShareCode = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shareCode = generateShareCode();
    const exists = await QuizSession.exists({ shareCode });
    if (!exists) {
      return shareCode;
    }
  }

  throw new AppError('Could not generate a unique share link. Please try again.', 500);
};

const deactivateIfExpired = async (session) => {
  if (session?.isActive !== false && isSessionExpired(session)) {
    session.isActive = false;
    await session.save();
  }
};

const assertSessionAccess = async (session, user) => {
  await deactivateIfExpired(session);
  const access = getSessionAccess(session, user);

  if (!access.allowed) {
    throw new AppError(access.message, access.status);
  }
};

const setSessionActivity = async (session) => {
  if (!session) return;
  session.lastActivityAt = new Date();
  await session.save();
};

const presentSession = (session, { includePrivateSettings = false } = {}) => {
  const raw = session.toObject ? session.toObject() : session;

  return {
    _id: raw._id,
    shareCode: raw.shareCode,
    participantCount: raw.participantCount,
    isPublic: raw.isPublic,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastActivityAt: raw.lastActivityAt,
    expiresAt: getSessionExpirationLabel(raw),
    settings: includePrivateSettings
      ? normalizeSessionSettings({}, raw.settings)
      : publicSessionSettings(raw.settings),
    quiz: raw.quizId,
    quizId: raw.quizId?._id || raw.quizId,
    creator: raw.creatorId,
    creatorId: raw.creatorId?._id || raw.creatorId,
  };
};

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

    const { settings } = req.body;
    const normalizedSettings = settings
      ? normalizeSessionSettings(settings)
      : undefined;

    // Upsert — return existing session or create one
    let session = await QuizSession.findOne({ quizId });

    if (!session) {
      const shareCode = quiz.shareCode || await ensureUniqueShareCode();

      session = await QuizSession.create({
        quizId,
        creatorId: req.user._id,
        shareCode,
        participantCount: 1,
        participants: [req.user._id],
        isPublic: (normalizedSettings?.linkType || 'anyone') === 'anyone',
        lastActivityAt: new Date(),
        settings: normalizedSettings || undefined
      });
    } else {
      // Update existing session settings and ensure it is active
      if (normalizedSettings) {
        session.settings = normalizeSessionSettings(settings, session.settings);
        session.isPublic = session.settings.linkType === 'anyone';
      }
      session.isActive = true;
      session.lastActivityAt = new Date();
      await session.save();
    }

    await recordSessionActivity({
      req,
      eventType: 'SHARE_LINK',
      sessionId: session._id,
      quizId: session.quizId,
      metadata: {
        shareCode: session.shareCode,
        shareUrl: buildShareUrl(session.shareCode),
      },
    });

    const populatedSession = await QuizSession.findById(session._id)
      .populate('creatorId', 'name avatar username')
      .populate('quizId', 'title description questionCount category difficulty settings tags');

    res.status(200).json({
      success: true,
      data: {
        session: presentSession(populatedSession || session, { includePrivateSettings: true }),
        shareUrl: buildShareUrl(session.shareCode),
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
      .populate('creatorId', 'name avatar username')
      .populate('quizId', 'title description questionCount category difficulty settings tags');

    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    await assertSessionAccess(session, req.user);

    await recordSessionActivity({
      req,
      eventType: 'SESSION_REOPENED',
      sessionId: session._id,
      quizId: session.quizId?._id || session.quizId,
      metadata: {
        shareCode,
      },
    });

    await setSessionActivity(session);

    const isCreator = req.user && session.creatorId && 
      (session.creatorId._id.toString() === req.user._id.toString());

    // Check if current user has already joined
    const hasJoined = req.user
      ? session.participants.some((p) => p.toString() === req.user._id.toString())
      : false;

    res.status(200).json({
      success: true,
      data: {
        session: presentSession(session, { includePrivateSettings: isCreator }),
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

    const session = await QuizSession.findById(sessionId)
      .populate('creatorId', 'name avatar username')
      .populate('quizId', 'title description questionCount category difficulty settings tags');

    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    await assertSessionAccess(session, req.user);

    const isCreator = req.user && session.creatorId && 
      ((session.creatorId._id || session.creatorId).toString() === req.user._id.toString());

    let alreadyJoined = false;

    if (req.user) {
      const userId = req.user._id.toString();
      alreadyJoined = session.participants.some((p) => p.toString() === userId);

      if (!alreadyJoined) {
        session.participants.push(req.user._id);
        session.participantCount = session.participants.length;
      }
    }

    session.lastActivityAt = new Date();
    await session.save();

    if (req.user) {
      // Upsert JoinedSession to track for dashboard
      await JoinedSession.findOneAndUpdate(
        { userId: req.user._id, sessionId: session._id },
        {
          $setOnInsert: { quizId: session.quizId?._id || session.quizId, joinedAt: new Date() },
          $set: { lastOpenedAt: new Date() },
        },
        { upsert: true, new: true }
      );
    }

    await Promise.all([
      recordSessionActivity({
        req,
        eventType: alreadyJoined ? 'SESSION_REOPENED' : 'JOIN_SESSION',
        sessionId: session._id,
        quizId: session.quizId?._id || session.quizId,
        metadata: {
          participantCount: session.participantCount,
          alreadyJoined,
          guest: !req.user,
        },
      }),
      req.user
        ? upsertRecentQuiz({
            req,
            quizId: session.quizId?._id || session.quizId,
            sessionId: session._id,
            progress: { status: 'session_joined' },
          })
        : Promise.resolve(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        session: presentSession(session, { includePrivateSettings: isCreator }),
        quizId: session.quizId?._id || session.quizId,
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

    const session = await QuizSession.findById(sessionId);
    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    await assertSessionAccess(session, req.user);

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
      .populate('senderId', 'name avatar username')
      .populate('mentions', 'name username avatar')
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
    const sessions = await QuizSession.find({ isPublic: true, isActive: true })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('creatorId', 'name avatar')
      .populate('quizId', 'title description questionCount category difficulty tags')
      .lean();

    // Filter out sessions whose quiz has been deleted
    const validSessions = sessions.filter((s) => s.quizId && !isSessionExpired(s));
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

    const rawLink = String(linkOrCode).trim();
    let shareCode = rawLink;

    try {
      const parsedUrl = new URL(rawLink);
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      const sessionSegmentIndex = segments.indexOf('session');
      shareCode = sessionSegmentIndex >= 0 && segments[sessionSegmentIndex + 1]
        ? segments[sessionSegmentIndex + 1]
        : segments[segments.length - 1];
    } catch {
      const sessionMatch = rawLink.match(/session\/([^/?#]+)/i);
      shareCode = sessionMatch ? sessionMatch[1] : rawLink.replace(/^\/+|\/+$/g, '');
    }

    // 1. Validate session
    const session = await QuizSession.findOne({ shareCode })
      .populate('quizId', 'title description questionCount category difficulty settings tags')
      .populate('creatorId', 'name avatar username');

    if (!session) {
      return next(new AppError('Session not found or link has expired', 404));
    }

    await assertSessionAccess(session, req.user);

    // 2. Join session (idempotent)
    let alreadyJoined = false;

    if (req.user) {
      const userId = req.user._id.toString();
      alreadyJoined = session.participants.some((p) => p.toString() === userId);

      if (!alreadyJoined) {
        session.participants.push(req.user._id);
        session.participantCount = session.participants.length;
      }
    }

    session.lastActivityAt = new Date();
    await session.save();

    // 3. Upsert JoinedSession (for dashboard persistence)
    if (req.user) {
      await JoinedSession.findOneAndUpdate(
        { userId: req.user._id, sessionId: session._id },
        {
          $setOnInsert: { quizId: session.quizId._id, joinedAt: new Date() },
          $set: { lastOpenedAt: new Date() },
        },
        { upsert: true, new: true }
      );
    }

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
          guest: !req.user,
        },
      }),
      req.user
        ? upsertRecentQuiz({
            req,
            quizId: session.quizId._id,
            sessionId: session._id,
            progress: { status: 'session_opened' },
          })
        : Promise.resolve(),
    ]);

    // 4. Return quiz metadata
    res.status(200).json({
      success: true,
      data: {
        session: presentSession(session, {
          includePrivateSettings: req.user && session.creatorId?._id?.toString() === req.user._id.toString(),
        }),
        shareCode: session.shareCode
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/sessions/:sessionId/leave
 * Lightweight beacon-friendly endpoint for session leave persistence.
 * Fired by sendBeacon on tab close as a fallback when socket disconnect is unreliable.
 */
export const leaveSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id || req.body?.userId;

    if (!userId || !sessionId) {
      return res.status(204).end();
    }

    // Record activity — fire-and-forget semantics; beacon expects no response body
    await recordSessionActivity({
      req,
      eventType: 'PARTICIPANT_LEFT',
      sessionId,
      userId,
      source: 'api',
      metadata: { trigger: 'beacon_fallback' },
    });

    res.status(204).end();
  } catch (error) {
    // Beacons don't process responses, so just end quietly
    res.status(204).end();
  }
};

/**
 * GET /api/v1/sessions/:sessionId/leaderboard
 * Return ranked list of completed attempts for a shared session.
 */
export const getLeaderboard = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const Attempt = (await import('../models/Attempt.model.js')).default;

    const session = await QuizSession.findById(sessionId);
    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    await assertSessionAccess(session, req.user);

    const attempts = await Attempt.find({
      sharedSessionId: sessionId,
      completed: true,
    })
      .sort({ score: -1, totalTimeMs: 1 })
      .populate('userId', 'name avatar')
      .select('userId score totalQuestions percentage totalTimeMs completedAt correctCount wrongCount')
      .lean();

    const ranked = attempts.map((a, idx) => ({
      rank: idx + 1,
      user: a.userId,
      score: a.score,
      totalQuestions: a.totalQuestions,
      percentage: a.percentage,
      correctCount: a.correctCount,
      wrongCount: a.wrongCount,
      totalTimeMs: a.totalTimeMs,
      completedAt: a.completedAt,
    }));

    res.json({ success: true, data: { leaderboard: ranked } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/sessions/:sessionId/regenerate-link
 * Rotate the share code for an active session. Only the creator can do this.
 */
export const regenerateShareLink = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await QuizSession.findById(sessionId);
    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    if (session.creatorId.toString() !== req.user._id.toString()) {
      return next(new AppError('Only the session creator can generate a new link.', 403));
    }

    session.shareCode = await ensureUniqueShareCode();
    session.isActive = true;
    session.lastActivityAt = new Date();
    await session.save();

    const populatedSession = await QuizSession.findById(session._id)
      .populate('creatorId', 'name avatar username')
      .populate('quizId', 'title description questionCount category difficulty settings tags');

    await recordSessionActivity({
      req,
      eventType: 'SHARE_LINK_REGENERATED',
      sessionId: session._id,
      quizId: session.quizId,
      metadata: {
        shareCode: session.shareCode,
        shareUrl: buildShareUrl(session.shareCode),
      },
    });

    res.status(200).json({
      success: true,
      data: {
        session: presentSession(populatedSession || session, { includePrivateSettings: true }),
        shareUrl: buildShareUrl(session.shareCode),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/sessions/:sessionId/destroy
 * Deactivate a session's share link. Only the creator can do this.
 * Preserves all attempts, messages, and analytics.
 */
export const destroySession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await QuizSession.findById(sessionId);
    if (!session) {
      return next(new AppError('Session not found.', 404));
    }

    if (session.creatorId.toString() !== req.user._id.toString()) {
      return next(new AppError('Only the session creator can destroy the link.', 403));
    }

    session.isActive = false;
    await session.save();

    await recordSessionActivity({
      req,
      eventType: 'SESSION_DESTROYED',
      sessionId: session._id,
      quizId: session.quizId,
      metadata: { destroyedBy: req.user._id },
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
