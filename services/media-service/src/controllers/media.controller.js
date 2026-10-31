import fs from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import MediaAsset from '../models/MediaAsset.model.js';
import { AppError } from '../middleware/error.middleware.js';
import {
  getOwnedAsset,
  processImageUpload,
  publicAsset,
  resolveVariant,
  validateImageUrl,
} from '../services/image.service.js';

const assetIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uploadImage = async (req, res, next) => {
  try {
    const asset = await processImageUpload(req.file, req.user.id, req.body.purpose);
    res.status(201).json({ success: true, data: { asset: publicAsset(asset) } });
  } catch (error) {
    try {
      await fs.promises.rm(req.file.path, { force: true });
    } catch (cleanupError) {
      console.error('[Media Service] Temporary upload cleanup failed:', cleanupError.message);
      const details = error.details && typeof error.details === 'object' ? error.details : {};
      error.details = { ...details, cleanupError: cleanupError.message };
    }
    next(error);
  }
};

export const validateUrl = (req, res, next) => {
  try {
    res.json({ success: true, data: validateImageUrl(req.body.url) });
  } catch (error) {
    next(error);
  }
};

export const getAsset = async (req, res, next) => {
  try {
    if (!assetIdPattern.test(req.params.id)) throw new AppError('Invalid media asset ID', 400);
    const asset = await MediaAsset.findById(req.params.id)
      .select('+variants.image.filePath +variants.thumbnail.filePath');
    if (!asset) throw new AppError('Media asset not found', 404);

    const variantName = req.params.variant || 'image';
    if (!['image', 'thumbnail'].includes(variantName)) throw new AppError('Unsupported image variant', 400);
    const variant = await resolveVariant(asset, variantName, req.query.width);

    res.set({
      'Content-Type': variant.mimeType,
      'Content-Length': String(variant.fileSize),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(fs.createReadStream(path.resolve(variant.filePath)), res);
  } catch (error) {
    next(error);
  }
};

export const getMyMedia = async (req, res, next) => {
  try {
    const assets = await MediaAsset.find({ ownerId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: { assets: assets.map(publicAsset) } });
  } catch (error) {
    next(error);
  }
};

export const deleteMyMedia = async (req, res, next) => {
  try {
    if (!assetIdPattern.test(req.params.id)) throw new AppError('Invalid media asset ID', 400);
    const asset = await getOwnedAsset(req.params.id, req.user.id);
    await MediaAsset.deleteOne({ _id: asset._id });

    const paths = [asset.variants.image.filePath, asset.variants.thumbnail.filePath];
    await Promise.all(paths.slice(0, 2).map((filePath) => fs.promises.unlink(filePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    })));
    await fs.promises.rm(path.dirname(asset.variants.image.filePath), { recursive: true, force: true });

    res.json({ success: true, message: 'Media asset deleted' });
  } catch (error) {
    next(error);
  }
};
