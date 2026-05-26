import express from 'express';
import fs from 'fs';
import { isImageAttachment, uploadChatAttachment, uploadImage } from '../middleware/imageUpload.middleware.js';
import { protect } from '../middleware/auth.middleware.js';
import { uploadRateLimit } from '../middleware/rateLimit.middleware.js';
import { AppError } from '../middleware/error.middleware.js';
import QuizSession from '../models/QuizSession.model.js';
import { getSessionAccess, isSessionCreator } from '../utils/sessionSettings.js';

const router = express.Router();

router.get('/', (req, res) => {
  return res.json({
    success: true,
    message: 'Chat API working',
  });
});

const removeUploadedFile = (file) => {
  if (!file?.path) return;
  fs.promises.unlink(file.path).catch(() => {});
};

const validateChatUpload = async (req, res, next) => {
  try {
    const sessionId = req.body?.sessionId;
    if (!sessionId) {
      removeUploadedFile(req.file);
      return next(new AppError('Session ID is required for chat uploads', 400));
    }

    const session = await QuizSession.findById(sessionId);
    const access = getSessionAccess(session, req.user);
    if (!access.allowed) {
      removeUploadedFile(req.file);
      return next(new AppError(access.message, access.status));
    }

    if (session.settings?.chatSettings === 'disabled') {
      removeUploadedFile(req.file);
      return next(new AppError('Chat is disabled for this session.', 403));
    }

    if (session.settings?.chatSettings === 'read_only' && !isSessionCreator(session, req.user)) {
      removeUploadedFile(req.file);
      return next(new AppError('Chat is read-only for participants.', 403));
    }

    if (session.settings?.chatFileSharing === 'text_only') {
      removeUploadedFile(req.file);
      return next(new AppError('File sharing is disabled for this session.', 403));
    }

    if (session.settings?.chatFileSharing === 'images_only' && !isImageAttachment(req.file)) {
      removeUploadedFile(req.file);
      return next(new AppError('Only images can be shared in this session.', 403));
    }

    next();
  } catch (error) {
    removeUploadedFile(req.file);
    next(error);
  }
};

const sendAttachmentResponse = (req, res) => {
  const file = req.file;
  const attachmentUrl = `/uploads/chat/${file.filename}`;
  const isImage = isImageAttachment(file);
  
  res.status(201).json({
    success: true,
    data: {
      attachmentUrl,
      imageUrl: isImage ? attachmentUrl : null,
      attachmentName: file.originalname,
      attachmentType: file.mimetype,
      attachmentSize: file.size,
      isImage,
    }
  });
};

router.post(
  '/attachment',
  uploadRateLimit,
  protect,
  uploadChatAttachment('attachment'),
  validateChatUpload,
  sendAttachmentResponse
);

router.post(
  '/image',
  uploadRateLimit,
  protect,
  uploadImage('image'),
  validateChatUpload,
  sendAttachmentResponse
);

export default router;
