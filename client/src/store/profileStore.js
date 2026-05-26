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
      set({ quizzes: data.data.quizzes, totalQuizzes: data.data.total, currentPage: data.data.page, totalPages: data.data.totalPages, quizzesLoading: false });
    } catch (err) {
      set({ quizzes: [], totalQuizzes: 0, currentPage: 1, totalPages: 1, quizzesLoading: false });
    }
  },

  followUser: async (username) => {
    try {
      const { data } = await api.post(`/users/${username}/follow`);
      const nextProfile = data.data || {};
      set(state => ({
        profile: state.profile
          ? {
              ...state.profile,
              isFollowing: nextProfile.isFollowing ?? true,
              followersCount: nextProfile.followersCount ?? ((state.profile.followersCount || 0) + 1),
            }
          : null,
      }));
      return data;
    } catch (err) {
      console.error('Follow failed', err);
      throw err;
    }
  },

  unfollowUser: async (username) => {
    try {
      const { data } = await api.delete(`/users/${username}/follow`);
      const nextProfile = data.data || {};
      set(state => ({
        profile: state.profile
          ? {
              ...state.profile,
              isFollowing: nextProfile.isFollowing ?? false,
              followersCount: nextProfile.followersCount ?? Math.max(0, (state.profile.followersCount || 0) - 1),
            }
          : null,
      }));
      return data;
    } catch (err) {
      console.error('Unfollow failed', err);
      throw err;
    }
  },

  reset: () => set({ profile: null, quizzes: [], totalQuizzes: 0, currentPage: 1, totalPages: 1, isLoading: false, error: null }),
}));
