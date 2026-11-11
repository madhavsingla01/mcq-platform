/**
 * JWT Authentication middleware.
 * Reads tokens from httpOnly cookies.
 */

import { verifySessionToken, isCurrentSession } from '../utils/sessionToken.js';
import crypto from 'crypto';
import { AppError } from './error.middleware.js';
import env from '../config/env.js';
import User from '../models/User.model.js';

/**
 * Protect routes — require valid JWT.
 */
export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Not authenticated. Please log in.', 401));
    }

    const decoded = verifySessionToken(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshToken +sessions');

    if (!user || user.isDeleted || user.isActive === false) {
      return next(new AppError('User no longer exists or account has been deleted.', 401));
    }

    if (user.isSuspended) {
      return next(new AppError(`Account is suspended: ${user.suspensionReason || 'Please contact platform administration.'}`, 403));
    }

    // Auto-backfill userCode for existing accounts if missing
    if (!user.userCode) {
      user.userCode = `USR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      user.save({ validateBeforeSave: false }).catch(() => {});
    }

    // Check token version to invalidate revoked sessions
    if (!isCurrentSession(user, decoded)) {
      return next(new AppError('Session invalidated. Please log in again.', 401));
    }

    req.authSessionId = decoded.sid;
    req.activeSessions = user.sessions || [];
    user.sessions = undefined;
    req.user = user;
    next();
  } catch (error) {
    return next(new AppError('Invalid or expired token.', 401));
  }
};

/**
 * Optional auth — attach user if token exists, but don't block.
 * Used for routes that work for both guests and authenticated users.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next();
    }

    const decoded = verifySessionToken(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshToken +sessions');

    if (user && !user.isDeleted && user.isActive !== false && !user.isSuspended &&
        isCurrentSession(user, decoded)) {
      req.authSessionId = decoded.sid;
      user.sessions = undefined;
      req.user = user;
    }

    return next();
  } catch (error) {
    // If the access token is expired or invalid, we simply proceed as a guest.
    // We shouldn't throw a 401 for optional routes, otherwise it breaks guest access
    // when an old cookie is present.
    return next();
  }
};

/**
 * Role-based access control.
 * @param  {...string} roles - Allowed roles
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

export default { protect, optionalAuth, restrictTo };
