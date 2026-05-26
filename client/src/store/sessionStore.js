/**
 * Session store — shared quiz session state management.
 * Manages session data, chat messages, socket lifecycle, and online presence.
 */

import { create } from 'zustand';
import CryptoJS from 'crypto-js';
import imageCompression from 'browser-image-compression';
import api from '../api/axios';
import { getSocket, disconnectSocket } from '../api/socket';
import { useAuthStore } from './authStore';

const decryptMessage = (encryptedText, secret) => {
  if (!encryptedText) return encryptedText;
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, secret);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || encryptedText;
  } catch (err) {
    return encryptedText;
  }
};

const extractMentions = (text = '') => (
  [...new Set(
    String(text)
      .match(/@[a-z0-9_.]{3,30}/gi)
      ?.map((item) => item.slice(1).toLowerCase()) || []
  )].slice(0, 10)
);

export const useSessionStore = create((set, get) => ({
  // Session state
  session: null,
  isLoading: false,
  error: null,

  // Chat state
  messages: [],
  isLoadingMessages: false,
  hasMoreMessages: true,
  isChatOpen: true,

  // Online presence
  onlineCount: 0,
  onlineUsers: [],
  isParticipantsOpen: false,

  // Socket state
  isConnected: false,
  _socketListenersAttached: false,

  // ── REST Actions ──

  /**
   * Create or get a shared session for a quiz (creator action).
   */
  createSession: async (quizId, settings = undefined) => {
    set({ isLoading: true, error: null });
    try {
      const payload = settings ? { settings } : {};
      const { data } = await api.post(`/sessions/${quizId}/share`, payload);
      set({ session: data.data.session, isLoading: false });
      return data.data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to create session', isLoading: false });
      throw err;
    }
  },

  /**
   * Rotate a creator-owned session share code.
   */
  regenerateShareLink: async (sessionId) => {
    try {
      const { data } = await api.post(`/sessions/${sessionId}/regenerate-link`);
      set({ session: data.data.session });
      return data.data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to generate a new link' });
      throw err;
    }
  },

  /**
   * Fetch session details by shareCode.
   */
  fetchSession: async (shareCode) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get(`/sessions/code/${shareCode}`);
      set({ session: data.data.session, isLoading: false });
      return data.data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Session not found', isLoading: false });
      throw err;
    }
  },

  /**
   * Join a session (add current user to participants).
   */
  joinSession: async (sessionId) => {
    try {
      const { data } = await api.post(`/sessions/${sessionId}/join`);
      set({ session: data.data.session });
      return data.data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to join session' });
      throw err;
    }
  },

  /**
   * Load paginated chat messages.
   */
  loadMessages: async (sessionId, cursor) => {
    if (get().isLoadingMessages) return;
    set({ isLoadingMessages: true });

    try {
      const params = { limit: 30 };
      if (cursor) params.before = cursor;

      const { data } = await api.get(`/sessions/${sessionId}/messages`, { params });
      let newMessages = data.data.messages;

      const session = get().session;
      if (session) {
        const secret = `${session._id}-${session.shareCode}`;
        newMessages = newMessages.map(msg => ({
          ...msg,
          message: decryptMessage(msg.message, secret)
        }));
      }

      set((state) => ({
        messages: cursor ? [...newMessages, ...state.messages] : newMessages,
        hasMoreMessages: data.data.hasMore,
        isLoadingMessages: false,
      }));

      return data.data;
    } catch (err) {
      set({ isLoadingMessages: false });
      throw err;
    }
  },

  /**
   * Fetch recently shared quizzes for homepage.
   */
  fetchRecentSessions: async () => {
    try {
      const { data } = await api.get('/sessions/recent');
      return data.data.sessions;
    } catch {
      return [];
    }
  },

  /**
   * Submit an open link request to automatically join and redirect.
   */
  submitOpenLink: async (linkOrCode) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/sessions/open-link', { linkOrCode });
      set({ session: data.data.session, isLoading: false });
      return data.data; // returns { session, shareCode }
    } catch (err) {
      set({ error: err.response?.data?.message || 'Invalid or expired link', isLoading: false });
      throw err;
    }
  },

  // ── Socket Actions ──

  /**
   * Connect to socket and join session room.
   */
  connectToSession: (sessionId) => {
    const socket = getSocket();
    const state = get();

    // Attach event listeners only once
    if (!state._socketListenersAttached) {
      socket.on('connect', () => {
        set({ isConnected: true });
        // Re-join room on reconnect
        const currentSession = get().session;
        if (currentSession?._id) {
          socket.emit('session:join', { sessionId: currentSession._id });
        }
      });

      socket.on('disconnect', () => {
        set({ isConnected: false });
      });

      socket.on('session:user-joined', ({ onlineCount, onlineUsers }) => {
        set({ onlineCount, onlineUsers });
      });

      socket.on('session:user-left', ({ onlineCount, onlineUsers }) => {
        set({ onlineCount, onlineUsers });
      });

      socket.on('chat:message', (message) => {
        const session = get().session;
        if (session) {
          const secret = `${session._id}-${session.shareCode}`;
          message.message = decryptMessage(message.message, secret);
        }

        set((state) => {
          // Deduplicate: if we already have an optimistic version with a temp ID,
          // replace it with the server-confirmed version.
          const existingIdx = state.messages.findIndex(
            (m) => m._optimistic && message.tempId && m._tempKey === message.tempId
          );
          if (existingIdx !== -1) {
            const updated = [...state.messages];
            updated[existingIdx] = message;
            return { messages: updated };
          }
          // Skip if we already have this exact message ID (reconnect replay)
          if (state.messages.some((m) => m._id === message._id)) {
            return state;
          }
          return { messages: [...state.messages, message] };
        });
      });

      socket.on('chat:rate-limited', ({ message }) => {
        // Remove the optimistic message that was rate-limited
        set((state) => ({
          messages: state.messages.filter((m) => !m._optimistic),
          error: message,
        }));
        setTimeout(() => set({ error: null }), 3000);
      });

      socket.on('chat:mention', ({ from }) => {
        set({ error: `${from?.name || from?.username || 'Someone'} mentioned you in chat` });
        setTimeout(() => set({ error: null }), 5000);
      });

      socket.on('session:error', ({ message }) => {
        set({ error: message });
        setTimeout(() => set({ error: null }), 3000);
      });

      set({ _socketListenersAttached: true });
    }

    // Join the session room
    socket.emit('session:join', { sessionId });
  },

  /**
   * Send a chat message via socket with optimistic UI.
   */
  sendMessage: (message, attachment = null) => {
    const { session } = get();
    const attachmentUrl = attachment?.attachmentUrl || attachment?.imageUrl || null;
    if (!session?._id || (!message.trim() && !attachmentUrl)) return;

    const trimmed = message.trim();

    // Get user from auth store for optimistic message
    const user = useAuthStore.getState().user;

    // Optimistic: show message immediately
    const tempId = `optimistic-${Date.now()}-${Math.random()}`;
    const optimisticMsg = {
      _id: tempId,
      _optimistic: true,
      _tempKey: tempId,
      sessionId: session._id,
      senderId: {
        _id: user?._id,
        name: user?.name || 'You',
        username: user?.username || '',
        avatar: user?.avatar || '',
      },
      message: trimmed,
      mentions: extractMentions(trimmed).map((username) => ({ username })),
      imageUrl: attachment?.imageUrl || null,
      attachmentUrl,
      attachmentName: attachment?.attachmentName || '',
      attachmentType: attachment?.attachmentType || '',
      attachmentSize: attachment?.attachmentSize || 0,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, optimisticMsg],
    }));

    const socket = getSocket();
    let finalMessage = trimmed;
    if (trimmed) {
      const secret = `${session._id}-${session.shareCode}`;
      finalMessage = CryptoJS.AES.encrypt(trimmed, secret).toString();
    }

    socket.emit('chat:send', {
      sessionId: session._id,
      message: finalMessage,
      imageUrl: attachment?.imageUrl || null,
      attachmentUrl,
      attachmentName: attachment?.attachmentName || '',
      attachmentType: attachment?.attachmentType || '',
      attachmentSize: attachment?.attachmentSize || 0,
      mentions: extractMentions(trimmed),
      tempId: tempId, // Pass tempId to backend
    });
  },

  /**
   * Upload chat attachment
   */
  uploadChatAttachment: async (file, sessionId) => {
    let finalFile = file;
    const isImage = file?.type?.startsWith('image/');

    if (isImage) {
      try {
        // Compress the image before uploading
        const options = {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1200,
          useWebWorker: true
        };
        finalFile = await imageCompression(file, options);
      } catch (error) {
        console.error('Image compression failed:', error);
        // Fallback to original file
      }
    }

    const formData = new FormData();
    formData.append('attachment', finalFile);
    formData.append('sessionId', sessionId || get().session?._id || '');
    
    try {
      const { data } = await api.post('/chat/attachment', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data.data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to upload attachment' });
      setTimeout(() => set({ error: null }), 3000);
      throw err;
    }
  },

  uploadChatImage: async (file) => {
    const attachment = await get().uploadChatAttachment(file);
    return attachment.imageUrl || attachment.attachmentUrl;
  },

  /**
   * Toggle chat panel visibility.
   */
  toggleChat: () => {
    set((state) => {
      const isChatOpen = !state.isChatOpen;
      api.post('/activity/events', {
        eventType: 'CHAT_PANEL_TOGGLED',
        category: 'settings',
        sessionId: state.session?._id,
        metadata: { isChatOpen },
      }).catch(() => {});
      return { isChatOpen, isParticipantsOpen: isChatOpen ? false : state.isParticipantsOpen };
    });
  },

  /**
   * Toggle participants panel visibility.
   */
  toggleParticipants: () => {
    set((state) => {
      const isParticipantsOpen = !state.isParticipantsOpen;
      return { isParticipantsOpen, isChatOpen: isParticipantsOpen ? false : state.isChatOpen };
    });
  },

  /**
   * Disconnect from session and clean up.
   */
  disconnectFromSession: () => {
    const { session } = get();
    const socket = getSocket();

    if (session?._id && socket?.connected) {
      socket.emit('session:leave', { sessionId: session._id });
    }

    disconnectSocket();

    set({
      isConnected: false,
      onlineCount: 0,
      onlineUsers: [],
      _socketListenersAttached: false,
    });
  },

  /**
   * Full reset — called when leaving session page.
   */
  reset: () => {
    const state = get();
    if (state.isConnected) {
      state.disconnectFromSession();
    }

    set({
      session: null,
      isLoading: false,
      error: null,
      messages: [],
      isLoadingMessages: false,
      hasMoreMessages: true,
      isChatOpen: true,
      onlineCount: 0,
      onlineUsers: [],
      isConnected: false,
      _socketListenersAttached: false,
    });
  },
}));

// ── Beacon fallback for session leave on tab close ──
// Socket disconnect is unreliable on `beforeunload`, so we fire a beacon
// to the server as a last-resort persistence mechanism.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const session = useSessionStore.getState().session;
    const userId = useAuthStore.getState().user?._id;
    if (session?._id && userId) {
      const url = `${api.defaults.baseURL || '/api/v1'}/sessions/${session._id}/leave`;
      navigator.sendBeacon(
        url,
        new Blob(
          [JSON.stringify({ userId })],
          { type: 'application/json' }
        )
      );
    }
  });
}
