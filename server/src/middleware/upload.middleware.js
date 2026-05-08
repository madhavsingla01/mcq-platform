/**
 * File upload middleware using Multer.
 * Configures storage, file type validation, and size limits.
 */

import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from './error.middleware.js';
import { generateNumericId } from '../utils/generateId.js';
import env from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allowed file types
const ALLOWED_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/json': 'json',
  'text/plain': 'csv',  // Some CSV files are detected as text/plain
};

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.json'];

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'temp');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueId = generateNumericId();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueId}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeValid = ALLOWED_TYPES[file.mimetype];
  const extValid = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeValid || extValid) {
    cb(null, true);
  } else {
    cb(new AppError(`File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 400), false);
  }
};

/**
 * Create upload middleware with dynamic size limit based on auth status.
 */
export const uploadFile = (fieldName = 'file') => {
  return (req, res, next) => {
    const maxSize = req.user ? env.MAX_FILE_SIZE_AUTH : env.MAX_FILE_SIZE_GUEST;

    const upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: maxSize },
    }).single(fieldName);

    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const maxMB = (maxSize / 1024 / 1024).toFixed(1);
          return next(new AppError(`File too large. Maximum size: ${maxMB}MB`, 413));
        }
        return next(new AppError(err.message, 400));
      }
      if (err) return next(err);
      if (!req.file) return next(new AppError('No file uploaded', 400));
      next();
    });
  };
};

export default { uploadFile };
