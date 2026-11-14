import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  constructor(message: string, public statusCode = 500, public details: unknown = null) {
    super(message);
  }
}

export const errorHandler = (error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);

  const record = typeof error === 'object' && error !== null ? error : {};
  const status = 'statusCode' in record ? record.statusCode : undefined;
  const category = 'name' in record && typeof record.name === 'string' ? record.name : 'Error';
  const message = 'message' in record && typeof record.message === 'string' ? record.message : '';
  const details = 'details' in record ? record.details : undefined;
  const statusCode = typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : category === 'MulterError' ? 413 : 500;
  console.error(JSON.stringify({ service: 'media-service', method: req.method, path: req.path, status: statusCode, category }));

  const isInternal500 = statusCode >= 500;

  res.status(statusCode).json({
    success: false,
    message: isInternal500 ? 'Media is temporarily unavailable' : (message || 'Media processing failed'),
    errors: !isInternal500 && details ? [details] : [],
  });
};
