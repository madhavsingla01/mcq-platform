import { create } from 'zustand';
import { authApi, type LoginCredentials, type LoginLocation } from '../api/client';
import { SessionBootstrapResponse, SessionLoginResponse, type SessionUser } from '../../../../contracts/v1/domain.js';
import { readApiFailure } from '../../../../contracts/v1/http.js';

interface AuthState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  checkAuth: () => Promise<SessionUser | undefined>;
  login: (credentials: LoginCredentials, location?: LoginLocation) => Promise<
    { success: true } | { success: false; error: string }
  >;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const res = await authApi.getMe();
      const session = SessionBootstrapResponse.parse(res.data).data;
      if (session.authenticated) {
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
      const { user, token } = SessionLoginResponse.parse(res.data);
      if (token) localStorage.setItem('token', token);
      set({ user, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (err) {
      const msg = readApiFailure({ response: { data: err } }).message;
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
