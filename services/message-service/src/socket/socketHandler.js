import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.model.js';
import Conversation from '../models/Conversation.model.js';
import Message from '../models/Message.model.js';
import { logger } from '../utils/logger.js';

const allowedOrigins = env.CLIENT_URL;

let io = null;

// Presence State: userId -> Set<socketId>
const onlineUsers = new Map();
// Last Seen: userId -> Date
const lastSeenMap = new Map();

const QUIZ_PREVIEW_SELECT = '_id title description category difficulty questionCount totalAttempts avgScore thumbnail visibility isPublic uploader';
const USER_CARD_SELECT = '_id name username avatar bio isProfilePublic';

const toId = (val) => (val?._id ? String(val._id) : String(val || ''));

/**
 * Initialize Socket.IO with HTTP server
 */
export const initSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    path: '/socket.io',
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT Authentication Middleware for Socket connections
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      
      // Also inspect authorization headers or cookie if not passed in auth payload
      if (!token && socket.handshake.headers?.authorization?.startsWith('Bearer ')) {
        token = socket.handshake.headers.authorization.split(' ')[1];
      } else if (!token && socket.handshake.headers?.cookie) {
        const cookies = socket.handshake.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, val] = cookie.trim().split('=');
          if (name === 'accessToken') {
            token = decodeURIComponent(val);
            break;
          }
        }
      }

      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id)
        .select(`${USER_CARD_SELECT} isDeleted isSuspended isActive tokenVersion`)
        .lean();

      if (!user || user.isDeleted || user.isActive === false || user.isSuspended ||
          (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion)) {
        return next(new Error('Authentication error: User not found or deactivated'));
      }

      socket.user = user;
      next();
    } catch (err) {
      logger.warn(`[Socket.IO Auth Failed] ${err.message}`);
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = toId(socket.user._id);
    logger.info(`[Socket Connected] User ${socket.user.username} (${userId}) on socket ${socket.id}`);

    // Track online user socket
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Join personal user notification room
    socket.join(`user:${userId}`);

    // Broadcast online presence to all
    io.emit('presence:update', {
      userId,
      isOnline: true,
      lastSeen: null,
    });

    // 1. Join Conversation Room
    socket.on('conversation:join', async (payload) => {
      const { conversationId } = payload || {};
      try {
        if (!conversationId) return;
        const conv = await Conversation.findById(conversationId).select('participants').lean();
        if (conv && conv.participants.some((p) => toId(p) === userId)) {
          socket.join(`conv:${conversationId}`);
        }
      } catch (err) {
        logger.error(`Error joining conversation ${conversationId}:`, err.message);
      }
    });

    // 2. Leave Conversation Room
    socket.on('conversation:leave', (payload) => {
      const { conversationId } = payload || {};
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // 3. Typing Indicator
    socket.on('typing:start', async (payload) => {
      const { conversationId } = payload || {};
      if (!/^[0-9a-f]{24}$/i.test(String(conversationId || '')) ||
          !await Conversation.exists({ _id: conversationId, participants: socket.user._id })) return;
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        user: {
          _id: socket.user._id,
          name: socket.user.name,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
        isTyping: true,
      });
    });

    socket.on('typing:stop', async (payload) => {
      const { conversationId } = payload || {};
      if (!/^[0-9a-f]{24}$/i.test(String(conversationId || '')) ||
          !await Conversation.exists({ _id: conversationId, participants: socket.user._id })) return;
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        user: {
          _id: socket.user._id,
          name: socket.user.name,
          username: socket.user.username,
        },
        isTyping: false,
      });
    });

    // 4. Send Message Real-Time
    socket.on('message:send', async (payload, callback) => {
      try {
        const { conversationId, text, type = 'text', media, quizMetadata, replyTo } = payload || {};
        if (!conversationId) {
          if (callback) callback({ success: false, error: 'conversationId required' });
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ success: false, error: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some((p) => toId(p) === userId);
        if (!isParticipant) {
          if (callback) callback({ success: false, error: 'Not authorized for this conversation' });
          return;
        }

        const cleanText = String(text || '').trim();
        const allowedTypes = new Set(['text', 'image', 'audio', 'document', 'quiz_share', 'comment_share', 'challenge_invite', 'link']);
        if (!allowedTypes.has(type)) {
          if (callback) callback({ success: false, error: 'Unsupported message type' });
          return;
        }
        if (cleanText.length > 2000) {
          if (callback) callback({ success: false, error: 'Message text must be 2000 characters or fewer' });
          return;
        }
        if (!cleanText && !media && !quizMetadata && type === 'text') {
          if (callback) callback({ success: false, error: 'Message cannot be empty' });
          return;
        }
        let previewText = cleanText;

        if (type === 'quiz_share' && quizMetadata?.title) {
          if (!previewText) previewText = `Shared quiz: "${quizMetadata.title}"`;
        } else if (type === 'challenge_invite') {
          if (!previewText) previewText = `Invited you to a 1v1 challenge!`;
        } else if (type === 'image') {
          if (!previewText) previewText = '📷 Photo';
        } else if (type === 'audio') {
          if (!previewText) previewText = '🎤 Voice message';
        } else if (type === 'document') {
          if (!previewText) previewText = `📄 ${media?.fileName || 'Document'}`;
        }

        // Determine initial delivery status: if any other participant is currently online, mark delivered
        const otherParticipants = conversation.participants.filter((p) => toId(p) !== userId);
        const hasOnlineRecipient = otherParticipants.some((p) => {
          const userSockets = onlineUsers.get(toId(p));
          return userSockets && userSockets.size > 0;
        });

        const initialStatus = hasOnlineRecipient ? 'delivered' : 'sent';

        const messageData = {
          conversation: conversation._id,
          sender: socket.user._id,
          text: cleanText || previewText,
          type,
          deliveryStatus: initialStatus,
          readBy: [socket.user._id],
        };

        if (media && typeof media === 'object') {
          messageData.media = media;
        }

        if (quizMetadata && typeof quizMetadata === 'object') {
          messageData.quizMetadata = quizMetadata;
          if (quizMetadata.quizId) {
            messageData.quiz = quizMetadata.quizId;
          }
        }

        if (replyTo && replyTo.messageId) {
          messageData.replyTo = {
            messageId: replyTo.messageId,
            senderName: String(replyTo.senderName || '').trim(),
            text: String(replyTo.text || '').trim().slice(0, 300),
          };
        }

        const message = await Message.create(messageData);

        // Update conversation last message & unread count
        if (!Array.isArray(conversation.unreadCounts)) {
          conversation.unreadCounts = [];
        }

        for (const other of otherParticipants) {
          const otherId = toId(other);
          let found = false;
          for (const entry of conversation.unreadCounts) {
            if (toId(entry.user) === otherId) {
              entry.count = (entry.count || 0) + 1;
              found = true;
              break;
            }
          }
          if (!found) {
            conversation.unreadCounts.push({ user: otherId, count: 1 });
          }
        }

        conversation.lastMessage = message._id;
        conversation.lastMessageText = previewText;
        conversation.lastMessageAt = new Date();
        await conversation.save();

        const populated = await Message.findById(message._id)
          .populate('sender', 'name username avatar')
          .populate('quiz', QUIZ_PREVIEW_SELECT)
          .populate('reactions.user', 'name username avatar')
          .lean();

        // 1. Emit to active conversation room
        io.to(`conv:${conversationId}`).emit('message:new', {
          conversationId,
          message: populated,
        });

        // 2. Emit to all participant individual rooms to update conversation list previews & unread badges
        for (const p of conversation.participants) {
          io.to(`user:${toId(p)}`).emit('conversation:updated', {
            conversationId,
            lastMessage: populated,
            lastMessageText: previewText,
            lastMessageAt: conversation.lastMessageAt,
            unreadCounts: conversation.unreadCounts,
          });
        }

        if (callback) callback({ success: true, data: populated });
      } catch (err) {
        logger.error('[Socket message:send Error]', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 5. Mark Messages as Read
    socket.on('message:read', async (payload, callback) => {
      const { conversationId, messageIds } = payload || {};
      try {
        if (!conversationId) return;

        const conversation = await Conversation.findOne({ _id: conversationId, participants: socket.user._id });
        if (!conversation) {
          if (callback) callback({ success: false, error: 'Not authorized for this conversation' });
          return;
        }

        const updateFilter = {
          conversation: conversationId,
          sender: { $ne: socket.user._id },
          readBy: { $ne: socket.user._id },
        };
        if (Array.isArray(messageIds) && messageIds.length > 0) {
          if (messageIds.length > 500) {
            if (callback) callback({ success: false, error: 'Too many message IDs' });
            return;
          }
          updateFilter._id = { $in: messageIds };
        }

        await Message.updateMany(updateFilter, {
          $addToSet: { readBy: socket.user._id },
          $set: { deliveryStatus: 'read' },
        });

        // Reset conversation unread counter for this user
        if (Array.isArray(conversation.unreadCounts)) {
          const entry = conversation.unreadCounts.find((u) => toId(u.user) === userId);
          if (entry) {
            entry.count = 0;
            await conversation.save();
          }
        }

        // Broadcast to conversation that messages were read
        io.to(`conv:${conversationId}`).emit('message:read_status', {
          conversationId,
          readerId: userId,
          readAt: new Date(),
        });

        // Also update unread count on user personal room
        io.to(`user:${userId}`).emit('conversation:unread_cleared', {
          conversationId,
        });

        if (callback) callback({ success: true });
      } catch (err) {
        logger.error('[Socket message:read Error]', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 6. Toggle Reaction
    socket.on('message:reaction', async (payload, callback) => {
      const { messageId, emoji } = payload || {};
      try {
        if (!messageId || !emoji) return;
        if (typeof emoji !== 'string' || emoji.length > 32) {
          if (callback) callback({ success: false, error: 'Invalid reaction' });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          if (callback) callback({ success: false, error: 'Message not found' });
          return;
        }

        if (!await Conversation.exists({ _id: message.conversation, participants: socket.user._id })) {
          if (callback) callback({ success: false, error: 'Not authorized for this conversation' });
          return;
        }

        if (!Array.isArray(message.reactions)) {
          message.reactions = [];
        }

        const existingIdx = message.reactions.findIndex(
          (r) => toId(r.user) === userId && r.emoji === emoji
        );

        if (existingIdx > -1) {
          message.reactions.splice(existingIdx, 1);
        } else {
          message.reactions.push({
            user: socket.user._id,
            emoji,
          });
        }

        await message.save();

        const updated = await Message.findById(messageId)
          .populate('reactions.user', 'name username avatar')
          .select('reactions conversation')
          .lean();

        io.to(`conv:${toId(message.conversation)}`).emit('message:reaction_update', {
          messageId,
          conversationId: toId(message.conversation),
          reactions: updated.reactions,
        });

        if (callback) callback({ success: true, data: updated.reactions });
      } catch (err) {
        logger.error('[Socket message:reaction Error]', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 7. Edit Message
    socket.on('message:edit', async (payload, callback) => {
      const { messageId, text } = payload || {};
      try {
        const cleanText = String(text || '').trim();
        if (!messageId || !cleanText || cleanText.length > 2000) return;

        const message = await Message.findById(messageId);
        if (!message || message.isDeleted || toId(message.sender) !== userId) {
          if (callback) callback({ success: false, error: 'Not permitted' });
          return;
        }

        message.text = cleanText;
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        const convId = toId(message.conversation);
        io.to(`conv:${convId}`).emit('message:edited', {
          messageId,
          conversationId: convId,
          text: cleanText,
          isEdited: true,
          editedAt: message.editedAt,
        });

        if (callback) callback({ success: true, data: message });
      } catch (err) {
        logger.error('[Socket message:edit Error]', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 8. Delete Message
    socket.on('message:delete', async (payload, callback) => {
      const { messageId, mode = 'everyone' } = payload || {};
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const convId = toId(message.conversation);
        if (!await Conversation.exists({ _id: message.conversation, participants: socket.user._id })) {
          if (callback) callback({ success: false, error: 'Not authorized for this conversation' });
          return;
        }

        if (mode === 'everyone') {
          if (toId(message.sender) !== userId) {
            if (callback) callback({ success: false, error: 'Only sender can delete for everyone' });
            return;
          }
          message.isDeleted = true;
          message.deletedAt = new Date();
          message.text = 'This message was deleted';
          await message.save();

          io.to(`conv:${convId}`).emit('message:deleted', {
            messageId,
            conversationId: convId,
            mode: 'everyone',
          });
        } else {
          if (!message.deletedFor.includes(socket.user._id)) {
            message.deletedFor.push(socket.user._id);
            await message.save();
          }
          socket.emit('message:deleted', {
            messageId,
            conversationId: convId,
            mode: 'me',
          });
        }

        if (callback) callback({ success: true });
      } catch (err) {
        logger.error('[Socket message:delete Error]', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 9. Get User Presence Status
    socket.on('presence:get', (payload, callback) => {
      const { userIds } = payload || {};
      const results = {};
      if (Array.isArray(userIds)) {
        for (const uId of userIds) {
          const sockets = onlineUsers.get(uId);
          const isOnline = !!(sockets && sockets.size > 0);
          results[uId] = {
            isOnline,
            lastSeen: isOnline ? null : lastSeenMap.get(uId) || null,
          };
        }
      }
      if (callback) callback({ success: true, data: results });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      logger.info(`[Socket Disconnected] User ${socket.user.username} (${userId}) on socket ${socket.id}`);
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          const now = new Date();
          lastSeenMap.set(userId, now);

          // Broadcast offline status
          io.emit('presence:update', {
            userId,
            isOnline: false,
            lastSeen: now,
          });
        }
      }
    });
  });

  return io;
};

/**
 * Access IO instance from REST controllers
 */
export const getIO = () => io;
