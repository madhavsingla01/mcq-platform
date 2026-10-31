import crypto from 'crypto';
import { AppError } from './error.middleware.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || !req.cookies?.accessToken && !req.cookies?.refreshToken) {
    return next();
  }

  if (!safeEqual(req.cookies?.[CSRF_COOKIE_NAME], req.get(CSRF_HEADER_NAME))) {
    return next(new AppError('Invalid CSRF token', 403));
  }

  return next();
};
