/**
 * Session store — shared quiz session state management.
 * Manages session data, chat messages, socket lifecycle, and online presence.
 */

import { create } from 'zustand';
import api from '../api/axios';
import { getSocket, disconnectSocket } from '../api/socket';
import { useAuthStore } from './authStore';

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

  // Socket state
  isConnected: false,
  _socketListenersAttached: false,

  // ── REST Actions ──

  /**
   * Create or get a shared session for a quiz (creator action).
   */
  createSession: async (quizId) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post(`/sessions/${quizId}/share`);
      set({ session: data.data.session, isLoading: false });
      return data.data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to create session', isLoading: false });
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
      const newMessages = data.data.messages;

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
        set((state) => {
          // Deduplicate: if we already have an optimistic version with a temp ID,
          // replace it with the server-confirmed version.
          const existingIdx = state.messages.findIndex(
            (m) => m._optimistic && m._tempKey === `${message.senderId?._id || message.senderId}-${message.message}`
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
  sendMessage: (message) => {
    const { session } = get();
    if (!session?._id || !message.trim()) return;

    const trimmed = message.trim();

    // Get user from auth store for optimistic message
    const user = useAuthStore.getState().user;

    // Optimistic: show message immediately
    const optimisticMsg = {
      _id: `optimistic-${Date.now()}-${Math.random()}`,
      _optimistic: true,
      _tempKey: `${user?._id}-${trimmed}`,
      sessionId: session._id,
      senderId: {
        _id: user?._id,
        name: user?.name || 'You',
        avatar: user?.avatar || '',
      },
      message: trimmed,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, optimisticMsg],
    }));

    const socket = getSocket();
    socket.emit('chat:send', {
      sessionId: session._id,
      message: trimmed,
    });
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
      return { isChatOpen };
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
