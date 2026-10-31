import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fileTypePackage from 'file-type';
import { AppError } from './error.middleware.js';
import env from '../config/env.js';

const quarantineDirectory = path.join(os.tmpdir(), 'quizfocus-media-quarantine');
const fileTypeFromFile = fileTypePackage.fileTypeFromFile || fileTypePackage.fromFile;
const acceptedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
  'image/svg+xml',
]);

fs.mkdirSync(quarantineDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, quarantineDirectory),
  filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}.upload`),
});

const uploader = multer({
  storage,
  limits: { fileSize: env.MEDIA_MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      callback(new AppError('Only supported image files can be uploaded', 415));
      return;
    }
    callback(null, true);
  },
});

export const receiveImage = (req, res, next) => {
  uploader.single('image')(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Image exceeds the 12MB upload limit', 413));
      }
      return next(error);
    }

    if (!req.file) return next(new AppError('Image file is required', 400));
    next();
  });
};

export const verifyImageSignature = async (req, res, next) => {
  try {
    const detected = await fileTypeFromFile(req.file.path);
    const extension = path.extname(req.file.originalname).toLowerCase();
    const accepted = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg']);

    if (!accepted.has(extension)) {
      await fs.promises.unlink(req.file.path);
      return next(new AppError('Image file extension is not supported', 415));
    }

    if (detected && !acceptedMimeTypes.has(detected.mime)) {
      await fs.promises.unlink(req.file.path);
      return next(new AppError('File contents do not match a supported image', 415));
    }

    req.file.detectedMimeType = detected?.mime || req.file.mimetype;
    next();
  } catch (error) {
    try {
      await fs.promises.unlink(req.file.path);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        return next(new AppError('Image verification failed and quarantine cleanup failed', 500, {
          verificationError: error.message,
          cleanupError: cleanupError.message,
        }));
      }
    }
    next(new AppError('Image verification failed', 400, { reason: error.message }));
  }
};
