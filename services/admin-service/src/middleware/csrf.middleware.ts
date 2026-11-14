import crypto from 'crypto';
import type { RequestHandler } from 'express';
import { requestCookie } from './request.js';
import { AppError } from './error.middleware.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';

const safeEqual = (left: string | undefined, right: string | undefined) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length > 0 && leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const csrfProtection: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || !requestCookie(req, 'accessToken') && !requestCookie(req, 'refreshToken')) {
    return next();
  }

  if (!safeEqual(requestCookie(req, CSRF_COOKIE_NAME), req.get(CSRF_HEADER_NAME))) {
    return next(new AppError('Invalid CSRF token', 403));
  }

  return next();
};
