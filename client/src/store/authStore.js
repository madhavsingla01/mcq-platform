import { create } from 'zustand';
import api, { AUTH_SESSION_EXPIRED_EVENT } from '../api/axios';
import { hydrateServerPreferences } from './settingsStore';

const SESSION_HINT_KEY = 'mcq.auth.has-session.v2';
const SESSION_CHECKED_KEY = 'mcq.auth.session-checked.v2';

let checkAuthPromise = null;

const hasSessionHint = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SESSION_HINT_KEY) === 'true';
};

const hasCheckedSession = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SESSION_CHECKED_KEY) === 'true';
};

const setSessionChecked = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_CHECKED_KEY, 'true');
  }
};

const setSessionHint = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_HINT_KEY, 'true');
    window.localStorage.setItem(SESSION_CHECKED_KEY, 'true');
  }
};

const clearSessionHint = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_HINT_KEY);
    window.localStorage.setItem(SESSION_CHECKED_KEY, 'true');
  }
};

const unauthenticatedState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  checkAuth: async ({ force = false } = {}) => {
    if (!force && !hasSessionHint() && hasCheckedSession()) {
      set(unauthenticatedState);
      return null;
    }

    if (checkAuthPromise) {
      return checkAuthPromise;
    }

    checkAuthPromise = (async () => {
      set({ isLoading: true });

      try {
        const { data } = await api.get('/auth/bootstrap', { skipAuthRefresh: true });
        const user = data.data?.authenticated ? data.data.user : null;

        if (!user) {
          clearSessionHint();
          set(unauthenticatedState);
          return null;
        }

        setSessionHint();
        set({ user, isAuthenticated: true, isLoading: false });
        hydrateServerPreferences(user?.preferences);
        return data;
      } catch (error) {
        clearSessionHint();
        set(unauthenticatedState);
        return null;
      } finally {
        setSessionChecked();
        checkAuthPromise = null;
      }
    })();

    return checkAuthPromise;
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password }, { skipAuthRefresh: true });
    setSessionHint();
    set({ user: data.data.user, isAuthenticated: true, isLoading: false });
    hydrateServerPreferences(data.data.user?.preferences);
    return data;
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password }, { skipAuthRefresh: true });
    setSessionHint();
    set({ user: data.data.user, isAuthenticated: true, isLoading: false });
    hydrateServerPreferences(data.data.user?.preferences);
    return data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', {}, { skipAuthRefresh: true });
    } finally {
      clearSessionHint();
      set(unauthenticatedState);
    }
  },
  updateProfile: async (payload) => {
    const { data } = await api.patch('/auth/me', payload);
    set({ user: data.data.user });
    hydrateServerPreferences(data.data.user?.preferences);
    return data;
  },
  deleteAccount: async () => {
    try {
      await api.delete('/auth/me');
    } finally {
      clearSessionHint();
      set(unauthenticatedState);
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => {
    clearSessionHint();
    useAuthStore.setState(unauthenticatedState);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_HINT_KEY && event.newValue !== 'true') {
      useAuthStore.setState(unauthenticatedState);
    }
  });
}
