import api from '../api/axios';

/**
 * SocialService (SOLID: Single Responsibility Principle)
 * Handles quiz likes, bookmarks, comments, creator profiles, and activity feeds.
 */
export const SocialService = {
  likeQuiz: async (quizId) => {
    const { data } = await api.post(`/social/quizzes/${quizId}/like`);
    return data?.data?.quiz;
  },

  unlikeQuiz: async (quizId) => {
    const { data } = await api.delete(`/social/quizzes/${quizId}/like`);
    return data?.data?.quiz;
  },

  bookmarkQuiz: async (quizId) => {
    const { data } = await api.post(`/social/quizzes/${quizId}/bookmark`);
    return data?.data?.quiz;
  },

  unbookmarkQuiz: async (quizId) => {
    const { data } = await api.delete(`/social/quizzes/${quizId}/bookmark`);
    return data?.data?.quiz;
  },

  getComments: async (quizId, params = {}) => {
    const { data } = await api.get(`/social/quizzes/${quizId}/comments`, { params });
    return data?.data || {};
  },

  addComment: async (quizId, content) => {
    const { data } = await api.post(`/social/quizzes/${quizId}/comments`, { content });
    return data?.data?.comment;
  },

  getFeed: async (params = {}) => {
    const { data } = await api.get('/social/feed', { params });
    return data?.data || {};
  },

  getExplore: async (params = {}) => {
    const { data } = await api.get('/social/explore', { params });
    return data?.data || {};
  },


  getCreatorProfile: async (identifier, params = {}) => {
    const { data } = await api.get(`/social/profile/${identifier}`, { params });
    return data?.data || {};
  },

  followUser: async (userId) => {
    const { data } = await api.post(`/social/users/${userId}/follow`);
    return data?.data;
  },

  unfollowUser: async (userId) => {
    const { data } = await api.delete(`/social/users/${userId}/follow`);
    return data?.data;
  },

  likeComment: async (commentId) => {
    const { data } = await api.post(`/social/comments/${commentId}/like`);
    return data?.data;
  },

  unlikeComment: async (commentId) => {
    const { data } = await api.delete(`/social/comments/${commentId}/like`);
    return data?.data;
  },

  replyToComment: async (quizId, parentCommentId, body, replyToUserId = null) => {
    const { data } = await api.post(`/social/quizzes/${quizId}/comments`, {
      body,
      parentComment: parentCommentId,
      replyToUser: replyToUserId,
    });
    return data?.data?.comment;
  },

  updateComment: async (commentId, body) => {
    const { data } = await api.patch(`/social/comments/${commentId}`, { body });
    return data?.data?.comment;
  },

  deleteComment: async (commentId) => {
    const { data } = await api.delete(`/social/comments/${commentId}`);
    return data?.data;
  },
};

export default SocialService;
