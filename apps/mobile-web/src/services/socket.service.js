import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => {
  if (socket) return socket;

  socket = io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinConversation = (conversationId) => {
  const s = getSocket();
  if (s && conversationId) {
    s.emit('conversation:join', { conversationId });
  }
};

export const leaveConversation = (conversationId) => {
  const s = getSocket();
  if (s && conversationId) {
    s.emit('conversation:leave', { conversationId });
  }
};

export const sendTypingStart = (conversationId) => {
  const s = getSocket();
  if (s && conversationId) {
    s.emit('typing:start', { conversationId });
  }
};

export const sendTypingStop = (conversationId) => {
  const s = getSocket();
  if (s && conversationId) {
    s.emit('typing:stop', { conversationId });
  }
};

export const emitSendMessage = (payload) => {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s) return reject(new Error('Socket not connected'));
    s.emit('message:send', payload, (res) => {
      if (res?.success) resolve(res.data);
      else reject(new Error(res?.error || 'Failed to send message via socket'));
    });
  });
};

export const emitMarkRead = (conversationId, messageIds = []) => {
  const s = getSocket();
  if (s && conversationId) {
    s.emit('message:read', { conversationId, messageIds });
  }
};

export const emitReaction = (messageId, emoji) => {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s) return reject(new Error('Socket not connected'));
    s.emit('message:reaction', { messageId, emoji }, (res) => {
      if (res?.success) resolve(res.data);
      else reject(new Error(res?.error || 'Reaction failed'));
    });
  });
};

export const emitEditMessage = (messageId, text) => {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s) return reject(new Error('Socket not connected'));
    s.emit('message:edit', { messageId, text }, (res) => {
      if (res?.success) resolve(res.data);
      else reject(new Error(res?.error || 'Edit failed'));
    });
  });
};

export const emitDeleteMessage = (messageId, mode = 'everyone') => {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s) return reject(new Error('Socket not connected'));
    s.emit('message:delete', { messageId, mode }, (res) => {
      if (res?.success) resolve();
      else reject(new Error(res?.error || 'Delete failed'));
    });
  });
};

export const fetchUserPresence = (userIds) => {
  return new Promise((resolve) => {
    const s = getSocket();
    if (!s) return resolve({});
    s.emit('presence:get', { userIds }, (res) => {
      if (res?.success) resolve(res.data || {});
      else resolve({});
    });
  });
};

export default {
  getSocket,
  disconnectSocket,
  joinConversation,
  leaveConversation,
  sendTypingStart,
  sendTypingStop,
  emitSendMessage,
  emitMarkRead,
  emitReaction,
  emitEditMessage,
  emitDeleteMessage,
  fetchUserPresence,
};
