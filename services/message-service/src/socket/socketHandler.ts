import { Server, type DefaultEventsMap } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { Types } from 'mongoose';
import { verifySessionToken, isCurrentSession, type SessionClaims } from '../utils/sessionToken.js';
import env from '../config/env.js';
import User from '../models/User.model.js';
import Conversation from '../models/Conversation.model.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import { requireId, toId } from '../services/messagePolicy.js';
import { requireParticipant, sendChatMessage, readChatMessages, editChatMessage, deleteChatMessage, reactToChatMessage } from '../services/messaging.service.js';

type ChatEvent =
  | 'conversation:join' | 'conversation:leave' | 'typing:start' | 'typing:stop'
  | 'message:send' | 'message:read' | 'message:edit' | 'message:delete' | 'message:reaction' | 'presence:get';
type ClientEvents = Record<ChatEvent, (payload: unknown, callback?: unknown) => void>;
type ChatServer = Server<ClientEvents, DefaultEventsMap, DefaultEventsMap, SocketData>;

interface SocketData {
  user: {
    _id: Types.ObjectId;
    name: string;
    username?: string | null | undefined;
    avatar?: string | null | undefined;
    typingIndicatorsEnabled: boolean;
  };
  session: SessionClaims;
}

interface SessionAccount {
  isDeleted?: boolean;
  isSuspended?: boolean;
  isActive?: boolean;
  tokenVersion?: number | null;
  sessions?: readonly { sessionId: string; expiresAt: Date }[];
}

let io: ChatServer | undefined;
const onlineUsers = new Map<string, Set<string>>();
const lastSeen = new Map<string, Date>();

function asSocketUser(user: {
  _id: Types.ObjectId;
  name: string;
  username?: string | null;
  avatar?: string | null;
  preferences?: unknown;
}): SocketData['user'] {
  const preferences = user.preferences;
  return {
    _id: user._id, name: user.name, username: user.username, avatar: user.avatar,
    typingIndicatorsEnabled: !(typeof preferences === 'object' && preferences !== null &&
      'messagingTypingIndicators' in preferences && preferences.messagingTypingIndicators === false),
  };
}

function isPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const userSelect = 'name username avatar isDeleted isSuspended isActive tokenVersion preferences sessions.sessionId sessions.expiresAt';
function sessionIsCurrent<T extends SessionAccount>(user: T | null | undefined, session: SessionClaims): user is T {
  return Boolean(user && !user.isDeleted && !user.isSuspended && user.isActive !== false &&
    isCurrentSession(user, session) && session.exp * 1000 > Date.now());
}

