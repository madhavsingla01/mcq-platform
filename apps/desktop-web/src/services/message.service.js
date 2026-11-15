import api from '../api/axios';

export function chatAttachmentPath(conversationId, messageId, assetId) {
  const objectId = /^[a-f\d]{24}$/i;
  const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
  if (!objectId.test(conversationId || '') || !objectId.test(messageId || '') || !uuid.test(assetId || '')) return null;
  return `/media/chat/${conversationId}/messages/${messageId}/attachments/${assetId}`;
}

export async function uploadReadyAttachment(conversationId, file, kind, signal, onProcessing) {
  const upload = await messageService.uploadAttachment(conversationId, file, kind, signal);
  const expires = Date.now() + 150_000;
  for (;;) {
    const status = await messageService.attachmentStatus(conversationId, upload.id, signal);
    if (status.proof) return { id: upload.id, proof: status.proof };
    if (!['queued', 'processing'].includes(status.status) || Date.now() >= expires) {
      throw new Error('Attachment could not finish processing. Try a different file.');
    }
    onProcessing?.();
    await new Promise(resolve => setTimeout(resolve, 3000));
    signal?.throwIfAborted();
  }
}

export function prepareMessageForward(conversationId, message) {
  const path = chatAttachmentPath(conversationId, message._id, message.media?.assetId);
  const keysByRecipient = new Map();
  let filePromise;
  return async recipientId => {
    const key = keysByRecipient.get(recipientId) || crypto.randomUUID();
    keysByRecipient.set(recipientId, key);
    const payload = { text: message.text, clientMessageId: key };
    if (message.quiz?._id) payload.quizId = message.quiz._id;
    if (message.comment?._id) {
      payload.commentId = message.comment._id;
      payload.quizId = message.comment.quiz?._id || message.comment.quiz;
    }
    if (message.link) payload.link = message.link;
    if (message.media?.assetId && !path) throw new Error('Attachment is unavailable.');

    const { conversation } = await messageService.startConversation({ recipientId });
    if (path) {
      filePromise ??= api.get(path, { responseType: 'blob' }).then(({ data }) =>
        new File([data], message.media.fileName || 'Attachment', { type: data.type })).catch(error => {
        filePromise = undefined;
        throw error;
      });
      const file = await filePromise;
      const { proof } = await uploadReadyAttachment(conversation._id, file, message.type);
      payload.attachmentProof = proof;
    } else if (message.media?.url && ['image', 'audio', 'document'].includes(message.type)) {
      payload.type = message.type;
      payload.media = message.media;
    }
    return messageService.sendMessage(conversation._id, payload);
  };
}

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

  uploadAttachment: async (conversationId, file, kind, signal) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    const { data } = await api.post(`/media/chat/${conversationId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }, signal,
    });
    return data.data;
  },

  attachmentStatus: async (conversationId, assetId, signal) => {
    const { data } = await api.get(`/media/chat/${conversationId}/attachments/${assetId}`, { signal });
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

  clearConversation: async conversationId => {
    const { data } = await api.post(`/messages/conversations/${conversationId}/clear`);
    return data.data;
  },

  removeConversation: async conversationId => {
    const { data } = await api.delete(`/messages/conversations/${conversationId}`);
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
