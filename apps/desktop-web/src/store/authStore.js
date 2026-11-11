import { create } from 'zustand';
import { toast } from 'sonner';
import api, { AUTH_SESSION_EXPIRED_EVENT } from '../api/axios';
import { hydrateServerPreferences, setServerSessionAuthenticated, queueProfileUpdate } from './settingsStore';
import { disconnectSocket } from '../services/socket.service';

const SESSION_HINT_KEY = 'mcq.auth.has-session.v2';

let checkAuthPromise = null;
let sessionRevision = 0;

const setSessionHint = () => {
  try { window.localStorage.setItem(SESSION_HINT_KEY, 'true'); } catch { /* Storage is optional. */ }
};

const clearSessionHint = () => {
  try { window.localStorage.removeItem(SESSION_HINT_KEY); } catch { /* Storage is optional. */ }
};

const unauthenticatedState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  sessionNotice: '',
};

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  sessionNotice: '',

  checkAuth: async () => {
    if (checkAuthPromise) {
      return checkAuthPromise;
    }

    checkAuthPromise = (async () => {
      const revision = sessionRevision;
      setServerSessionAuthenticated(false);
      set({ isLoading: true });

      try {
        const { data } = await api.get('/auth/bootstrap', { skipAuthRefresh: true });
        if (revision !== sessionRevision) return null;
        const user = data.data?.authenticated ? data.data.user : null;

        if (!user) {
          clearSessionHint();
          setServerSessionAuthenticated(false);
          set(unauthenticatedState);
          return null;
        }

        setSessionHint();
        if (get().user?._id !== user._id) disconnectSocket();
        setServerSessionAuthenticated(true, user._id);
        set({ user, isAuthenticated: true, isLoading: false, sessionNotice: '' });
        hydrateServerPreferences(user?.preferences);
        return data;
      } catch {
        if (revision !== sessionRevision) return null;
        const current = get().user;
        setServerSessionAuthenticated(Boolean(current), current?._id);
        set({ isLoading: false, sessionNotice: 'Could not check your session. Try again when you are connected.' });
        return null;
      } finally {
        checkAuthPromise = null;
      }
    })();

    return checkAuthPromise;
  },

  login: async (email, password, location) => {
    const headers = location ? {
      'x-client-location-latitude': String(location.latitude),
      'x-client-location-longitude': String(location.longitude),
      'x-client-location-accuracy': String(location.accuracy),
    } : undefined;
    const { data } = await api.post('/auth/login', { email, password }, { skipAuthRefresh: true, headers });
    sessionRevision += 1;
    setSessionHint();
    disconnectSocket();
    setServerSessionAuthenticated(true, data.data.user._id);
    set({ user: data.data.user, isAuthenticated: true, isLoading: false, sessionNotice: '' });
    hydrateServerPreferences(data.data.user?.preferences);
    return data;
  },

  register: async (name, email, password, location) => {
    const headers = location ? {
      'x-client-location-latitude': String(location.latitude),
      'x-client-location-longitude': String(location.longitude),
      'x-client-location-accuracy': String(location.accuracy),
    } : undefined;
    const { data } = await api.post('/auth/register', { name, email, password }, { skipAuthRefresh: true, headers });
    sessionRevision += 1;
    setSessionHint();
    disconnectSocket();
    setServerSessionAuthenticated(true, data.data.user._id);
    set({ user: data.data.user, isAuthenticated: true, isLoading: false, sessionNotice: '' });
    hydrateServerPreferences(data.data.user?.preferences);
    return data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', {}, { skipAuthRefresh: true });
    } catch {
      toast.error('Could not confirm sign-out. Please try again.', { id: 'sign-out-failed' });
      return false;
    }
    sessionRevision += 1;
    clearSessionHint();
    disconnectSocket();
    setServerSessionAuthenticated(false);
    set(unauthenticatedState);
    return true;
  },
  updateProfile: async (payload) => {
    const userId = get().user?._id;
    const { data } = await queueProfileUpdate(payload);
    if (!userId || get().user?._id !== userId) throw new Error('Your session changed. Please try again.');
    set({ user: data.data.user });
    hydrateServerPreferences(data.data.user?.preferences);
    return data;
  },
  revokeOtherSessions: async (currentPassword) => {
    const userId = get().user?._id;
    const { data } = await api.post('/auth/me/sessions/revoke', { currentPassword });
    if (!userId || get().user?._id !== userId) return data;
    disconnectSocket();
    set({ user: data.data.user });
    return data;
  },
  getSessions: async () => {
    const { data } = await api.get('/auth/me/sessions');
    return data.data.sessions;
  },
  revokeSession: async (sessionId, currentPassword) => {
    const { data } = await api.post(`/auth/me/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      currentPassword,
    });
    return data;
  },
  deleteAccount: async () => {
    try {
      await api.delete('/auth/me');
      sessionRevision += 1;
      clearSessionHint();
      disconnectSocket();
      setServerSessionAuthenticated(false);
      set(unauthenticatedState);
    } catch (error) {
      throw error;
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => {
    if (!useAuthStore.getState().isAuthenticated) return;
    sessionRevision += 1;
    clearSessionHint();
    disconnectSocket();
    setServerSessionAuthenticated(false);
    useAuthStore.setState({ ...unauthenticatedState, sessionNotice: 'Your session ended. Sign in again to continue.' });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_HINT_KEY && event.newValue !== 'true') {
      sessionRevision += 1;
      disconnectSocket();
      setServerSessionAuthenticated(false);
      useAuthStore.setState(unauthenticatedState);
    }
  });
}
