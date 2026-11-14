import axios from 'axios';

// Create Axios Client targeting API Gateway reverse-proxied /api/v1
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  xsrfCookieName: 'csrfToken',
  xsrfHeaderName: 'x-csrf-token',
});

// Guest session key helper matching desktop client convention
const GUEST_KEY = 'mcq:guest-session-id';
export function getGuestId() {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = 'guest_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

// Request interceptor to attach guest session ID and token
api.interceptors.request.use((config) => {
  const guestId = getGuestId();
  config.headers = config.headers || {};
  if (typeof navigator !== 'undefined') {
    if (navigator.language) config.headers['x-client-locale'] = navigator.language.slice(0, 35);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timeZone) config.headers['x-client-timezone'] = timeZone.slice(0, 80);
    } catch {
      // Time zone metadata is optional.
    }
  }
  if (!config.headers['x-client-session-id']) {
    config.headers['x-client-session-id'] = guestId;
  }
  const token = localStorage.getItem('token');
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for clean errors
api.interceptors.response.use(
  (res) => res,
  (err) => {
    return Promise.reject(err?.response?.data || err);
  }
);

// Endpoints mapped to microservices via API Gateway
export const authApi = {
  getMe: () => api.get('/auth/bootstrap'),
  login: (credentials, location) => api.post('/auth/login', credentials, {
    headers: location ? {
      'x-client-location-latitude': String(location.latitude),
      'x-client-location-longitude': String(location.longitude),
      'x-client-location-accuracy': String(location.accuracy),
    } : undefined,
  }),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
};

export const quizApi = {
  getAll: (params) => api.get('/quizzes', { params }),
  getById: (quizId) => api.get(`/quiz/${quizId}`),
  getQuestions: (quizId) => api.get(`/quiz/${quizId}/questions`),
};

export const challengeApi = {
  getOverview: () => api.get('/challenges/overview'),
  getAll: (params) => api.get('/challenges', { params }),
  getById: (id) => api.get(`/challenges/${id}`),
  getLeaderboard: (id) => api.get(`/challenges/${id}/leaderboard`),
};

export const socialApi = {
  getExplore: (params) => api.get('/social/explore', { params }),
  getChallengesOverview: () => api.get('/challenges/overview').catch(() => api.get('/social/challenges-overview')),
  getBookmarks: () => api.get('/social/bookmarks'),
  bookmarkQuiz: (quizId) => api.post(`/social/quizzes/${quizId}/bookmark`),
  unbookmarkQuiz: (quizId) => api.delete(`/social/quizzes/${quizId}/bookmark`),
  getUserProfile: (username) => api.get(`/social/profile/${username}`),
  getUserActivity: (username) => api.get(`/social/users/${username}/activity`),
};

export const attemptApi = {
  start: (quizId, payload = {}) => api.post(`/quiz/${quizId}/attempt`, payload),
  getInProgress: () => api.get('/attempts/in-progress'),
  submitAnswer: (attemptId, payload) => api.post(`/attempts/${attemptId}/answer`, payload),
  submitAttempt: (quizId, attemptId, payload = {}) => api.put(`/quiz/${quizId}/attempt/${attemptId}`, { ...payload, finalize: true }),
  getResult: (attemptId) => api.get(`/attempts/${attemptId}/result`),
  getReview: (attemptId) => api.get(`/attempts/${attemptId}/review`),
  getHistory: (params) => api.get('/attempts', { params }),
};

export const marketplaceApi = {
  getCatalog: async (params) => {
    try {
      const res = await api.get('/marketplace/catalog', { params });
      return res.data;
    } catch (err) {
      if (err?.status === 404 || err?.statusCode === 404 || (err?.message && err.message.includes('not yet implemented'))) {
        return {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
          isTransitional: true,
        };
      }
      throw err;
    }
  },
  getListing: async (id) => {
    const res = await api.get(`/marketplace/listings/${id}`);
    return res.data;
  },
  getEntitlements: async (params) => {
    try {
      const res = await api.get('/marketplace/entitlements', { params });
      return res.data;
    } catch (err) {
      if (err?.status === 404 || err?.statusCode === 404) {
        return {
          success: true,
          data: { entitlements: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
          isTransitional: true,
        };
      }
      throw err;
    }
  },
};

export const uploadApi = {
  // Standard parser upload
  uploadFile: (formData, onProgress) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
  }),
  // Educational asset lifecycle pipeline
  initiateAsset: (payload) => api.post('/media/assets/initiate', payload),
  uploadBinary: (assetId, token, file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/media/assets/${assetId}/upload?token=${token}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });
  },
  getAssetStatus: (assetId) => api.get(`/media/assets/${assetId}/status`),
  getAssetPreview: (assetId) => api.get(`/parser/preview/asset/${assetId}`),
};
