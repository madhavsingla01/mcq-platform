export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const statusCode = error.statusCode || (error.name === 'MulterError' ? 413 : 500);
  console.error('[Media Service]', req.method, req.originalUrl, error.message);
  if (error.details) console.error('[Media Service] Error details:', error.details);
  res.status(statusCode).json({
    success: false,
    message: error.message || 'Media processing failed',
    errors: error.details ? [error.details] : [],
  });
};
