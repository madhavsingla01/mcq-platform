import api from '../api/axios';

/**
 * AuthService (SOLID: Single Responsibility Principle)
 * Handles all authentication and profile networking.
 */
export const AuthService = {
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    return data;
  },

  logout: async () => {
    const { data } = await api.post('/auth/logout');
    return data;
  },

  getCurrentUser: async () => {
    const { data } = await api.get('/auth/bootstrap', { skipAuthRefresh: true });
    return data?.data?.authenticated ? data.data.user : null;
  },

  updateProfile: async (profileData) => {
    const { data } = await api.put('/auth/me', profileData);
    return data?.data?.user;
  },
};

export default AuthService;
