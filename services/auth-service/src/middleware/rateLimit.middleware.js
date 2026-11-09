/**
 * Rate limiting middleware.
 * Simple in-memory implementation, upgradeable to Redis.
 */

import { AppError } from './error.middleware.js';

const rateLimitStore = new Map();
let cleanupStarted = false;

const startCleanupWorker = () => {
  if (cleanupStarted) return;
  cleanupStarted = true;

  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore) {
      if (now > data.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000).unref?.();
};

const defaultKeyGenerator = (req) => {
  return req.ip || req.socket?.remoteAddress || 'unknown';
};
const authRoute = req => req.route?.path ?? req.path;

const setRateLimitHeaders = (res, { limit, remaining, resetAt }) => {
  res.set('RateLimit-Limit', String(limit));
  res.set('RateLimit-Remaining', String(Math.max(remaining, 0)));
  res.set('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
};

/**
 * Create a rate limiter.
 * @param {{ windowMs: number, max: number, message: string }} options
 */
export const rateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests, please try again later.',
    keyPrefix = 'global',
    keyGenerator = defaultKeyGenerator,
  } = options;

  startCleanupWorker();

  return (req, res, next) => {
    const key = `${keyPrefix}:${keyGenerator(req)}`;
    const now = Date.now();
    const data = rateLimitStore.get(key);

    if (!data || now > data.resetAt) {
      const resetAt = now + windowMs;
      rateLimitStore.set(key, { count: 1, resetAt });
      setRateLimitHeaders(res, { limit: max, remaining: max - 1, resetAt });
      return next();
    }

    setRateLimitHeaders(res, { limit: max, remaining: max - data.count, resetAt: data.resetAt });

    if (data.count >= max) {
      res.set('Retry-After', String(Math.ceil((data.resetAt - now) / 1000)));
      return next(new AppError(message, 429));
    }

    data.count++;
    setRateLimitHeaders(res, { limit: max, remaining: max - data.count, resetAt: data.resetAt });
    next();
  };
};

/**
 * Strict rate limit for auth endpoints.
 */
export const authRateLimit = rateLimit({
  keyPrefix: 'auth',
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 50,
  keyGenerator: (req) => {
    const ip = defaultKeyGenerator(req);
    const route = authRoute(req);
    const rawId = ['/login', '/register'].includes(route)
      ? (req.body?.email ?? req.body?.identifier)
      : req.user?._id?.toString();
    const identifier = (rawId && typeof rawId === 'string')
      ? `:${rawId.trim().slice(0, 320).toLowerCase()}`
      : '';
    return `${route}:${ip}${identifier}`;
  },
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

export const authAddressLimit = rateLimit({
  keyPrefix: 'auth-address',
  max: process.env.NODE_ENV === 'test' ? 2000 : 150,
  keyGenerator: (req) => `${authRoute(req)}:${defaultKeyGenerator(req)}`,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

/**
 * Upload rate limit.
 */
export const uploadRateLimit = rateLimit({
  keyPrefix: 'upload',
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Upload limit reached. Please try again later.',
});

/**
 * Global API rate limiter.
 */
export const apiRateLimiter = rateLimit({
  keyPrefix: 'api',
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: 'API rate limit exceeded. Please wait a few moments before trying again.',
});

export default { rateLimit, authRateLimit, uploadRateLimit, apiRateLimiter };
