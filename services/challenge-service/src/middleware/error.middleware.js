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
  next(new AppError(`Challenge route not found: ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (err, req, res, next) => {
  if (err?.name === 'ValidationError') {
    err.statusCode = 400;
    err.message = Object.values(err.errors || {}).map((item) => item.message).join('; ') || 'Invalid challenge data.';
  } else if (err?.name === 'CastError') {
    err.statusCode = 400;
    err.message = 'Invalid identifier or value.';
  } else if (err?.code === 11000) {
    err.statusCode = 409;
    err.message = 'A record with the same unique value already exists.';
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    console.error('[Challenge Service Error]:', err);
  }

  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.statusCode >= 500 && process.env.NODE_ENV !== 'development'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
