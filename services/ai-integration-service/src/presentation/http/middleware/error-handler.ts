import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../../../shared/errors/app-error.js';
import type { Logger } from '../../../shared/logging/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestId: res.locals.requestId,
  });
};

export const createErrorHandler = (logger: Logger): ErrorRequestHandler => (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = error instanceof AppError
    ? error
    : new AppError('Internal service error', 500, 'INTERNAL_ERROR');

  if (appError.statusCode >= 500) {
    logger.error('request.failed', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      code: appError.code,
    });
  }

  res.status(appError.statusCode).json({
    success: false,
    message: appError.message,
    error: { code: appError.code },
    requestId: res.locals.requestId,
  });
};
