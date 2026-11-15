import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Centralized error handling middleware.
 */

/**
 * Custom application error class.
 */
export class AppError extends Error {
  readonly status: 'fail' | 'error';
  readonly isOperational = true;

  constructor(message: string, readonly statusCode: number, readonly errors: unknown = null) {
    super(message);
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wrap async route handlers to catch errors.
 */
export const catchAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 404 handler â€” catch unmatched routes.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    method: req.method
  });
};

/**
 * Global error handler middleware.
 */
export const errorHandler: ErrorRequestHandler = (input: unknown, req, res, next) => {
  if (res.headersSent) return next(input);
  let err = describeError(input);
  const requestId = req.get('x-request-id');

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    err = new AppError('Invalid message data', 400);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    err = new AppError('Message data conflicts with an existing record', 409);
  }

  // Mongoose cast error (invalid ID)
  if (err.name === 'CastError') {
    err = new AppError('Invalid identifier', 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    err = new AppError('Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    err = new AppError('Token expired', 401);
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    err = new AppError('File too large', 413);
  }

  const status = typeof err.statusCode === 'number' && Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 500;
  const route: unknown = req.route;
  if (status >= 500) console.error(JSON.stringify({ service: 'message-service', requestId,
    operation: `${req.method} ${route && typeof route === 'object' && 'path' in route && typeof route.path === 'string' ? route.path : 'request'}`, status, category: err.name }));

  const response = {
    success: false,
    message: status >= 500 ? 'Messaging is temporarily unavailable' : err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message,
    data: null,
    errors: err.errors || [],
    requestId,
  };

  res.status(status).json(response);
};

interface ErrorDetails {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  type?: unknown;
  code?: unknown;
  errors?: unknown;
}

function describeError(value: unknown): ErrorDetails {
  return typeof value === 'object' && value !== null ? value : {};
}

export default { AppError, catchAsync, notFoundHandler, errorHandler };
