import api from '../api/axios';

/**
 * SearchService (DRY: Centralized Search Networking)
 * Exposes methods to perform universal search, trending hashtag retrieval,
 * and tag-based quiz queries without duplicating fetch logic.
 */
export const SearchService = {
  /**
   * Universal search across quizzes, creators, and hashtags
   * @param {Object} params - { q, type, page, limit }
   * @returns {Promise<Object>} Search response data
   */
  universalSearch: async (params = {}) => {
    const { data } = await api.get('/search/universal', { params });
    return data;
  },

  /**
   * Retrieves hashtag names from recent public quizzes.
   */
  getRecentTags: async (limit = 12) => {
    try {
      const { data } = await api.get('/search/trending-tags', {
        params: { limit, order: 'recent' },
      });
      return data?.data?.tags || [];
    } catch {
      return [];
    }
  },

  /**
   * Retrieves public quizzes tagged with a specific hashtag
   * @param {string} tag - Hashtag name without '#'
   * @param {Object} params - { page, limit }
   * @returns {Promise<Object>} Quizzes and pagination data
   */
  searchByTag: async (tag, params = {}) => {
    const cleanTag = encodeURIComponent(tag.replace(/^#/, ''));
    const { data } = await api.get(`/search/tags/${cleanTag}`, { params });
    return data;
  },
};

export default SearchService;