export const initSocketServer = (server: HttpServer): ChatServer => {
  const chat = new Server<ClientEvents, DefaultEventsMap, DefaultEventsMap, SocketData>(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    allowRequest: (request, done) => done(null, !request.headers.origin || env.CLIENT_URL.includes(request.headers.origin)),
    path: '/socket.io', maxHttpBufferSize: 32768, pingTimeout: 60000, pingInterval: 25000,
  });
  io = chat;
  chat.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('accessToken='));
      const auth: unknown = socket.handshake.auth;
      const authToken = isPayload(auth) ? auth.token : undefined;
      const token = authToken || socket.handshake.headers.authorization?.replace(/^Bearer /, '') || (cookie && decodeURIComponent(cookie.slice(12)));
      const decoded = verifySessionToken(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id).select(userSelect).lean();
      if (!sessionIsCurrent(user, decoded)) throw new Error('Revoked session');
      socket.data.user = asSocketUser(user);
      socket.data.session = decoded;
      next();
    } catch { next(new Error('Authentication required. Please sign in again.')); }
  });

  const connected = chat.of('/').sockets;
  let checkingSessions = false;
  const revocationCheck = setInterval(async () => {
    if (checkingSessions || !connected.size) return;
    checkingSessions = true;
    const sockets = [...connected.values()];
    try {
      const ids = [...new Set(sockets.map(socket => toId(socket.data.user._id)))];
      const users = await User.find({ _id: { $in: ids } })
        .select('isDeleted isSuspended isActive tokenVersion sessions.sessionId sessions.expiresAt')
        .lean();
      const current = new Map(users.map(user => [toId(user._id), user]));
      for (const socket of sockets) {
        if (!sessionIsCurrent(current.get(toId(socket.data.user._id)), socket.data.session)) socket.disconnect(true);
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

  chat.on('connection', socket => {
    const userId = toId(socket.data.user._id);
    const userSockets = onlineUsers.get(userId) ?? new Set<string>();
    userSockets.add(socket.id);
    onlineUsers.set(userId, userSockets);
    lastSeen.delete(userId);
    socket.join(`user:${userId}`);
    let windowStart = Date.now();
    let eventCount = 0;
    const expiresIn = Math.max(1, (socket.data.session.exp * 1000) - Date.now());
    const expiry = setTimeout(() => socket.disconnect(true), Math.min(expiresIn, 2147483647));
    expiry.unref();

    const broadcastPresence = async (isOnline: boolean, seen: Date | null = null) => {
      const conversations = await Conversation.find({ participants: socket.data.user._id }).select('participants').lean();
      const peers = new Set(conversations.flatMap(c => c.participants.map(toId)).filter(id => id !== userId));
      for (const peer of peers) chat.to(`user:${peer}`).emit('presence:update', { userId, isOnline, lastSeen: seen });
    };
    broadcastPresence(true).catch((error: unknown) => logger.warn('Presence update failed', error instanceof Error ? error.message : String(error)));

    // Apply limits and re-check revocation before every event, including typing.
    // A socket established before a password reset must not retain write access.
    const register = (event: ChatEvent, handler: (payload: Record<string, unknown>) => Promise<unknown>) =>
      socket.on(event, async (payload: unknown, callback: unknown) => {
        const reply = typeof callback === 'function'
          ? (ack: { success: boolean; data?: unknown; error?: string }) => callback(ack)
          : () => {};
        try {
          if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); eventCount = 0; }
          if (++eventCount > 120) throw new AppError('Too many chat requests. Please wait.', 429);
          if (!isPayload(payload)) throw new AppError('Invalid payload', 400);
          const current = await User.findById(userId).select(userSelect).lean();
          if (!sessionIsCurrent(current, socket.data.session)) {
            reply({ success: false, error: 'Session expired. Please sign in again.' });
            socket.disconnect(true);
            return;
          }
          socket.data.user = asSocketUser(current);
          const data = await handler(payload);
          reply({ success: true, data });
        } catch (error) {
          const clientError = error instanceof AppError && error.statusCode < 500;
          if (!clientError) logger.error(`Socket ${event} failed`, error instanceof Error ? error.name : 'UnknownError');
          reply({ success: false, error: clientError ? error.message : 'Chat request failed. Please try again.' });
        }
      });

    register('conversation:join', async ({ conversationId }) => {
      conversationId = requireId(conversationId, 'conversation ID');
      await requireParticipant(conversationId, socket.data.user._id);
      await socket.join(`conv:${conversationId}`);
    });
    register('conversation:leave', async ({ conversationId }) => {
      conversationId = requireId(conversationId, 'conversation ID');
      await socket.leave(`conv:${conversationId}`);
    });
    for (const [event, isTyping] of [['typing:start', true], ['typing:stop', false]] as const) {
      register(event, async ({ conversationId }) => {
        conversationId = requireId(conversationId, 'conversation ID');
        await requireParticipant(conversationId, socket.data.user._id);
        if (!socket.data.user.typingIndicatorsEnabled && isTyping) return;
        socket.to(`conv:${conversationId}`).emit('typing:update', { conversationId, isTyping,
          user: { _id: userId, name: socket.data.user.name, username: socket.data.user.username, avatar: socket.data.user.avatar } });
      });
    }
    register('message:send', payload => sendChatMessage(payload.conversationId, socket.data.user._id, payload, chat));
    register('message:read', ({ conversationId, messageIds }) => readChatMessages(conversationId, socket.data.user._id, messageIds, chat));
    register('message:edit', ({ messageId, text }) => editChatMessage(messageId, socket.data.user._id, text, chat));
    register('message:delete', async ({ messageId, mode }) => {
      if (mode !== undefined && mode !== 'me' && mode !== 'everyone') {
        throw new AppError('Delete mode must be me or everyone', 400);
      }
      return deleteChatMessage(messageId, socket.data.user._id, mode, chat);
    });
    register('message:reaction', async ({ messageId, emoji }) => (await reactToChatMessage(messageId, socket.data.user._id, emoji, chat)).reactions);
    register('presence:get', async ({ userIds }) => {
      if (!Array.isArray(userIds) || userIds.length > 100) throw new AppError('Provide at most 100 users', 400);
      const requested: unknown[] = userIds;
      const requestedIds = requested.map(id => requireId(id, 'user ID'));
      const conversations = await Conversation.find({ participants: socket.data.user._id }).select('participants').lean();
      const allowed = new Set(conversations.flatMap(c => c.participants.map(toId)));
      return Object.fromEntries(requestedIds.filter(id => allowed.has(id)).map(id => {
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
      if (lastSeen.size > 5000) {
        const oldest = lastSeen.keys().next();
        if (!oldest.done) lastSeen.delete(oldest.value);
      }
      broadcastPresence(false, seen).catch((error: unknown) => logger.warn('Presence update failed', error instanceof Error ? error.message : String(error)));
    });
  });
  return chat;
};
export const getIO = () => io;
