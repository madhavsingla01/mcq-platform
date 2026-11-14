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
  (err: unknown) => {
    return Promise.reject(axios.isAxiosError<unknown, unknown>(err) ? err.response?.data || err : err);
  }
);

export type LoginCredentials = { email: string; password: string } | { identifier: string; password: string };
export type LoginLocation = Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>;
type QueryParams = Record<string, string | number | boolean | null | undefined>;
type Progress = (percentage: number) => void;

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
}

function isCatalogUnavailable(error: unknown) {
  return errorStatus(error) === 404 ||
    (typeof error === 'object' && error !== null && 'message' in error &&
      typeof error.message === 'string' && error.message.includes('not yet implemented'));
}

// Endpoints mapped to microservices via API Gateway
export const authApi = {
  getMe: () => api.get<unknown>('/auth/bootstrap'),
  login: (credentials: LoginCredentials, location?: LoginLocation) => api.post<unknown>('/auth/login', credentials, location ? {
    headers: {
      'x-client-location-latitude': String(location.latitude),
      'x-client-location-longitude': String(location.longitude),
      'x-client-location-accuracy': String(location.accuracy),
    },
  } : undefined),
  register: (userData: { name: string; email: string; password: string }) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
};

export const quizApi = {
  getAll: (params?: QueryParams) => api.get('/quizzes', { params }),
  getById: (quizId: string) => api.get(`/quiz/${quizId}`),
  getQuestions: (quizId: string) => api.get(`/quiz/${quizId}/questions`),
};

export const challengeApi = {
  getOverview: () => api.get('/challenges/overview'),
  getAll: (params?: QueryParams) => api.get('/challenges', { params }),
  getById: (id: string) => api.get(`/challenges/${id}`),
  getLeaderboard: (id: string) => api.get(`/challenges/${id}/leaderboard`),
};

export const socialApi = {
  getExplore: (params?: QueryParams) => api.get('/social/explore', { params }),
  getChallengesOverview: () => api.get('/challenges/overview').catch(() => api.get('/social/challenges-overview')),
  getBookmarks: () => api.get('/social/bookmarks'),
  bookmarkQuiz: (quizId: string) => api.post(`/social/quizzes/${quizId}/bookmark`),
  unbookmarkQuiz: (quizId: string) => api.delete(`/social/quizzes/${quizId}/bookmark`),
  getUserProfile: (username: string) => api.get(`/social/profile/${username}`),
  getUserActivity: (username: string) => api.get(`/social/users/${username}/activity`),
};

export const attemptApi = {
  start: (quizId: string, payload: Record<string, unknown> = {}) => api.post(`/quiz/${quizId}/attempt`, payload),
  getInProgress: () => api.get('/attempts/in-progress'),
  submitAnswer: (attemptId: string, payload: Record<string, unknown>) => api.post(`/attempts/${attemptId}/answer`, payload),
  submitAttempt: (quizId: string, attemptId: string, payload: Record<string, unknown> = {}) => api.put(`/quiz/${quizId}/attempt/${attemptId}`, { ...payload, finalize: true }),
  getResult: (attemptId: string) => api.get(`/attempts/${attemptId}/result`),
  getReview: (attemptId: string) => api.get(`/attempts/${attemptId}/review`),
  getHistory: (params?: QueryParams) => api.get('/attempts', { params }),
};

export const marketplaceApi = {
  getCatalog: async (params?: QueryParams) => {
    try {
      const res = await api.get('/marketplace/catalog', { params });
      return res.data;
    } catch (err) {
      if (isCatalogUnavailable(err)) {
        return {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
          isTransitional: true,
        };
      }
      throw err;
    }
  },
  getListing: async (id: string) => {
    const res = await api.get(`/marketplace/listings/${id}`);
    return res.data;
  },
  getEntitlements: async (params?: QueryParams) => {
    try {
      const res = await api.get('/marketplace/entitlements', { params });
      return res.data;
    } catch (err) {
      if (errorStatus(err) === 404) {
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
  uploadFile: (formData: FormData, onProgress?: Progress) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
  }),
  // Educational asset lifecycle pipeline
  initiateAsset: (payload: Record<string, unknown>) => api.post('/media/assets/initiate', payload),
  uploadBinary: (assetId: string, token: string, file: Blob, onProgress?: Progress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/media/assets/${assetId}/upload?token=${token}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });
  },
  getAssetStatus: (assetId: string) => api.get(`/media/assets/${assetId}/status`),
  getAssetPreview: (assetId: string) => api.get(`/parser/preview/asset/${assetId}`),
};
