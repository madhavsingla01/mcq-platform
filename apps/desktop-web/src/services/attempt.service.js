import api from '../api/axios';

/**
 * AttemptService (SOLID: Single Responsibility & Interface Segregation)
 * Manages attempt creation, periodic state syncing, answer submission, and results.
 */
export const AttemptService = {
  startAttempt: async (quizId, payload = {}, headers = {}) => {
    const { data } = await api.post(`/quiz/${quizId}/attempt`, payload, { headers });
    return data?.data || {};
  },

  syncAttemptState: async (quizId, attemptId, payload = {}, headers = {}) => {
    const { data } = await api.put(`/quiz/${quizId}/attempt/${attemptId}`, payload, { headers });
    return data?.data || {};
  },

  submitAttempt: async (quizId, attemptId, payload = {}, headers = {}) => {
    const { data } = await api.put(`/quiz/${quizId}/attempt/${attemptId}`, { ...payload, finalize: true }, { headers });
    return data?.data || {};
  },

  getAttemptResult: async (attemptId) => {
    const { data } = await api.get(`/attempts/${attemptId}/result`);
    return data?.data || {};
  },

  getUserAttempts: async (params = {}) => {
    const { data } = await api.get('/attempts', { params });
    return data?.data || {};
  },
};

export default AttemptService;
