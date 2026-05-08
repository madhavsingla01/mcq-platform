/**
 * JWT Authentication middleware.
 * Reads tokens from httpOnly cookies.
 */

import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware.js';
import env from '../config/env.js';
import User from '../models/User.model.js';

/**
 * Protect routes — require valid JWT.
 */
export const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;

    if (!token) {
      return next(new AppError('Not authenticated. Please log in.', 401));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshToken');

    if (!user) {
      return next(new AppError('User no longer exists.', 401));
    }

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
    const token = req.cookies?.accessToken;

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -refreshToken');
      if (user) {
        req.user = user;
      }
    }
  } catch (error) {
    // Token invalid — continue as guest
  }
  next();
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
