import crypto from 'crypto';
import { AppError } from './error.middleware.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || !req.cookies?.accessToken) return next();

  if (!safeEqual(req.cookies?.csrfToken, req.get('x-csrf-token'))) {
    return next(new AppError('Invalid CSRF token', 403));
  }

  return next();
};
