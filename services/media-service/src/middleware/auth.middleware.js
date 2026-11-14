import { requireMediaAuthor } from '../services/clipAccess.service.js';

export const requireAuth = (req, res, next) => {
  if (req.user) return next();
  return requireMediaAuthor(req, res, (error) => {
    if (error) return next(error);
    req.user = req.mediaViewer;
    next();
  });
};
