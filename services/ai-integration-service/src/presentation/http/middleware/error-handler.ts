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

  const bodyType = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  const appError = error instanceof AppError ? error
    : bodyType === 'entity.parse.failed' ? new AppError('Invalid JSON body', 400, 'VALIDATION_ERROR')
      : bodyType === 'entity.too.large' ? new AppError('Draft request is too large', 413, 'PAYLOAD_TOO_LARGE')
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
    error: { code: appError.code, ...(appError.details ? { details: appError.details } : {}) },
    requestId: res.locals.requestId,
  });
};
