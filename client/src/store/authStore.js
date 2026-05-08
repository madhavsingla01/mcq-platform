import { create } from 'zustand';
import api, { AUTH_SESSION_EXPIRED_EVENT } from '../api/axios';

const SESSION_HINT_KEY = 'mcq.auth.has-session.v1';
const SESSION_CHECKED_KEY = 'mcq.auth.session-checked.v1';

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
        const { data } = await api.get('/auth/me', { skipAuthRefresh: true });
        setSessionHint();
        set({ user: data.data.user, isAuthenticated: true, isLoading: false });
        return data;
      } catch (error) {
        if (error.response?.status === 401) {
          try {
            await api.post('/auth/refresh', {}, { skipAuthRefresh: true });
            const { data } = await api.get('/auth/me', { skipAuthRefresh: true });
            setSessionHint();
            set({ user: data.data.user, isAuthenticated: true, isLoading: false });
            return data;
          } catch {
            clearSessionHint();
            set(unauthenticatedState);
            return null;
          }
        }

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
    return data;
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password }, { skipAuthRefresh: true });
    setSessionHint();
    set({ user: data.data.user, isAuthenticated: true, isLoading: false });
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
