import axios from 'axios';
import { getGuestSessionId } from '../utils/quizSession';

export const AUTH_SESSION_EXPIRED_EVENT = 'mcq:auth-session-expired';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const refreshClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue = [];

api.interceptors.request.use((config) => {
  const sessionId = getGuestSessionId();
  config.headers = config.headers || {};
  if (sessionId && !config.headers['x-client-session-id'] && !config.headers['x-quiz-session-id']) {
    config.headers['x-client-session-id'] = sessionId;
  }
  return config;
});

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const normalizeUrl = (url = '') => {
  if (!url) return '';

  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    return new URL(url, origin).pathname.replace(/^\/api\/v1/, '');
  } catch {
    return url.replace(/^\/api\/v1/, '');
  }
};

const isAuthEndpoint = (url) => normalizeUrl(url).startsWith('/auth/');

const notifySessionExpired = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    const shouldRefresh =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      !isAuthEndpoint(originalRequest.url);

    if (shouldRefresh) {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await refreshClient.post('/auth/refresh');
        processQueue(null, true);
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        notifySessionExpired();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
