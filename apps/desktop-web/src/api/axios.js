import axios from 'axios';
import { getGuestSessionId } from '../utils/quizSession';
import { apiFailure } from './errorContract';

export const AUTH_SESSION_EXPIRED_EVENT = 'mcq:auth-session-expired';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  xsrfCookieName: 'csrfToken',
  xsrfHeaderName: 'x-csrf-token',
});

const refreshClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  xsrfCookieName: 'csrfToken',
  xsrfHeaderName: 'x-csrf-token',
});

let refreshPromise;

api.interceptors.request.use((config) => {
  const sessionId = getGuestSessionId();
  config.headers = config.headers || {};
  if (sessionId && !config.headers['x-client-session-id'] && !config.headers['x-quiz-session-id']) {
    config.headers['x-client-session-id'] = sessionId;
  }
  return config;
});

const normalizeUrl = (url = '') => {
  if (!url) return '';

  try {
    const path = typeof window === 'undefined'
      ? String(url).replace(/^https?:\/\/[^/]+/i, '')
      : new URL(url, window.location.origin).pathname;
    return path.split(/[?#]/, 1)[0].replace(/^\/api\/v1/, '');
  } catch {
    return url.replace(/^\/api\/v1/, '');
  }
};

const sessionEndpoints = new Set(['/auth/login', '/auth/register', '/auth/bootstrap', '/auth/refresh', '/auth/logout']);

const notifySessionExpired = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
};

const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient.post('/auth/refresh').catch(async (error) => {
      if (error.response?.status !== 401) throw error;
      // Another tab may have already rotated the cookie successfully.
      try {
        await refreshClient.get('/auth/me');
      } catch (verificationError) {
        if (verificationError.response?.status === 401) notifySessionExpired();
        throw verificationError;
      }
    }).finally(() => { refreshPromise = undefined; });
  }
  return refreshPromise;
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    error.apiFailure = apiFailure(error);
    const originalRequest = error.config;
    const shouldRefresh =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      !sessionEndpoints.has(normalizeUrl(originalRequest.url));

    if (shouldRefresh) {
      originalRequest._retry = true;
      try {
        await refreshSession();
      } catch (refreshError) {
        refreshError.apiFailure = apiFailure(refreshError);
        throw refreshError;
      }
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
