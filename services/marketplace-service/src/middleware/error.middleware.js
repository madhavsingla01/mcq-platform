/**
 * Centralized error handling middleware.
 */

/**
 * Custom application error class.
 */
export class AppError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wrap async route handlers to catch errors.
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 404 handler — catch unmatched routes.
 */
export const notFoundHandler = (req, res, next) => {
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
export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    err = new AppError('Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    err = new AppError('Token expired', 401);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isInternal500 = err.statusCode >= 500;

  const response = {
    success: false,
    message: isInternal500 && isProduction ? 'Internal server error' : (err.message || 'Internal server error'),
    data: null,
    errors: err.errors || (process.env.NODE_ENV === 'development' ? [err.stack] : []),
  };

  res.status(err.statusCode).json(response);
};

export default { AppError, catchAsync, notFoundHandler, errorHandler };
