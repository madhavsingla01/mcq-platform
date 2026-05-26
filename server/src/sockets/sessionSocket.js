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
import { getSessionAccess, isSessionCreator } from '../utils/sessionSettings.js';
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
    .slice(0, 4096);
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
    const user = await User.findById(decoded.id).select('name avatar username email');

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.userName = user.name;
    socket.userUsername = user.username || '';
    socket.userAvatar = user.avatar || '';
    socket.user = user;
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

        const access = getSessionAccess(session, socket.user);
        if (!access.allowed) {
          socket.emit('session:error', { message: access.message });
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
          username: socket.userUsername,
          avatar: socket.userAvatar,
          socketId: socket.id,
        });

        const onlineList = getOnlineList(sessionId);

        // Notify room
        io.to(sessionId).emit('session:user-joined', {
          user: { userId: socket.userId, name: socket.userName, username: socket.userUsername, avatar: socket.userAvatar },
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
    socket.on('chat:send', async ({
      sessionId,
      message,
      imageUrl,
      attachmentUrl,
      attachmentName,
      attachmentType,
      attachmentSize,
      mentions,
      tempId,
    }) => {
      if (!sessionId || (!message && !imageUrl && !attachmentUrl)) return;

      const sanitized = sanitizeMessage(message || '');
      const finalAttachmentUrl = attachmentUrl || imageUrl || null;
      const finalAttachmentType = String(attachmentType || (imageUrl ? 'image' : '')).slice(0, 120);
      const hasAttachment = Boolean(finalAttachmentUrl);
      const isImageAttachment = Boolean(imageUrl) || finalAttachmentType.startsWith('image/');

      if (!sanitized && !hasAttachment) return;

      // Rate limit check
      if (!checkChatRateLimit(socket.userId)) {
        socket.emit('chat:rate-limited', {
          message: 'Slow down! You\'re sending messages too quickly.',
        });
        return;
      }

      try {
        const session = await QuizSession.findById(sessionId);
        const access = getSessionAccess(session, socket.user);
        if (!access.allowed) {
          socket.emit('session:error', { message: access.message });
          return;
        }

        if (session.settings?.chatSettings === 'disabled') {
          socket.emit('session:error', { message: 'Chat is disabled for this session.' });
          return;
        }

        if (session.settings?.chatSettings === 'read_only' && !isSessionCreator(session, socket.user)) {
          socket.emit('session:error', { message: 'Chat is read-only for participants.' });
          return;
        }

        if (session.settings?.chatFileSharing === 'text_only' && hasAttachment) {
          socket.emit('session:error', { message: 'File sharing is disabled for this session.' });
          return;
        }

        if (session.settings?.chatFileSharing === 'images_only' && hasAttachment && !isImageAttachment) {
          socket.emit('session:error', { message: 'Only images can be shared in this session.' });
          return;
        }

        const mentionUsernames = Array.isArray(mentions)
          ? [...new Set(
              mentions
                .map((item) => String(item || '').replace(/^@/, '').toLowerCase().trim())
                .filter((item) => /^[a-z0-9_.]{3,30}$/.test(item))
            )].slice(0, 10)
          : [];
        const mentionedUsers = mentionUsernames.length
          ? await User.find({ username: { $in: mentionUsernames } }).select('_id name username avatar').lean()
          : [];
        const mentionedUserIds = mentionedUsers.map((user) => user._id);

        // Save to DB
        const saved = await SessionMessage.create({
          sessionId,
          senderId: socket.userId,
          message: sanitized,
          imageUrl: isImageAttachment ? finalAttachmentUrl : null,
          attachmentUrl: finalAttachmentUrl,
          attachmentName: String(attachmentName || '').slice(0, 255),
          attachmentType: finalAttachmentType,
          attachmentSize: Number(attachmentSize || 0),
          mentions: mentionedUserIds,
        });

        session.lastActivityAt = new Date();
        await session.save();

        await Promise.all([
          recordSessionActivity({
            eventType: 'MESSAGE_SENT',
            sessionId,
            userId: socket.userId,
            source: 'socket',
            metadata: {
              messageId: saved._id,
              length: sanitized.length,
              hasImage: isImageAttachment,
              hasAttachment,
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
              hasImage: isImageAttachment,
              hasAttachment,
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
            username: socket.userUsername,
            avatar: socket.userAvatar,
          },
          message: sanitized,
          imageUrl: saved.imageUrl,
          attachmentUrl: saved.attachmentUrl,
          attachmentName: saved.attachmentName,
          attachmentType: saved.attachmentType,
          attachmentSize: saved.attachmentSize,
          mentions: mentionedUsers,
          createdAt: saved.createdAt,
          tempId: tempId, // Pass back tempId to original sender for deduplication
        });

        const room = onlineUsers.get(sessionId);
        if (room && mentionedUsers.length) {
          for (const mentionedUser of mentionedUsers) {
            const online = room.get(mentionedUser._id.toString());
            if (online && online.userId !== socket.userId) {
              io.to(online.socketId).emit('chat:mention', {
                sessionId,
                messageId: saved._id,
                from: {
                  _id: socket.userId,
                  name: socket.userName,
                  username: socket.userUsername,
                  avatar: socket.userAvatar,
                },
              });
            }
          }
        }
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
