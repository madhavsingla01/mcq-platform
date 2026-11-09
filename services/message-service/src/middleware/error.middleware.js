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
    method: req.method
  });
};

/**
 * Global error handler middleware.
 */
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
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

  const status = err.statusCode || 500;
  if (status >= 500) console.error(JSON.stringify({ service: 'message-service', requestId,
    operation: `${req.method} ${req.route?.path || 'request'}`, status, category: err.name }));

  const response = {
    success: false,
    message: status >= 500 ? 'Messaging is temporarily unavailable' : err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message,
    data: null,
    errors: err.errors || [],
    requestId,
  };

  res.status(status).json(response);
};

export default { AppError, catchAsync, notFoundHandler, errorHandler };
