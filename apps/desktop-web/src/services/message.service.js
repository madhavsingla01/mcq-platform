import api from '../api/axios';

export const messageService = {
  getConversations: async (params = {}) => {
    const { data } = await api.get('/messages/conversations', { params });
    return data.data;
  },

  getMessages: async (conversationId, params = {}, signal) => {
    const { data } = await api.get(`/messages/conversations/${conversationId}`, { params, signal });
    return data.data;
  },

  sendMessage: async (conversationId, payload) => {
    const { data } = await api.post(`/messages/conversations/${conversationId}/messages`, payload);
    return data.data;
  },

  startConversation: async (payload) => {
    const { data } = await api.post('/messages/start', payload);
    return data.data;
  },

  markConversationRead: async (conversationId, messageIds = []) => {
    const { data } = await api.patch(`/messages/conversations/${conversationId}/read`, { messageIds });
    return data.data;
  },

  getUnreadCount: async () => {
    const { data } = await api.get('/messages/unread-count');
    return data.data?.unreadCount || 0;
  },

  searchUsers: async (q = '') => {
    const { data } = await api.get('/messages/search-users', { params: { q } });
    return data.data?.users || [];
  },

  editMessage: async (messageId, text) => {
    const { data } = await api.patch(`/messages/${messageId}`, { text });
    return data.data;
  },

  deleteMessage: async (messageId, mode = 'everyone') => {
    const { data } = await api.delete(`/messages/${messageId}`, { params: { mode } });
    return data.data;
  },

  toggleReaction: async (messageId, emoji) => {
    const { data } = await api.post(`/messages/${messageId}/reactions`, { emoji });
    return data.data;
  },
};

export default messageService;
