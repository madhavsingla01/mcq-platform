import type { RequestHandler } from 'express';
import { GetCurrentUser } from '../../../application/use-cases/get-current-user.js';
import { AppError, InternalApiError } from '../../../shared/errors/app-error.js';

export const authenticate = (getCurrentUser: GetCurrentUser): RequestHandler => (req, res, next) => {
  const hasBearer = typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ');
  const hasCookie = typeof req.headers.cookie === 'string' && req.headers.cookie.includes('accessToken=');

  if (!hasBearer && !hasCookie) {
    next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
    return;
  }

  getCurrentUser.execute(req.headers, String(res.locals.requestId))
    .then((user) => {
      res.locals.user = user;
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof InternalApiError && (error.statusCode === 401 || error.statusCode === 403)) {
        next(new AppError(
          error.statusCode === 401 ? 'Authentication required' : 'Access denied',
          error.statusCode,
          error.statusCode === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        ));
        return;
      }

      next(new AppError('Authentication service is temporarily unavailable', 503, 'DEPENDENCY_UNAVAILABLE'));
    });
};
