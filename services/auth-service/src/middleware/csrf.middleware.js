import crypto from 'crypto';
import env from '../config/env.js';
import { AppError } from './error.middleware.js';

export const CSRF_COOKIE_NAME = 'csrfToken';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_UNSAFE_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
]);
const TOKEN_BYTES = 32;

const csrfCookieOptions = {
  httpOnly: false,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const timingSafeStringEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createCsrfToken = () => crypto.randomBytes(TOKEN_BYTES).toString('hex');

export const setCsrfCookie = (res, token = createCsrfToken()) => {
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  return token;
};

export const clearCsrfCookie = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions);
};

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (EXEMPT_UNSAFE_PATHS.has(req.path)) {
    return next();
  }

  const hasAuthCookie = Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);
  if (!hasAuthCookie) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || !timingSafeStringEqual(cookieToken, headerToken)) {
    return next(new AppError('Invalid CSRF token', 403));
  }

  next();
};

export default {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  clearCsrfCookie,
  createCsrfToken,
  csrfProtection,
  setCsrfCookie,
};
