import api from '../api/axios';
import { LeaderboardResponse } from '../../../../contracts/v1/domain.js';

/**
 * ChallengeService (SOLID: Single Responsibility Principle)
 * Handles competitive challenge discovery, retrieval, leaderboards, creation, and management.
 */
export const ChallengeService = {
  /**
   * Arena overview with user stats, featured challenge, active attempts, and trending contests.
   * GET /api/v1/challenges/overview
   */
  getOverview: async () => {
    const { data } = await api.get('/challenges/overview');
    return data?.data || {};
  },

  /**
   * Server-side filtered listing of challenges (active or ended).
   * GET /api/v1/challenges
   * @param {Object} params - { status: 'active' | 'ended', category, search, page, limit }
   */
  listChallenges: async (params: Record<string, string | number | boolean | undefined> = {}) => {
    const { data } = await api.get('/challenges', { params });
    return data?.data || { challenges: [], pagination: {} };
  },

  /**
   * Retrieve single challenge by ObjectId or symbolic challengeCode (!QZ-XXXXXX).
   * Sanitizes question correct options if contest is currently active.
   * GET /api/v1/challenges/:idOrCode
   */
  getChallengeByIdOrCode: async (idOrCode: string) => {
    const { data } = await api.get(`/challenges/${idOrCode}`);
    return data?.data || {};
  },

  /**
   * Competition standings and the signed-in viewer's submission receipt.
   * GET /api/v1/challenges/:idOrCode/leaderboard
   */
  getLeaderboard: async (idOrCode: string, signal?: AbortSignal) => {
    const { data } = await api.get<unknown>(`/challenges/${idOrCode}/leaderboard`, signal ? { signal } : {});
    return LeaderboardResponse.parse(data).data;
  },

  /**
   * Create a new competitive contest (enforces 10-question cap, duration, future deadline).
   * POST /api/v1/challenges
   */
  createChallenge: async (payload: Record<string, unknown>) => {
    const { data } = await api.post('/challenges', payload);
    return data?.data || {};
  },

  /**
   * Update challenge metadata (title, description, thumbnail, tags, category, difficulty).
   * PUT /api/v1/challenges/:idOrCode
   */
  updateChallenge: async (idOrCode: string, payload: Record<string, unknown>) => {
    const { data } = await api.put(`/challenges/${idOrCode}`, payload);
    return data?.data || {};
  },

  /**
   * Delete challenge (only permitted if no competitive attempts have been submitted).
   * DELETE /api/v1/challenges/:idOrCode
   */
  deleteChallenge: async (idOrCode: string) => {
    const { data } = await api.delete(`/challenges/${idOrCode}`);
    return data;
  },
};

export default ChallengeService;
