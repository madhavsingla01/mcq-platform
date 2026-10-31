/**
 * Upload controller — handles file uploads.
 */

import path from 'path';
import fs from 'fs/promises';
import Upload from '../models/Upload.model.js';
import { catchAsync, AppError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';
import { calculateFileHash, findDuplicateQuiz } from '../services/upload/fileHash.service.js';
import { assertUploadAccess } from '../utils/authorizeUpload.js';

/**
 * POST /api/upload
 */
export const uploadFile = catchAsync(async (req, res) => {
  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const fileHash = await calculateFileHash(file.path);

  const duplicateQuiz = await findDuplicateQuiz({
    fileHash,
    uploaderId: req.user?._id || null,
  });

  const upload = await Upload.create({
    userId: req.user?._id || null,
    guestSessionId: req.user
      ? null
      : req.headers['x-client-session-id'] || req.headers['x-quiz-session-id'] || null,
    fileName: file.filename,
    originalName: file.originalname,
    fileType: ext,
    mimeType: req.detectedMimeType || 'application/octet-stream',
    fileSize: file.size,
    originalFileSize: file.size,
    filePath: file.path,
    fileHash,
    purpose: 'quiz-dataset',
    sanitizationStatus: req.sanitizationStatus || 'validated',
    status: 'uploaded',
    errorLog: req.securityWarning ? [req.securityWarning] : [],
  });

  logger.info(`File uploaded: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB) [hash: ${fileHash.slice(0, 8)}...] → ${upload._id}`);

  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    data: {
      upload: {
        id: upload._id,
        originalName: upload.originalName,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        fileHash: upload.fileHash,
        status: upload.status,
        securityWarning: req.securityWarning || null,
      },
      duplicateQuiz: duplicateQuiz
        ? {
            id: duplicateQuiz._id,
            title: duplicateQuiz.title,
            questionCount: duplicateQuiz.questionCount,
            createdAt: duplicateQuiz.createdAt,
          }
        : null,
    },
  });
});

/**
 * GET /api/upload/:id/duplicate
 */
export const checkUploadDuplicate = catchAsync(async (req, res, next) => {
  const upload = await Upload.findById(req.params.id);
  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  assertUploadAccess(upload, req);

  const fileHash = upload.fileHash || (await calculateFileHash(upload.filePath));
  if (!upload.fileHash) {
    upload.fileHash = fileHash;
    await upload.save();
  }

  const duplicateQuiz = await findDuplicateQuiz({
    fileHash,
    uploaderId: req.user?._id || upload.userId || null,
  });

  res.json({
    success: true,
    data: {
      isDuplicate: Boolean(duplicateQuiz),
      fileHash,
      duplicateQuiz: duplicateQuiz
        ? {
            id: duplicateQuiz._id,
            title: duplicateQuiz.title,
            questionCount: duplicateQuiz.questionCount,
            createdAt: duplicateQuiz.createdAt,
          }
        : null,
    },
  });
});

/**
 * GET /api/upload/:id
 */
export const getUpload = catchAsync(async (req, res, next) => {
  const upload = await Upload.findById(req.params.id);

  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  assertUploadAccess(upload, req);

  const safeUpload = upload.toObject();
  delete safeUpload.filePath;

  res.json({
    success: true,
    data: { upload: safeUpload },
  });
});

/**
 * DELETE /api/upload/:id
 */
export const deleteUpload = catchAsync(async (req, res, next) => {
  const upload = await Upload.findById(req.params.id);

  if (!upload) {
    return next(new AppError('Upload not found', 404));
  }

  assertUploadAccess(upload, req);

  await Upload.findByIdAndDelete(req.params.id);
  await fs.rm(upload.filePath, { force: true });

  res.json({
    success: true,
    message: 'Upload deleted',
  });
});

/**
 * GET /api/upload/my
 */
export const getMyUploads = catchAsync(async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, data: { uploads: [] } });
  }

  const uploads = await Upload.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('-parsedData');

  res.json({
    success: true,
    data: { uploads },
  });
});

export default { uploadFile, checkUploadDuplicate, getUpload, deleteUpload, getMyUploads };
