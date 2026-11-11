import { Server } from 'socket.io';
import { verifySessionToken, isCurrentSession } from '../utils/sessionToken.js';
import env from '../config/env.js';
import User from '../models/User.model.js';
import Conversation from '../models/Conversation.model.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import { requireId, toId } from '../services/messagePolicy.js';
import { requireParticipant, sendChatMessage, readChatMessages, editChatMessage, deleteChatMessage, reactToChatMessage } from '../services/messaging.service.js';

let io;
const onlineUsers = new Map();
const lastSeen = new Map();
const activeUser = user => user && !user.isDeleted && !user.isSuspended && user.isActive !== false;
const userSelect = 'name username avatar isDeleted isSuspended isActive tokenVersion preferences sessions.sessionId sessions.expiresAt';
const sessionIsCurrent = (user, session) =>
  activeUser(user) && isCurrentSession(user, session) && session.exp * 1000 > Date.now();

export const initSocketServer = server => {
  io = new Server(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    allowRequest: (request, done) => done(null, !request.headers.origin || env.CLIENT_URL.includes(request.headers.origin)),
    path: '/socket.io', maxHttpBufferSize: 32768, pingTimeout: 60000, pingInterval: 25000,
  });
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('accessToken='));
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace(/^Bearer /, '') || (cookie && decodeURIComponent(cookie.slice(12)));
      const decoded = verifySessionToken(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id).select(userSelect).lean();
      if (!sessionIsCurrent(user, decoded)) throw new Error('Revoked session');
      delete user.sessions;
      socket.user = user;
      socket.session = decoded;
      next();
    } catch { next(new Error('Authentication required. Please sign in again.')); }
  });

  const connected = io.of('/').sockets;
  let checkingSessions = false;
  const revocationCheck = setInterval(async () => {
    if (checkingSessions || !connected.size) return;
    checkingSessions = true;
    const sockets = [...connected.values()];
    try {
      const ids = [...new Set(sockets.map(socket => toId(socket.user._id)))];
      const users = await User.find({ _id: { $in: ids } })
        .select('isDeleted isSuspended isActive tokenVersion sessions.sessionId sessions.expiresAt')
        .lean();
      const current = new Map(users.map(user => [toId(user._id), user]));
      for (const socket of sockets) {
        if (!sessionIsCurrent(current.get(toId(socket.user._id)), socket.session)) socket.disconnect(true);
      }
    } catch {
      for (const socket of sockets) socket.disconnect(true);
      logger.warn('Chat session recheck failed');
    } finally {
      checkingSessions = false;
    }
  }, 5000);
  revocationCheck.unref();
  server.once('close', () => clearInterval(revocationCheck));

  io.on('connection', socket => {
    const userId = toId(socket.user._id);
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    lastSeen.delete(userId);
    socket.join(`user:${userId}`);
    let windowStart = Date.now();
    let eventCount = 0;
    const expiresIn = Math.max(1, (socket.session.exp * 1000) - Date.now());
    const expiry = setTimeout(() => socket.disconnect(true), Math.min(expiresIn, 2147483647));
    expiry.unref();

    const broadcastPresence = async (isOnline, seen = null) => {
      const conversations = await Conversation.find({ participants: socket.user._id }).select('participants').lean();
      const peers = new Set(conversations.flatMap(c => c.participants.map(toId)).filter(id => id !== userId));
      for (const peer of peers) io.to(`user:${peer}`).emit('presence:update', { userId, isOnline, lastSeen: seen });
    };
    broadcastPresence(true).catch(error => logger.warn('Presence update failed', error.message));

    // Apply limits and re-check revocation before every event, including typing.
    // A socket established before a password reset must not retain write access.
    const register = (event, handler) => socket.on(event, async (payload, callback) => {
      const reply = typeof callback === 'function' ? callback : () => {};
      try {
        if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); eventCount = 0; }
        if (++eventCount > 120) throw new AppError('Too many chat requests. Please wait.', 429);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppError('Invalid payload', 400);
        const current = await User.findById(userId).select(userSelect).lean();
        if (!sessionIsCurrent(current, socket.session)) {
          reply({ success: false, error: 'Session expired. Please sign in again.' });
          socket.disconnect(true);
          return;
        }
        socket.user = current;
        const data = await handler(payload);
        reply({ success: true, data });
      } catch (error) {
        if (!(error.statusCode < 500)) logger.error(`Socket ${event} failed`, error.name);
        reply({ success: false, error: error.statusCode < 500 ? error.message : 'Chat request failed. Please try again.' });
      }
    });

    register('conversation:join', async ({ conversationId }) => {
      await requireParticipant(conversationId, socket.user._id);
      await socket.join(`conv:${conversationId}`);
    });
    register('conversation:leave', async ({ conversationId }) => {
      requireId(conversationId, 'conversation ID');
      await socket.leave(`conv:${conversationId}`);
    });
    for (const [event, isTyping] of [['typing:start', true], ['typing:stop', false]]) {
      register(event, async ({ conversationId }) => {
        await requireParticipant(conversationId, socket.user._id);
        if (socket.user.preferences?.messagingTypingIndicators === false && isTyping) return;
        socket.to(`conv:${conversationId}`).emit('typing:update', { conversationId, isTyping,
          user: { _id: userId, name: socket.user.name, username: socket.user.username, avatar: socket.user.avatar } });
      });
    }
    register('message:send', payload => sendChatMessage(payload.conversationId, socket.user._id, payload, io));
    register('message:read', ({ conversationId, messageIds }) => readChatMessages(conversationId, socket.user._id, messageIds, io));
    register('message:edit', ({ messageId, text }) => editChatMessage(messageId, socket.user._id, text, io));
    register('message:delete', ({ messageId, mode }) => deleteChatMessage(messageId, socket.user._id, mode, io));
    register('message:reaction', async ({ messageId, emoji }) => (await reactToChatMessage(messageId, socket.user._id, emoji, io)).reactions);
    register('presence:get', async ({ userIds }) => {
      if (!Array.isArray(userIds) || userIds.length > 100) throw new AppError('Provide at most 100 users', 400);
      userIds.forEach(id => requireId(id, 'user ID'));
      const conversations = await Conversation.find({ participants: socket.user._id }).select('participants').lean();
      const allowed = new Set(conversations.flatMap(c => c.participants.map(toId)));
      return Object.fromEntries(userIds.filter(id => allowed.has(id)).map(id => {
        const isOnline = Boolean(onlineUsers.get(id)?.size);
        return [id, { isOnline, lastSeen: isOnline ? null : lastSeen.get(id) || null }];
      }));
    });
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      const sockets = onlineUsers.get(userId);
      sockets?.delete(socket.id);
      if (sockets?.size) return;
      onlineUsers.delete(userId);
      const seen = new Date();
      lastSeen.set(userId, seen);
      if (lastSeen.size > 5000) lastSeen.delete(lastSeen.keys().next().value);
      broadcastPresence(false, seen).catch(error => logger.warn('Presence update failed', error.message));
    });
  });
  return io;
};
export const getIO = () => io;
