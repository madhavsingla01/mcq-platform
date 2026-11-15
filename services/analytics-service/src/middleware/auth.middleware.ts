import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import env from '../config/env.js';
import { AppError } from './error.middleware.js';

export interface SessionClaims {
  id: string;
  role?: string;
  email?: string;
  exp: number;
  sid?: string;
  tokenVersion?: number;
}

export interface RequestUser {
  id: string;
  userId: string;
  role: string;
  email?: string;
  tokenVersion?: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser;
    authSessionId?: string | undefined;
  }
}

/**
 * Strict session token verification adhering to repository adversarial security invariants:
 * - Rejects non-string / empty tokens
 * - Rejects "none" algorithm attacks (enforces HS256)
 * - Validates 24-hex MongoDB ObjectId format for `id`
 * - Validates safe integer `exp`
 * - Rejects prohibited claims: `aud`, `iss`, `scope`
 * - Validates UUID format for `sid`
 * - Validates non-negative safe integer for `tokenVersion`
 */
export function verifySessionToken(token: unknown, key = env.JWT_SECRET): SessionClaims {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Invalid session token');
  }

  const claims: unknown = jwt.verify(token, key, { algorithms: ['HS256'] });
  if (typeof claims !== 'object' || claims === null) {
    throw new Error('Invalid session claims');
  }

  const id = 'id' in claims ? claims.id : undefined;
  const exp = 'exp' in claims ? claims.exp : undefined;
  const sid = 'sid' in claims ? claims.sid : undefined;
  const tokenVersion = 'tokenVersion' in claims ? claims.tokenVersion : undefined;

  if (
    typeof id !== 'string' ||
    !/^[a-f\d]{24}$/i.test(id) ||
    typeof exp !== 'number' ||
    !Number.isSafeInteger(exp) ||
    ('aud' in claims && claims.aud !== undefined) ||
    ('scope' in claims && claims.scope !== undefined) ||
    ('iss' in claims && claims.iss !== undefined) ||
    (sid !== undefined && (typeof sid !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(sid))) ||
    (tokenVersion !== undefined && (typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion) || tokenVersion < 0))
  ) {
    throw new Error('Invalid session claims');
  }

  return {
    id,
    exp,
    ...('role' in claims && typeof claims.role === 'string' ? { role: claims.role } : {}),
    ...('email' in claims && typeof claims.email === 'string' ? { email: claims.email } : {}),
    ...(sid === undefined ? {} : { sid }),
    ...(tokenVersion === undefined ? {} : { tokenVersion }),
  };
}

/**
 * Extracts authentication token from httpOnly cookies or Authorization Bearer header.
 */
export function readToken(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies === 'object' && cookies !== null) {
    if (Object.hasOwn(cookies, 'accessToken') && 'accessToken' in cookies && typeof cookies.accessToken === 'string' && cookies.accessToken) {
      return cookies.accessToken;
    }
    if (Object.hasOwn(cookies, 'token') && 'token' in cookies && typeof cookies.token === 'string' && cookies.token) {
      return cookies.token;
    }
  }

  const authorization = req.headers?.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const candidate = authorization.slice(7).trim();
    return candidate.length > 0 ? candidate : undefined;
  }

  return undefined;
}

function attachIdentity(req: Request, token: string) {
  const decoded = verifySessionToken(token);
  req.user = {
    id: decoded.id,
    userId: decoded.id,
    role: decoded.role || 'user',
    ...(decoded.email ? { email: decoded.email } : {}),
    ...(decoded.tokenVersion !== undefined ? { tokenVersion: decoded.tokenVersion } : {}),
  };
  req.authSessionId = decoded.sid;
}

/**
 * Mandatory authentication middleware for protected creator analytics endpoints.
 */
export const protect: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (!token) {
    return next(new AppError('Not authenticated. Please log in.', 401));
  }

  try {
    attachIdentity(req, token);
  } catch {
    return next(new AppError('Invalid or expired token.', 401));
  }

  next();
};

/**
 * Optional authentication middleware for public/hybrid routes.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      attachIdentity(req, token);
    } catch {
      // Quietly ignore invalid tokens on optional routes
      return next();
    }
  }
  next();
};

/**
 * Role-based authorization middleware.
 */
export const restrictTo = (...roles: string[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

export default { verifySessionToken, readToken, protect, optionalAuth, restrictTo };
