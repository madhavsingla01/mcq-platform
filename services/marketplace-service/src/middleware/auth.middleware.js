import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AppError } from './error.middleware.js';

/**
 * Validate QuizFocus session token claims using HS256 algorithm.
 * @param {string} token - Encoded JWT
 * @param {string} key - Secret signing key
 * @returns {Object} Decoded token claims
 */
export function verifySessionToken(token, key = env.JWT_SECRET) {
  const claims = jwt.verify(token, key, { algorithms: ['HS256'] });
  if (
    !claims ||
    typeof claims.id !== 'string' ||
    !/^[a-f\d]{24}$/i.test(claims.id) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.aud !== undefined ||
    claims.scope !== undefined ||
    claims.iss !== undefined ||
    (claims.sid !== undefined && (typeof claims.sid !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(claims.sid))) ||
    (claims.tokenVersion !== undefined && (!Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0))
  ) {
    throw new Error('Invalid session claims');
  }
  return claims;
}

/**
 * Protect routes — require valid JWT session token.
 */
export const protect = (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Not authenticated. Please log in.', 401));
    }

    const decoded = verifySessionToken(token, env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      role: decoded.role || 'user',
      ...(decoded.email ? { email: decoded.email } : {}),
      ...(decoded.tokenVersion !== undefined ? { tokenVersion: decoded.tokenVersion } : {}),
    };
    req.authSessionId = decoded.sid;
    next();
  } catch (error) {
    return next(new AppError('Invalid or expired token.', 401));
  }
};

/**
 * Optional auth — attach user if valid token exists, proceed as guest otherwise.
 */
export const optionalAuth = (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next();
    }

    const decoded = verifySessionToken(token, env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      role: decoded.role || 'user',
      ...(decoded.email ? { email: decoded.email } : {}),
      ...(decoded.tokenVersion !== undefined ? { tokenVersion: decoded.tokenVersion } : {}),
    };
    req.authSessionId = decoded.sid;
    next();
  } catch {
    next();
  }
};

export default { verifySessionToken, protect, optionalAuth };
