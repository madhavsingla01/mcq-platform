import { verifySessionToken, isCurrentSession } from '../utils/sessionToken.js';
import env from '../config/env.js';
import User from '../models/User.model.js';
import { AppError } from './error.middleware.js';

export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401));
    }

    const decoded = verifySessionToken(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshToken +sessions');

    if (!user || user.isDeleted || user.isActive === false) {
      return next(new AppError('User account not found or has been deactivated.', 401));
    }

    if (user.isSuspended) {
      return next(new AppError(`Account is suspended: ${user.suspensionReason || 'Contact support'}`, 403));
    }

    if (!isCurrentSession(user, decoded)) {
      return next(new AppError('Session has been revoked. Please log in again.', 401));
    }

    req.authSessionId = decoded.sid;
    user.sessions = undefined;
    req.user = user;
    next();
  } catch (error) {
    return next(new AppError('Invalid or expired authentication session.', 401));
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = verifySessionToken(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -refreshToken +sessions');
      if (user && !user.isDeleted && user.isActive !== false && !user.isSuspended &&
          isCurrentSession(user, decoded)) {
        user.sessions = undefined;
        req.user = user;
      }
    }
  } catch {}
  next();
};
