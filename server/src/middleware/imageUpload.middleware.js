/**
 * Chat upload middleware using Multer.
 * Configures storage, attachment type validation, and size limits.
 */

import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { AppError } from './error.middleware.js';
import { generateNumericId } from '../utils/generateId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure chat uploads directory exists
const chatUploadPath = path.join(__dirname, '..', 'uploads', 'chat');
if (!fs.existsSync(chatUploadPath)) {
  fs.mkdirSync(chatUploadPath, { recursive: true });
}

// Allowed chat attachment types
const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const FILE_TYPES = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

const ALLOWED_TYPES = { ...IMAGE_TYPES, ...FILE_TYPES };
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const FILE_EXTENSIONS = ['.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
const ALLOWED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...FILE_EXTENSIONS];

export const isImageAttachment = (file = {}) => {
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  return Boolean(IMAGE_TYPES[file.mimetype]) || IMAGE_EXTENSIONS.includes(ext);
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, chatUploadPath);
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
    cb(new AppError(`Invalid attachment format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 400), false);
  }
};

/**
 * Middleware to handle chat attachment uploads (Max 10MB)
 */
export const uploadChatAttachment = (fieldName = 'attachment') => {
  return (req, res, next) => {
    const maxSize = 10 * 1024 * 1024; // 10MB

    const upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: maxSize },
    }).single(fieldName);

    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Attachment too large. Maximum size is 10MB', 413));
        }
        return next(new AppError(err.message, 400));
      }
      if (err) return next(err);
      if (!req.file) return next(new AppError('No attachment uploaded', 400));
      next();
    });
  };
};

export const uploadImage = uploadChatAttachment;

export default { uploadImage, uploadChatAttachment, isImageAttachment };
