/**
 * Socket.IO handler for shared quiz sessions.
 * Handles realtime chat messaging and online presence tracking.
 *
 * Authentication: JWT extracted from cookies in handshake.
 * Rate limiting: In-memory per-user message throttle.
 */

import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.model.js';
import QuizSession from '../models/QuizSession.model.js';
import SessionMessage from '../models/SessionMessage.model.js';
import { logger } from '../utils/logger.js';
import {
  recordEvent,
  recordSessionActivity,
} from '../services/activity/activity.service.js';

// ── Online presence tracking (in-memory) ──
// Map<sessionId, Map<userId, { socketId, name, avatar }>>
const onlineUsers = new Map();

// ── Chat rate limiter (in-memory) ──
// Map<userId, { count, resetAt }>
const chatRateLimit = new Map();
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const RATE_LIMIT_MAX = 5; // 5 messages per window

function checkChatRateLimit(userId) {
  const now = Date.now();
  const entry = chatRateLimit.get(userId);

  if (!entry || now > entry.resetAt) {
    chatRateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up rate limit entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of chatRateLimit) {
    if (now > entry.resetAt) {
      chatRateLimit.delete(key);
    }
  }
}, 30_000);

/**
 * Get online users list for a session room.
 */
function getOnlineList(sessionId) {
  const room = onlineUsers.get(sessionId);
  if (!room) return [];
  return Array.from(room.values());
}

/**
 * Sanitize chat message — strip HTML tags, trim whitespace.
 */
function sanitizeMessage(msg) {
  if (typeof msg !== 'string') return '';
  return msg
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 1000);
}

/**
 * Authenticate socket via JWT cookie from handshake headers.
 */
async function authenticateSocket(socket, next) {
  try {
    // Parse cookies from handshake headers
    const cookieHeader = socket.handshake.headers?.cookie || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      })
    );

    const token = cookies.accessToken;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name avatar');

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.userName = user.name;
    socket.userAvatar = user.avatar || '';
    next();
  } catch (error) {
    logger.debug(`Socket auth failed: ${error.message}`);
    next(new Error('Invalid authentication'));
  }
}

/**
 * Main socket setup — call from server.js.
 */
export function setupSessionSocket(io) {
  // Auth middleware for all socket connections
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id} (user: ${socket.userName})`);

    // ── Join session room ──
    socket.on('session:join', async ({ sessionId }) => {
      if (!sessionId) return;

      try {
        // Verify session exists
        const session = await QuizSession.findById(sessionId).lean();
        if (!session) {
          socket.emit('session:error', { message: 'Session not found' });
          return;
        }

        socket.join(sessionId);
        socket.currentSessionId = sessionId;

        // Track online user
        if (!onlineUsers.has(sessionId)) {
          onlineUsers.set(sessionId, new Map());
        }
        const room = onlineUsers.get(sessionId);
        room.set(socket.userId, {
          userId: socket.userId,
          name: socket.userName,
          avatar: socket.userAvatar,
          socketId: socket.id,
        });

        const onlineList = getOnlineList(sessionId);

        // Notify room
        io.to(sessionId).emit('session:user-joined', {
          user: { userId: socket.userId, name: socket.userName, avatar: socket.userAvatar },
          onlineCount: onlineList.length,
          onlineUsers: onlineList,
        });

        await recordSessionActivity({
          eventType: 'PARTICIPANT_JOINED',
          sessionId,
          quizId: session.quizId,
          userId: socket.userId,
          source: 'socket',
          metadata: {
            socketId: socket.id,
            onlineCount: onlineList.length,
          },
        });

        logger.debug(`User ${socket.userName} joined session ${sessionId} (${onlineList.length} online)`);
      } catch (error) {
        logger.error(`session:join error: ${error.message}`);
        socket.emit('session:error', { message: 'Failed to join session' });
      }
    });

    // ── Leave session room ──
    socket.on('session:leave', ({ sessionId }) => {
      if (!sessionId) return;
      handleLeave(socket, sessionId, io);
    });

    // ── Send chat message ──
    socket.on('chat:send', async ({ sessionId, message }) => {
      if (!sessionId || !message) return;

      const sanitized = sanitizeMessage(message);
      if (!sanitized) return;

      // Rate limit check
      if (!checkChatRateLimit(socket.userId)) {
        socket.emit('chat:rate-limited', {
          message: 'Slow down! You\'re sending messages too quickly.',
        });
        return;
      }

      try {
        // Save to DB
        const saved = await SessionMessage.create({
          sessionId,
          senderId: socket.userId,
          message: sanitized,
        });

        await Promise.all([
          recordSessionActivity({
            eventType: 'MESSAGE_SENT',
            sessionId,
            userId: socket.userId,
            source: 'socket',
            metadata: {
              messageId: saved._id,
              length: sanitized.length,
            },
          }),
          recordEvent({
            eventType: 'MESSAGE_SENT',
            category: 'chat',
            source: 'socket',
            userId: socket.userId,
            sessionId,
            messageId: saved._id,
            metadata: {
              length: sanitized.length,
            },
          }),
        ]);

        // Broadcast to room (including sender)
        io.to(sessionId).emit('chat:message', {
          _id: saved._id,
          sessionId,
          senderId: {
            _id: socket.userId,
            name: socket.userName,
            avatar: socket.userAvatar,
          },
          message: sanitized,
          createdAt: saved.createdAt,
        });
      } catch (error) {
        logger.error(`chat:send error: ${error.message}`);
        socket.emit('session:error', { message: 'Failed to send message' });
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id} (user: ${socket.userName})`);
      if (socket.currentSessionId) {
        handleLeave(socket, socket.currentSessionId, io);
      }
    });
  });
}

/**
 * Handle user leaving a session room.
 */
async function handleLeave(socket, sessionId, io) {
  socket.leave(sessionId);

  const room = onlineUsers.get(sessionId);
  if (room) {
    room.delete(socket.userId);
    if (room.size === 0) {
      onlineUsers.delete(sessionId);
    }
  }

  const onlineList = getOnlineList(sessionId);

  io.to(sessionId).emit('session:user-left', {
    userId: socket.userId,
    onlineCount: onlineList.length,
    onlineUsers: onlineList,
  });

  await recordSessionActivity({
    eventType: 'PARTICIPANT_LEFT',
    sessionId,
    userId: socket.userId,
    source: 'socket',
    metadata: {
      socketId: socket.id,
      onlineCount: onlineList.length,
    },
  });

  if (socket.currentSessionId === sessionId) {
    socket.currentSessionId = null;
  }
}
