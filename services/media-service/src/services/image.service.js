import crypto from 'crypto';
import net from 'net';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import MediaAsset from '../models/MediaAsset.model.js';
import env from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

const MAX_PIXELS = 40000000;
const MAX_IMAGE_WIDTH = 2560;
const THUMBNAIL_WIDTH = 480;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'tiff']);
const ALLOWED_PURPOSES = new Set(['quiz-cover', 'challenge-cover', 'profile-avatar', 'profile-banner', 'question-media']);
const storageRoot = path.resolve(env.MEDIA_STORAGE_PATH);

const safeUnlink = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const normalizeName = (name) => path.basename(String(name || 'image')).slice(0, 255);

const makeVariant = async (inputBuffer, outputPath, width, quality) => {
  const result = await sharp(inputBuffer, { failOn: 'error', limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toFile(outputPath);

  return {
    fileName: path.basename(outputPath),
    filePath: outputPath,
    mimeType: 'image/webp',
    fileSize: result.size,
    width: result.width,
    height: result.height,
  };
};

export const processImageUpload = async (file, ownerId, purpose) => {
  if (!file) throw new AppError('Image file is required', 400);
  if (!ALLOWED_PURPOSES.has(purpose)) throw new AppError('Unsupported media purpose', 400);
  if (!file.size || file.size > env.MEDIA_MAX_FILE_SIZE) {
    throw new AppError('Image is empty or exceeds the 12MB upload limit', 413);
  }

  let inputBuffer;
  let metadata;
  try {
    inputBuffer = await fs.readFile(file.path);
    metadata = await sharp(inputBuffer, { failOn: 'error', limitInputPixels: MAX_PIXELS }).metadata();
  } catch (error) {
    throw new AppError('Image could not be safely decoded', 400, {
      code: 'IMAGE_DECODE_FAILED',
      reason: error.message,
    });
  }

  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw new AppError('Unsupported or invalid image format', 415);
  }

  const id = crypto.randomUUID();
  const assetDirectory = path.join(storageRoot, id);
  const stagingDirectory = path.join(storageRoot, '.staging', id);
  const stagedImagePath = path.join(stagingDirectory, 'image.webp');
  const stagedThumbnailPath = path.join(stagingDirectory, 'thumbnail.webp');
  const imagePath = path.join(assetDirectory, 'image.webp');
  const thumbnailPath = path.join(assetDirectory, 'thumbnail.webp');

  await fs.mkdir(stagingDirectory, { recursive: true });

  let imageVariant;
  let thumbnailVariant;
  try {
    imageVariant = await makeVariant(inputBuffer, stagedImagePath, MAX_IMAGE_WIDTH, 84);
    thumbnailVariant = await makeVariant(inputBuffer, stagedThumbnailPath, THUMBNAIL_WIDTH, 78);
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.rename(stagedImagePath, imagePath);
    await fs.rename(stagedThumbnailPath, thumbnailPath);
  } catch (error) {
    await Promise.all([
      safeUnlink(stagedImagePath),
      safeUnlink(stagedThumbnailPath),
      safeUnlink(imagePath),
      safeUnlink(thumbnailPath),
    ]);
    await fs.rm(stagingDirectory, { recursive: true, force: true });
    throw new AppError('Image could not be safely processed', 400, {
      code: 'IMAGE_PROCESSING_FAILED',
      reason: error.message,
    });
  } finally {
    await safeUnlink(file.path);
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }

  imageVariant.filePath = imagePath;
  thumbnailVariant.filePath = thumbnailPath;

  const imageBuffer = await fs.readFile(imagePath);
  const asset = new MediaAsset({
    _id: id,
    ownerId,
    purpose,
    originalName: normalizeName(file.originalname),
    sourceMimeType: metadata.format === 'svg' ? 'image/svg+xml' : `image/${metadata.format}`,
    sourceSize: file.size,
    fileHash: crypto.createHash('sha256').update(imageBuffer).digest('hex'),
    width: metadata.width,
    height: metadata.height,
    sanitized: true,
    variants: { image: imageVariant, thumbnail: thumbnailVariant },
  });

  try {
    await asset.save();
  } catch (error) {
    await fs.rm(assetDirectory, { recursive: true, force: true });
    throw error;
  }

  return asset;
};

export const getOwnedAsset = async (assetId, ownerId) => {
  const asset = await MediaAsset.findById(assetId)
    .select('+variants.image.filePath +variants.thumbnail.filePath');
  if (!asset) throw new AppError('Media asset not found', 404);
  if (asset.ownerId !== ownerId) throw new AppError('Not authorized to manage this media asset', 403);
  return asset;
};

export const validateImageUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new AppError('A valid image URL is required', 400);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError('Image URL is not valid', 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  const normalizedHost = hostname.replace(/^\[|\]$/g, '');
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    net.isIP(normalizedHost) ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new AppError('Use a public HTTPS image URL', 400);
  }

  const extension = path.extname(parsed.pathname).toLowerCase();
  const supported = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg']);
  if (extension && !supported.has(extension)) {
    throw new AppError('Image URL must point to a supported image format', 415);
  }

  return {
    valid: true,
    url: parsed.toString(),
    host: hostname,
    extension: extension || null,
    secure: true,
  };
};

export const resolveVariant = async (asset, variant, requestedWidth) => {
  const source = variant === 'thumbnail' ? asset.variants.thumbnail : asset.variants.image;
  const width = requestedWidth
    ? Math.min(Math.max(Number.parseInt(requestedWidth, 10) || MAX_IMAGE_WIDTH, 64), MAX_IMAGE_WIDTH)
    : source.width;

  if (width >= source.width) return source;

  const variantPath = path.join(path.dirname(source.filePath), `width-${width}.webp`);
  try {
    await fs.access(variantPath);
    const stats = await fs.stat(variantPath);
    return {
      filePath: variantPath,
      mimeType: 'image/webp',
      fileSize: stats.size,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const temporaryPath = `${variantPath}.${crypto.randomUUID()}.tmp`;
  try {
    const result = await sharp(source.filePath, { failOn: 'error', limitInputPixels: MAX_PIXELS })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(temporaryPath);
    await fs.rename(temporaryPath, variantPath);
    return {
      filePath: variantPath,
      mimeType: 'image/webp',
      fileSize: result.size,
    };
  } catch (error) {
    await safeUnlink(temporaryPath);
    throw error;
  }
};

export const publicAsset = (asset) => ({
  id: String(asset._id),
  purpose: asset.purpose,
  originalName: asset.originalName,
  mimeType: asset.variants.image.mimeType,
  sourceMimeType: asset.sourceMimeType,
  sourceSize: asset.sourceSize,
  optimizedSize: asset.variants.image.fileSize,
  thumbnailSize: asset.variants.thumbnail.fileSize,
  width: asset.variants.image.width,
  height: asset.variants.image.height,
  sanitized: asset.sanitized,
  url: `/media/assets/${asset._id}/image`,
  thumbnailUrl: `/media/assets/${asset._id}/thumbnail`,
  createdAt: asset.createdAt,
});

export const mediaStorageRoot = storageRoot;
