import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto, { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import MediaAsset from '../models/MediaAsset.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { assetIdPattern, parseRange } from './clipPolicy.js';
import { validateTransition } from './educationalStateMachine.js';

/**
 * Validates creator storage quotas: single file size, active volume quota, and upload count quota.
 */
export async function checkCreatorQuota(ownerId, incomingFileSize, userRole = 'user') {
  if (
    typeof incomingFileSize !== 'number' ||
    !Number.isFinite(incomingFileSize) ||
    incomingFileSize <= 0
  ) {
    throw new AppError('File size must be a positive number', 400);
  }

  if (incomingFileSize > env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE) {
    const maxMb = Math.round(env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE / (1024 * 1024));
    throw new AppError(`File exceeds maximum limit of ${maxMb}MB`, 413, {
      fileSize: incomingFileSize,
      maxAllowed: env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE,
    });
  }

  // Admins bypass storage volume and count quotas
  if (userRole === 'admin') {
    return { currentBytes: 0, currentCount: 0 };
  }

  const [usage] = await MediaAsset.aggregate([
    {
      $match: {
        ownerId: String(ownerId),
        purpose: 'educational-resource',
        deletedAt: null,
        status: { $nin: ['rejected', 'cancelled'] },
      },
    },
    {
      $group: {
        _id: '$ownerId',
        totalBytes: { $sum: '$sourceSize' },
        assetCount: { $sum: 1 },
      },
    },
  ]);

  const currentBytes = usage?.totalBytes || 0;
  const currentCount = usage?.assetCount || 0;

  if (currentCount + 1 > env.MEDIA_CREATOR_MAX_ASSET_COUNT) {
    throw new AppError('Creator asset count quota exceeded', 429, {
      currentCount,
      limit: env.MEDIA_CREATOR_MAX_ASSET_COUNT,
    });
  }

  if (currentBytes + incomingFileSize > env.MEDIA_CREATOR_MAX_STORAGE_BYTES) {
    throw new AppError('Creator storage volume quota exceeded', 429, {
      currentBytes,
      incomingFileSize,
      limit: env.MEDIA_CREATOR_MAX_STORAGE_BYTES,
    });
  }

  return { currentBytes, currentCount };
}

/**
 * Creates a signed JWT upload token (15m expiry).
 */
export function createSignedUploadToken(assetId, ownerId) {
  return jwt.sign(
    {
      assetId,
      ownerId,
      scope: 'educational-upload',
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      jwtid: randomUUID(),
      audience: 'quizfocus-media',
      issuer: 'quizfocus-media-service',
      expiresIn: '15m',
    }
  );
}

/**
 * Verifies a signed JWT upload token.
 */
export function verifySignedUploadToken(token, assetId) {
  if (!token) throw new AppError('Upload authorization token is required', 401);
  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'quizfocus-media',
      issuer: 'quizfocus-media-service',
    });
  } catch (err) {
    throw new AppError('Upload token expired or invalid', 401);
  }
  if (decoded.scope !== 'educational-upload' || (assetId && decoded.assetId !== assetId)) {
    throw new AppError('Invalid upload token scope or target', 403);
  }
  return decoded;
}

/**
 * Creates a signed JWT access grant (15m expiry).
 */
export function createSignedAccessGrant(assetId, viewerId, role = 'user') {
  return jwt.sign(
    {
      assetId,
      viewerId,
      role,
      scope: 'educational-access',
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      jwtid: randomUUID(),
      audience: 'quizfocus-media',
      issuer: 'quizfocus-media-service',
      expiresIn: '15m',
    }
  );
}

/**
 * Verifies a signed JWT access grant.
 */
export function verifySignedAccessGrant(token, assetId) {
  if (!token) throw new AppError('Access authorization token is required', 401);
  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'quizfocus-media',
      issuer: 'quizfocus-media-service',
    });
  } catch (err) {
    throw new AppError('Access grant expired or invalid', 401);
  }
  if (decoded.scope !== 'educational-access' || (assetId && decoded.assetId !== assetId)) {
    throw new AppError('Invalid access grant scope or target', 403);
  }
  return decoded;
}

