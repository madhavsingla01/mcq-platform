import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  readonly status: 'fail' | 'error';
  readonly isOperational = true;

  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.status = String(statusCode).startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

type AdminRequest = Request<Record<string, string>, unknown, unknown>;

export const catchAsync = (
  handler: (req: AdminRequest, res: Response<unknown>, next: NextFunction) => Promise<void>,
): RequestHandler<Record<string, string>, unknown, unknown> =>
  (req, res, next) => { handler(req, res, next).catch(next); };

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(`Admin API route not found: ${req.method} ${req.originalUrl}`, 404));
};

function readError(value: unknown) {
  const err = typeof value === 'object' && value !== null ? value : {};
  const code = 'statusCode' in err && typeof err.statusCode === 'number' &&
    Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 500;
  if ('name' in err && err.name === 'ValidationError') {
    const fields = 'errors' in err && typeof err.errors === 'object' && err.errors !== null ? err.errors : {};
    const messages = Object.values(fields).flatMap((field: unknown) =>
      typeof field === 'object' && field !== null && 'message' in field && typeof field.message === 'string'
        ? [field.message] : []);
    return new AppError(messages.join('; ') || 'Validation failed', 400);
  }
  if ('name' in err && err.name === 'CastError') {
    return new AppError(`Invalid identifier: ${'value' in err ? String(err.value) : ''}`, 400);
  }
  if ('code' in err && err.code === 11000) return new AppError('A record with the specified unique key already exists', 409);
  if ('name' in err && ['JsonWebTokenError', 'TokenExpiredError'].includes(String(err.name))) {
    return new AppError('Invalid or expired authentication token', 401);
  }
  return {
    statusCode: code,
    status: 'status' in err && typeof err.status === 'string' && err.status ? err.status : 'error',
    message: 'message' in err && typeof err.message === 'string' && err.message ? err.message : 'Internal Server Error',
  };
}

export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  const { statusCode, status, message } = readError(error);
  const development = process.env.NODE_ENV === 'development';
  if (development) console.error('[Admin Service Error]:', error);

  res.status(statusCode).json({
    success: false,
    status,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message,
    ...(development && error instanceof Error ? { stack: error.stack } : {}),
  });
};
