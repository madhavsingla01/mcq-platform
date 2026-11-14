import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import env from '../config/env.js';
import MediaAsset from '../models/MediaAsset.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { assetIdPattern } from '../services/clipPolicy.js';
import {
  initiateEducationalAsset,
  saveEducationalAssetUpload,
  updateEducationalAssetStatus,
  getEducationalAssetAccess,
  streamEducationalAssetContent,
} from '../services/educationalAsset.service.js';

const tempUploadDir = path.join(os.tmpdir(), 'quizfocus-educational-uploads');
try {
  fs.mkdirSync(tempUploadDir, { recursive: true });
} catch {
  // ignore if directory exists
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempUploadDir),
  filename: (req, file, cb) => cb(null, `${randomUUID()}.upload`),
});

const uploadSingle = multer({
  storage,
  limits: { fileSize: env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE },
}).single('file');

export const receiveEducationalUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    return uploadSingle(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File exceeds maximum limit of 50MB', 413));
        }
        return next(err);
      }
      next();
    });
  }
  next();
};

export const initiateAsset = async (req, res, next) => {
  try {
    const result = await initiateEducationalAsset(req.body, req.user);
    res.status(201).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadAsset = async (req, res, next) => {
  let tempFilePath = req.file?.path || null;
  try {
    const token =
      req.query.token ||
      req.headers['x-upload-token'] ||
      req.headers.authorization?.replace(/^Bearer /, '');

    const clientChecksum =
      req.headers['x-checksum-sha256'] ||
      req.headers['x-file-hash'] ||
      req.query.checksumSha256;

    let payload;
    let originalName;

    if (req.file) {
      payload = fs.createReadStream(req.file.path);
      originalName = req.file.originalname;
    } else {
      payload = req;
      originalName = req.headers['x-filename'] || req.query.filename || 'source.bin';
    }

    const result = await saveEducationalAssetUpload(
      req.params.id,
      token,
      payload,
      originalName,
      clientChecksum
    );

    res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    next(error);
  } finally {
    if (tempFilePath) {
      await fsp.rm(tempFilePath, { force: true }).catch(() => {});
    }
  }
};

export const getAssetStatus = async (req, res, next) => {
  try {
    if (!assetIdPattern.test(req.params.id)) {
      throw new AppError('Invalid asset ID', 400);
    }
    const asset = await MediaAsset.findOne({ _id: req.params.id, deletedAt: null });
    if (!asset) throw new AppError('Asset not found', 404);

    res.status(200).json({
      success: true,
      data: { asset },
      asset,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAssetStatus = async (req, res, next) => {
  try {
    const result = await updateEducationalAssetStatus(req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAssetAccess = async (req, res, next) => {
  try {
    const result = await getEducationalAssetAccess(req.params.id, req.user);
    res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const streamAssetContent = async (req, res, next) => {
  try {
    const grant =
      req.query.access ||
      req.query.grant ||
      req.headers['x-access-grant'] ||
      req.headers.authorization?.replace(/^Bearer /, '');

    await streamEducationalAssetContent(req.params.id, grant, req, res);
  } catch (error) {
    next(error);
  }
};