const SUPPORTED_KINDS = new Set(['document', 'spreadsheet', 'mcq_bank', 'bundle']);

function inferKind(assetType, mimeType, filename) {
  if (assetType && SUPPORTED_KINDS.has(assetType)) return assetType;
  const mime = String(mimeType || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();

  if (mime.includes('pdf') || ext === '.pdf') return 'document';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['.xlsx', '.xls', '.csv'].includes(ext)
  ) {
    return 'spreadsheet';
  }
  if (mime.includes('json') || ext === '.json') return 'mcq_bank';
  if (mime.includes('zip') || ext === '.zip') return 'bundle';
  return 'document';
}

/**
 * Initiates an educational asset upload session.
 */
export async function initiateEducationalAsset(
  { filename, mimeType, fileSize, checksumSha256, purpose = 'educational-resource', assetType },
  user
) {
  if (!filename || typeof filename !== 'string') {
    throw new AppError('Filename is required', 400);
  }
  if (!mimeType || typeof mimeType !== 'string') {
    throw new AppError('MimeType is required', 400);
  }
  if (purpose !== 'educational-resource') {
    throw new AppError('Invalid purpose for educational asset initiate', 400);
  }

  await checkCreatorQuota(user.id, fileSize, user.role);

  const assetId = randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const uploadToken = createSignedUploadToken(assetId, user.id);
  const uploadUrl = `/api/v1/media/assets/${assetId}/upload?token=${uploadToken}`;
  const kind = inferKind(assetType, mimeType, filename);
  const safeFilename = path.basename(filename);

  const asset = await MediaAsset.create({
    _id: assetId,
    ownerId: user.id,
    kind,
    assetType: kind,
    status: 'initiated',
    purpose: 'educational-resource',
    originalName: safeFilename,
    sourceMimeType: mimeType,
    sourceSize: fileSize,
    fileHash: '',
    checksumSha256: checksumSha256 || null,
    uploadExpiresAt: expiresAt,
    referenceLeaseUntil: expiresAt,
    sanitized: false,
  });

  return {
    assetId: asset._id,
    uploadUrl,
    uploadToken,
    status: 'initiated',
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Saves uploaded binary file to MEDIA_STORAGE_PATH, computes SHA-256 hash, and advances status to 'uploaded'.
 */
export async function saveEducationalAssetUpload(assetId, uploadToken, inputPayload, originalName, clientChecksum) {
  verifySignedUploadToken(uploadToken, assetId);

  if (!assetIdPattern.test(assetId)) {
    throw new AppError('Invalid asset ID', 400);
  }

  const asset = await MediaAsset.findOne({ _id: assetId, deletedAt: null });
  if (!asset) throw new AppError('Asset not found', 404);
  if (asset.status !== 'initiated') {
    throw new AppError(`Asset is not awaiting upload (current status: ${asset.status})`, 409);
  }
  if (asset.uploadExpiresAt && new Date(asset.uploadExpiresAt).getTime() < Date.now()) {
    throw new AppError('Upload session expired', 410);
  }

  const storageRoot = path.resolve(env.MEDIA_STORAGE_PATH);
  const assetDir = path.resolve(storageRoot, assetId);
  if (path.dirname(assetDir) !== storageRoot) {
    throw new AppError('Invalid storage path', 400);
  }
  await fsp.mkdir(assetDir, { recursive: true });

  const ext = path.extname(originalName || asset.originalName || '') || '.bin';
  const targetPath = path.join(assetDir, `source${ext}`);

  const hash = crypto.createHash('sha256');
  let bytesWritten = 0;

  if (Buffer.isBuffer(inputPayload)) {
    bytesWritten = inputPayload.length;
    hash.update(inputPayload);
    await fsp.writeFile(targetPath, inputPayload);
  } else if (typeof inputPayload?.pipe === 'function') {
    const writeStream = fs.createWriteStream(targetPath);
    const passThrough = new Transform({
      transform(chunk, encoding, callback) {
        bytesWritten += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(inputPayload, passThrough, writeStream);
  } else {
    throw new AppError('Invalid upload payload', 400);
  }

  if (bytesWritten <= 0) {
    await fsp.rm(targetPath, { force: true });
    throw new AppError('Upload payload cannot be empty', 400);
  }

  if (bytesWritten > env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE) {
    await fsp.rm(targetPath, { force: true });
    const maxMb = Math.round(env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE / (1024 * 1024));
    throw new AppError(`File exceeds maximum limit of ${maxMb}MB`, 413);
  }

  const sha256Hex = hash.digest('hex');

  const expectedChecksum = clientChecksum || asset.checksumSha256;
  if (expectedChecksum && expectedChecksum.toLowerCase() !== sha256Hex.toLowerCase()) {
    await fsp.rm(targetPath, { force: true });
    throw new AppError('Checksum mismatch: payload corrupt or tampered', 400, {
      expected: expectedChecksum,
      actual: sha256Hex,
    });
  }

  asset.status = 'uploaded';
  asset.fileHash = sha256Hex;
  asset.checksumSha256 = sha256Hex;
  asset.sourcePath = targetPath;
  asset.sourceSize = bytesWritten;
  asset.content = {
    filePath: targetPath,
    mimeType: asset.sourceMimeType,
    fileSize: bytesWritten,
  };
  await asset.save();

  return {
    assetId: asset._id,
    status: 'uploaded',
    fileHash: sha256Hex,
    fileSize: bytesWritten,
  };
}

/**
 * Updates educational asset lifecycle status with deterministic state machine guards.
 */
export async function updateEducationalAssetStatus(
  assetId,
  { status: targetStatus, metadata, previewRef, failureReason, failureCode, leaseToken }
) {
  if (!assetIdPattern.test(assetId)) {
    throw new AppError('Invalid asset ID', 400);
  }

  const asset = await MediaAsset.findOne({ _id: assetId, deletedAt: null }).select('+sourcePath +content.filePath');
  if (!asset) throw new AppError('Asset not found', 404);

  validateTransition(asset.status, targetStatus, asset.processingAttempts);

  const updateSet = { status: targetStatus };
  const updateUnset = {};
  let updateInc = null;

  if (metadata !== undefined) {
    updateSet.metadata =
      typeof metadata === 'object' && metadata !== null
        ? { ...(asset.metadata || {}), ...metadata }
        : metadata;
  }

  if (previewRef !== undefined) {
    updateSet.previewRef = previewRef;
  }

  if (targetStatus === 'ready') {
    updateSet.sanitized = true;
    updateSet.failureReason = '';
    updateSet.failureCode = '';
    updateUnset.processingLeaseUntil = 1;
    updateUnset.processingLeaseToken = 1;
  } else if (targetStatus === 'quarantined') {
    updateSet.quarantinedAt = new Date();
    updateSet.quarantineReason = failureReason || 'Security threat detected';
    updateUnset.processingLeaseUntil = 1;
    updateUnset.processingLeaseToken = 1;

    // Isolate file into quarantine directory
    const sourceFilePath = asset.content?.filePath || asset.sourcePath;
    if (sourceFilePath && fs.existsSync(sourceFilePath)) {
      const quarantineDir = path.resolve(env.MEDIA_STORAGE_PATH, '.quarantine', assetId);
      await fsp.mkdir(quarantineDir, { recursive: true });
      const targetQuarantineFile = path.join(quarantineDir, path.basename(sourceFilePath));
      try {
        await fsp.rename(sourceFilePath, targetQuarantineFile);
        updateSet.quarantinePath = targetQuarantineFile;
        updateSet['content.filePath'] = targetQuarantineFile;
      } catch (moveErr) {
        console.error('[Quarantine] Failed to isolate file:', moveErr.message);
      }
    }
  } else if (targetStatus === 'failed') {
    updateSet.failureReason = failureReason || 'Processing failed';
    updateSet.failureCode = failureCode || 'PROCESSING_FAILED';
    updateInc = { processingAttempts: 1 };
    updateUnset.processingLeaseUntil = 1;
    updateUnset.processingLeaseToken = 1;
  } else if (targetStatus === 'rejected') {
    updateSet.failureReason = failureReason || 'File rejected';
    updateSet.failureCode = failureCode || 'REJECTED';
    updateUnset.processingLeaseUntil = 1;
    updateUnset.processingLeaseToken = 1;
  } else if (targetStatus === 'scanning' || targetStatus === 'processing') {
    const leaseUntil = new Date(Date.now() + env.MEDIA_PROCESS_TIMEOUT_MS);
    updateSet.processingLeaseUntil = leaseUntil;
    if (leaseToken) updateSet.processingLeaseToken = leaseToken;
  }

  const updateOp = { $set: updateSet };
  if (Object.keys(updateUnset).length > 0) updateOp.$unset = updateUnset;
  if (updateInc) updateOp.$inc = updateInc;

  const updated = await MediaAsset.findOneAndUpdate(
    { _id: assetId, status: asset.status, deletedAt: null },
    updateOp,
    { new: true }
  );

  if (!updated) {
    throw new AppError('State transition conflict during concurrent update', 409);
  }

  return { asset: updated, updated: true };
}

/**
 * Generates short-lived signed access grant for an asset.
 */
export async function getEducationalAssetAccess(assetId, viewer) {
  if (!assetIdPattern.test(assetId)) {
    throw new AppError('Invalid asset ID', 400);
  }

  const asset = await MediaAsset.findOne({ _id: assetId, deletedAt: null });
  if (!asset) throw new AppError('Asset not found', 404);

  if (asset.status === 'quarantined') {
    throw new AppError('Asset is quarantined and cannot be accessed', 403);
  }

  if (asset.status !== 'ready') {
    const isOwner = viewer.id && asset.ownerId === viewer.id;
    const isAdmin = viewer.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError('Asset is not ready for public access', 403);
    }
  }

  const accessGrant = createSignedAccessGrant(asset._id, viewer.id, viewer.role);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const accessUrl = `/api/v1/media/assets/${asset._id}/content?access=${encodeURIComponent(accessGrant)}`;

  return {
    assetId: asset._id,
    accessUrl,
    accessGrant,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Streams asset content with HTTP 206 Partial Content range support and hardened security headers.
 */
export async function streamEducationalAssetContent(assetId, grantToken, req, res) {
  if (!assetIdPattern.test(assetId)) {
    throw new AppError('Invalid asset ID', 400);
  }

  verifySignedAccessGrant(grantToken, assetId);

  const asset = await MediaAsset.findOne({ _id: assetId, deletedAt: null }).select('+sourcePath +content.filePath');
  if (!asset) throw new AppError('Asset not found', 404);

  if (asset.status === 'quarantined') {
    throw new AppError('Asset is quarantined and cannot be accessed', 403);
  }

  const filePath = asset.content?.filePath || asset.sourcePath;
  const storageRoot = path.resolve(env.MEDIA_STORAGE_PATH);

  if (!filePath || !path.resolve(filePath).startsWith(storageRoot + path.sep)) {
    throw new AppError('Asset content unavailable', 404);
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    throw new AppError('Asset content unavailable on storage', 404);
  }

  let range;
  try {
    range = parseRange(req.headers.range, stat.size);
  } catch (error) {
    res.set('Content-Range', `bytes */${stat.size}`);
    throw error;
  }

  const safeFilename = (asset.originalName || 'resource').replace(/["\r\n]/g, '_');
  const contentType = asset.sourceMimeType || asset.content?.mimeType || 'application/octet-stream';

  res.set({
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Disposition': `inline; filename="${safeFilename}"`,
  });

  if (range) {
    res.status(206);
    res.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
  }

  res.set('Content-Length', String(range ? range.end - range.start + 1 : stat.size));

  if (req.method === 'HEAD') {
    return res.end();
  }

  try {
    await pipeline(fs.createReadStream(filePath, range || undefined), res);
  } catch (error) {
    if (!res.destroyed) throw error;
  }
}
