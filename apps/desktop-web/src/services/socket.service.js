import { io } from 'socket.io-client';
import api, { AUTH_SESSION_EXPIRED_EVENT } from '../api/axios';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    const connection = socket;
    connection.on('disconnect', async reason => {
      if (reason !== 'io server disconnect') return;
      try {
        const { data } = await api.get('/auth/bootstrap', { skipAuthRefresh: true });
        if (socket !== connection) return;
        if (data.data?.authenticated) connection.connect();
        else window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
      } catch { /* HTTP messaging can still recover through the normal auth flow. */ }
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

// Volatile notifications must not be buffered and replayed after reconnect.
const notify = (event, payload) => {
  const connection = getSocket();
  if (connection.connected) connection.emit(event, payload);
};

const request = (event, payload) => new Promise((resolve, reject) => {
  const connection = getSocket();
  if (!connection.connected) return reject(new Error('Chat is reconnecting. Please try again.'));
  connection.timeout(10000).emit(event, payload, (error, response) => {
    if (error) return reject(new Error('Chat request timed out. Please try again.'));
    if (!response?.success) return reject(new Error(response?.error || 'Chat request failed.'));
    resolve(response.data);
  });
});

export const joinConversation = (conversationId) => {
  if (conversationId) notify('conversation:join', { conversationId });
};
export const leaveConversation = (conversationId) => {
  if (conversationId) notify('conversation:leave', { conversationId });
};
export const sendTypingStart = (conversationId) => notify('typing:start', { conversationId });
export const sendTypingStop = (conversationId) => notify('typing:stop', { conversationId });
export const emitMarkRead = (conversationId, messageIds = []) => notify('message:read', { conversationId, messageIds });
export const emitSendMessage = (payload) => request('message:send', payload);
export const emitReaction = (messageId, emoji) => request('message:reaction', { messageId, emoji });
export const emitEditMessage = (messageId, text) => request('message:edit', { messageId, text });
export const emitDeleteMessage = (messageId, mode = 'everyone') => request('message:delete', { messageId, mode });
export const fetchUserPresence = (userIds) => request('presence:get', { userIds }).catch(() => ({}));

export default { getSocket, disconnectSocket, joinConversation, leaveConversation,
  sendTypingStart, sendTypingStop, emitMarkRead, emitSendMessage, emitReaction,
  emitEditMessage, emitDeleteMessage, fetchUserPresence };
