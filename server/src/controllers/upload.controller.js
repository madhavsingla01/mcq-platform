/**
 * Upload controller — handles file uploads.
 */

import path from 'path';
import Upload from '../models/Upload.model.js';
import { catchAsync, AppError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/upload
 */
export const uploadFile = catchAsync(async (req, res) => {
  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  const upload = await Upload.create({
    userId: req.user?._id || null,
    fileName: file.filename,
    originalName: file.originalname,
    fileType: ext,
    fileSize: file.size,
    filePath: file.path,
    status: 'uploaded',
    errorLog: req.securityWarning ? [req.securityWarning] : [],
  });

  logger.info(`File uploaded: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB) → ${upload._id}`);

  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    data: {
      upload: {
        id: upload._id,
        originalName: upload.originalName,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        status: upload.status,
        securityWarning: req.securityWarning || null,
      },
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

  res.json({
    success: true,
    data: { upload },
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

  // Only owner can delete
  if (upload.userId && req.user && upload.userId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized to delete this upload', 403));
  }

  await Upload.findByIdAndDelete(req.params.id);

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

export default { uploadFile, getUpload, deleteUpload, getMyUploads };
