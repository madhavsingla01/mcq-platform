/**
 * QuizFocus API Gateway - Upload Rate Limiting Middleware
 * Zero-dependency in-memory sliding window rate limiter.
 */

import { errorBody } from '../contracts.js';
import type { Request, RequestHandler } from 'express';
import { requestIdOf } from '../request-types.js';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
let cleanupTimer: NodeJS.Timeout | undefined;

interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export function startRateLimitCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (now > data.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 30000);
  cleanupTimer.unref?.();
}

export function resetRateLimitStore() {
  rateLimitStore.clear();
}

export function createRateLimiter(options: RateLimiterOptions = {}): RequestHandler {
  const {
    windowMs = 60 * 1000,
    max = 60,
    message = 'Upload rate limit exceeded. Please try again later.',
    keyPrefix = 'upload',
    keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
    skip = () => false,
  } = options;

  startRateLimitCleanup();

  return function rateLimitMiddleware(req, res, next) {
    if (skip(req)) return next();

    const clientKey = `${keyPrefix}:${keyGenerator(req)}`;
    const now = Date.now();
    let entry = rateLimitStore.get(clientKey);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(clientKey, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil(entry.resetAt / 1000);
    const retryAfter = Math.ceil(Math.max(0, entry.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(retryAfter || 1));
      let reqId = 'req_unknown';
      try {
        reqId = requestIdOf(req);
      } catch {
        reqId = req.requestId || 'req_unknown';
      }
      return res.status(429).json(errorBody(429, message, reqId));
    }

    next();
  };
}

/**
 * Predicate to identify upload & processing mutation endpoints.
 */
export function isUploadProcessingRequest(req: Pick<Request, 'method' | 'path' | 'originalUrl'>) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return false;
  const path = req.originalUrl || req.path || '';
  return (
    path.startsWith('/api/v1/media/assets') ||
    path.startsWith('/api/v1/media/images') ||
    path.startsWith('/api/v1/media/clips') ||
    path.startsWith('/api/v1/upload') ||
    path.startsWith('/api/v1/parser') ||
    path.startsWith('/media/assets') ||
    path.startsWith('/uploads')
  );
}

/**
 * Gateway Upload Rate Limiter factory
 */
export function createUploadRateLimiter() {
  const windowMs = Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS || 60000);
  const max = Number(process.env.UPLOAD_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'test' ? 100 : 60));

  return createRateLimiter({
    keyPrefix: 'upload',
    windowMs,
    max,
    message: 'Upload rate limit exceeded. Please try again later.',
    skip: (req) => !isUploadProcessingRequest(req),
  });
}
