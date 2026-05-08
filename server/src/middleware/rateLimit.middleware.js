/**
 * Rate limiting middleware.
 * Simple in-memory implementation, upgradeable to Redis.
 */

import { AppError } from './error.middleware.js';

const rateLimitStore = new Map();

/**
 * Create a rate limiter.
 * @param {{ windowMs: number, max: number, message: string }} options
 */
export const rateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests, please try again later.',
  } = options;

  // Clean up expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore) {
      if (now - data.startTime > windowMs) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);

  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const data = rateLimitStore.get(key);

    if (!data || now - data.startTime > windowMs) {
      rateLimitStore.set(key, { count: 1, startTime: now });
      return next();
    }

    if (data.count >= max) {
      return next(new AppError(message, 429));
    }

    data.count++;
    next();
  };
};

/**
 * Strict rate limit for auth endpoints.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

/**
 * Upload rate limit.
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Upload limit reached. Please try again later.',
});

export default { rateLimit, authRateLimit, uploadRateLimit };
