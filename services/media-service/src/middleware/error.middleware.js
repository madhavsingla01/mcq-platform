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
  console.error(JSON.stringify({ service: 'media-service', method: req.method, path: req.path, status: statusCode, category: error.name }));

  const isInternal500 = statusCode >= 500;

  res.status(statusCode).json({
    success: false,
    message: isInternal500 ? 'Media is temporarily unavailable' : (error.message || 'Media processing failed'),
    errors: !isInternal500 && error.details ? [error.details] : [],
  });
};
