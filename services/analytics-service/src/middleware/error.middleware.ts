import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Centralized error handling middleware.
 */

/**
 * Custom application error class.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly status: 'fail' | 'error';
  readonly isOperational = true;
  readonly errors: unknown;

  constructor(message: string, statusCode: number, errors: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wrap async route handlers to catch errors.
 */
type ApiRequest = Request<Record<string, string>, unknown, unknown>;

export const catchAsync = (fn: (req: ApiRequest, res: Response<unknown>, next: NextFunction) => Promise<unknown>):
  RequestHandler<Record<string, string>, unknown, unknown> => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 404 handler — catch unmatched routes.
 */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    data: null,
    errors: [],
  });
};

/**
 * Global error handler middleware.
 */
export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  const err = typeof error === 'object' && error !== null ? error : {};
  const name = 'name' in err ? err.name : undefined;
  const jwtMessage = name === 'JsonWebTokenError' ? 'Invalid token'
    : name === 'TokenExpiredError' ? 'Token expired' : undefined;
  const status = 'statusCode' in err && typeof err.statusCode === 'number' && Number.isInteger(err.statusCode)
    && err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 500;
  const statusCode = jwtMessage ? 401 : status;
  const message = jwtMessage ?? ('message' in err && typeof err.message === 'string' ? err.message : undefined);
  const errors = !jwtMessage && 'errors' in err ? err.errors : undefined;

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : (message || 'Internal server error'),
    data: null,
    errors: errors || (process.env.NODE_ENV === 'development' && error instanceof Error ? [error.stack] : []),
  });
};

export default { AppError, catchAsync, notFoundHandler, errorHandler };
