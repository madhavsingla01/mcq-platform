import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  readonly status: 'fail' | 'error';
  readonly isOperational = true;

  constructor(message: string, readonly statusCode: number, readonly errors: unknown = null) {
    super(message);
    this.status = String(statusCode).startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

type QuizRequest = Request<Record<string, string>, unknown, unknown>;

export const catchAsync = (handler: (req: QuizRequest, res: Response<unknown>, next: NextFunction) => Promise<unknown>):
  RequestHandler<Record<string, string>, unknown, unknown> =>
  (req, res, next) => { handler(req, res, next).catch(next); };

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
};

function normalizeError(error: unknown) {
  const details = typeof error === 'object' && error !== null ? error : {};
  const name = 'name' in details ? details.name : undefined;
  const code = 'code' in details ? details.code : undefined;
  if (name === 'ValidationError') {
    const errors = 'errors' in details && typeof details.errors === 'object' && details.errors !== null ? details.errors : {};
    const messages = Object.values(errors).flatMap((value: unknown) =>
      typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
        ? [value.message] : []);
    return new AppError('Validation failed', 400, messages);
  }
  if (code === 11000) {
    const keys = 'keyValue' in details && typeof details.keyValue === 'object' && details.keyValue !== null
      ? Object.keys(details.keyValue) : [];
    return new AppError(`Duplicate value for field: ${keys[0] ?? 'unique key'}`, 400);
  }
  if (name === 'CastError') {
    const field = 'path' in details ? String(details.path) : 'identifier';
    const value = 'value' in details ? String(details.value) : '';
    return new AppError(`Invalid ${field}: ${value}`, 400);
  }
  if (name === 'JsonWebTokenError') return new AppError('Invalid token', 401);
  if (name === 'TokenExpiredError') return new AppError('Token expired', 401);
  if (code === 'LIMIT_FILE_SIZE') return new AppError('File too large', 413);
  const status = 'statusCode' in details && typeof details.statusCode === 'number' &&
    Number.isInteger(details.statusCode) && details.statusCode >= 400 && details.statusCode <= 599 ? details.statusCode : 500;
  return {
    statusCode: status,
    message: 'message' in details && typeof details.message === 'string' ? details.message : 'Internal server error',
    errors: 'errors' in details ? details.errors : undefined,
  };
}

export const errorHandler = (error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  console.error('[API ERROR]', req.method, req.originalUrl, error);
  const { statusCode, message, errors } = normalizeError(error);

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    data: null,
    errors: errors || (process.env.NODE_ENV === 'development' && error instanceof Error ? [error.stack] : []),
  });
};

export default { AppError, catchAsync, notFoundHandler, errorHandler };
