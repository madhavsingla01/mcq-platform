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

// Older sessions can omit tokenVersion. Account checks treat that as version zero.
export function verifySessionToken(token: unknown, key = env.JWT_SECRET): SessionClaims {
  if (typeof token !== 'string' || token.length === 0) throw new Error('Invalid session token');
  const claims: unknown = jwt.verify(token, key, { algorithms: ['HS256'] });
  if (typeof claims !== 'object' || claims === null) throw new Error('Invalid session claims');
  const id = 'id' in claims ? claims.id : undefined;
  const exp = 'exp' in claims ? claims.exp : undefined;
  const sid = 'sid' in claims ? claims.sid : undefined;
  const tokenVersion = 'tokenVersion' in claims ? claims.tokenVersion : undefined;
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) ||
      typeof exp !== 'number' || !Number.isSafeInteger(exp) ||
      ('aud' in claims && claims.aud !== undefined) ||
      ('scope' in claims && claims.scope !== undefined) ||
      ('iss' in claims && claims.iss !== undefined) ||
      (sid !== undefined && (typeof sid !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(sid))) ||
      (tokenVersion !== undefined && (typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion) || tokenVersion < 0))) {
    throw new Error('Invalid session claims');
  }
  return {
    id, exp,
    ...('role' in claims && typeof claims.role === 'string' ? { role: claims.role } : {}),
    ...('email' in claims && typeof claims.email === 'string' ? { email: claims.email } : {}),
    ...(sid === undefined ? {} : { sid }),
    ...(tokenVersion === undefined ? {} : { tokenVersion }),
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: string; email?: string; tokenVersion?: number };
    authSessionId?: string | undefined;
  }
}

function readToken(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies === 'object' && cookies !== null && Object.hasOwn(cookies, 'accessToken') &&
      'accessToken' in cookies && typeof cookies.accessToken === 'string' && cookies.accessToken) {
    return cookies.accessToken;
  }
  const authorization = req.headers?.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.split(' ')[1] : undefined;
}

function attachIdentity(req: Request, token: string) {
  const decoded = verifySessionToken(token);
  req.user = {
    id: decoded.id,
    role: decoded.role || 'user',
    ...(decoded.email ? { email: decoded.email } : {}),
    ...(decoded.tokenVersion !== undefined ? { tokenVersion: decoded.tokenVersion } : {}),
  };
  req.authSessionId = decoded.sid;
}

export const protect: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (!token) return next(new AppError('Not authenticated. Please log in.', 401));
  try {
    attachIdentity(req, token);
  } catch {
    return next(new AppError('Invalid or expired token.', 401));
  }
  next();
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      attachIdentity(req, token);
    } catch {
      return next();
    }
  }
  next();
};

export default { verifySessionToken, protect, optionalAuth };
