export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Admin API route not found: ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (err, req, res, next) => {
  // Mongoose validation error -> 400
  if (err?.name === 'ValidationError') {
    err.statusCode = 400;
    err.status = 'fail';
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    err.message = messages.join('; ') || 'Validation failed';
  } else if (err?.name === 'CastError') {
    err.statusCode = 400;
    err.status = 'fail';
    err.message = `Invalid identifier: ${err.value}`;
  } else if (err?.code === 11000) {
    err.statusCode = 409;
    err.status = 'fail';
    err.message = 'A record with the specified unique key already exists';
  } else if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    err.statusCode = 401;
    err.status = 'fail';
    err.message = 'Invalid or expired authentication token';
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    console.error('[Admin Service Error]:', err);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isInternal500 = err.statusCode >= 500;

  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: isInternal500 && isProduction ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
