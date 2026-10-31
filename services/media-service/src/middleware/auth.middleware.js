import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AppError } from './error.middleware.js';

export const requireAuth = (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.accessToken || bearer;

  if (!token) return next(new AppError('Authentication is required to upload media', 401));

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded.id) throw new Error('Token subject missing');
    req.user = { id: String(decoded.id) };
    next();
  } catch {
    next(new AppError('Invalid or expired authentication token', 401));
  }
};
