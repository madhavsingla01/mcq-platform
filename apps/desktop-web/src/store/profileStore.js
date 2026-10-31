import { create } from 'zustand';
import api from '../api/axios';

export const useProfileStore = create((set, get) => ({
  profile: null,
  quizzes: [],
  totalQuizzes: 0,
  currentPage: 1,
  totalPages: 1,
  isLoading: false,
  quizzesLoading: false,
  error: null,

  fetchProfile: async (username) => {
    set({ isLoading: true, error: null, profile: null });
    try {
      const { data } = await api.get(`/users/${username}`);
      set({ profile: data.data?.profile || data.data, isLoading: false });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Profile not found', isLoading: false, profile: null });
    }
  },

  fetchQuizzes: async (username, page = 1) => {
    set({ quizzesLoading: true });
    try {
      const { data } = await api.get(`/users/${username}/quizzes?page=${page}`);
      const pagination = data.data.pagination || {};
      set({
        quizzes: data.data.quizzes || [],
        totalQuizzes: data.data.total ?? pagination.total ?? 0,
        currentPage: data.data.page ?? pagination.page ?? page,
        totalPages: data.data.totalPages ?? pagination.pages ?? 1,
        quizzesLoading: false
      });
    } catch (err) {
      set({ quizzes: [], totalQuizzes: 0, currentPage: 1, totalPages: 1, quizzesLoading: false });
    }
  },


  reset: () => set({ profile: null, quizzes: [], totalQuizzes: 0, currentPage: 1, totalPages: 1, isLoading: false, error: null }),
}));
