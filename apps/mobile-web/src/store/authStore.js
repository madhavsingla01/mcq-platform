import { create } from 'zustand';
import { authApi } from '../api/client';

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const res = await authApi.getMe();
      const session = res.data?.data;
      if (session?.authenticated && session.user) {
        const user = session.user;
        set({ user, isAuthenticated: true, isLoading: false });
        return user;
      }
      localStorage.removeItem('token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (credentials, location) => {
    try {
      set({ isLoading: true, error: null });
      const res = await authApi.login(credentials, location);
      const data = res.data?.data || res.data;
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      const user = data.user || data;
      set({ user, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (err) {
      const msg = err.message || err.error || 'Failed to sign in';
      set({ error: msg, isLoading: false });
      return { success: false, error: msg };
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore network errors on logout
    }
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },
}));
