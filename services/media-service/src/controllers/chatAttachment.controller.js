import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import multer from 'multer';
import fileType from 'file-type';
import env from '../config/env.js';
import { getContentDb } from '../config/db.js';
import { AppError } from '../middleware/error.middleware.js';
import MediaAsset from '../models/MediaAsset.model.js';
import { acceptClip, clipDirectory } from '../services/clipProcessing.service.js';
import { assetIdPattern, parseRange } from '../services/clipPolicy.js';

const MAX_BYTES = 15 * 1024 * 1024;
const purpose = 'chat-attachment';
const chatKinds = ['image', 'audio', 'video', 'document'];
const objectId = value => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new AppError('Invalid conversation or message ID', 400);
  return new mongoose.Types.ObjectId(value);
};
const database = () => {
  const db = getContentDb();
  if (!db) throw new AppError('Chat media is temporarily unavailable', 503);
  return db;
};
const endpoint = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
async function verifyConversation(req) {
  const id = objectId(req.params.conversationId);
  if (!await database().collection('conversations').findOne({
    _id: id, participants: objectId(req.mediaViewer.id),
  }, { projection: { _id: 1 } })) throw new AppError('Conversation not found', 404);
  return String(id);
}

const incoming = path.join(path.resolve(env.MEDIA_STORAGE_PATH), '.incoming');
const receive = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => fsp.mkdir(incoming, { recursive: true }).then(() => done(null, incoming), done),
    filename: (_req, _file, done) => done(null, randomUUID() + '.upload'),
  }),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 1, fieldSize: 24 },
}).single('file');

export const prepareChatUpload = endpoint(async (req, res, next) => {
  req.chatConversationId = await verifyConversation(req);
  const count = await MediaAsset.countDocuments({
    ownerId: req.mediaViewer.id, purpose, createdAt: { $gte: new Date(Date.now() - 86_400_000) },
  });
  if (count >= 30) throw new AppError('Daily chat upload limit reached', 429);
  receive(req, res, next);
});

async function acceptDocument(file, ownerId, conversationId) {
  const content = await fsp.readFile(file.path);
  const extension = path.extname(file.originalname).toLowerCase();
  let mimeType;
  if (extension === '.pdf' && /^%PDF-[12]\.\d/.test(content.subarray(0, 8).toString('ascii'))) {
    mimeType = 'application/pdf';
  } else if (extension === '.xlsx' && (await fileType.fromBuffer(content).catch(() => null))?.ext === 'xlsx') {
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (['.txt', '.csv'].includes(extension) && content.length <= 1024 * 1024) {
    try {
      const value = new TextDecoder('utf-8', { fatal: true }).decode(content);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error();
      mimeType = extension === '.csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8';
    } catch {
      throw new AppError('Text attachments must be plain UTF-8', 415);
    }
  } else {
    throw new AppError('Use a PDF, XLSX, or a UTF-8 TXT or CSV file up to 1 MB', 415);
  }
  const id = randomUUID();
  const folder = clipDirectory(id);
  const filePath = path.join(folder, 'document.bin');
  await fsp.mkdir(folder, { recursive: false });
  try {
    await fsp.writeFile(filePath, content, { flag: 'wx' });
    return await MediaAsset.create({
      _id: id, ownerId, conversationId, kind: 'document', purpose, status: 'ready',
      originalName: path.basename(file.originalname).slice(0, 255), sourceSize: file.size, sourceMimeType: mimeType,
      fileHash: createHash('sha256').update(content).digest('hex'), sanitized: false,
      content: { filePath, mimeType, fileSize: content.length },
    });
  } catch (error) {
    await fsp.rm(folder, { recursive: true, force: true });
    throw error;
  }
}

function attachmentMetadata(asset) {
  return {
    id: String(asset._id), kind: asset.kind, status: asset.status, fileName: asset.originalName,
    fileSize: asset.content?.fileSize || asset.sourceSize, mimeType: asset.content?.mimeType || asset.sourceMimeType,
  };
}

function binding(asset) {
  return jwt.sign({
    ...attachmentMetadata(asset), ownerId: asset.ownerId, conversationId: asset.conversationId,
  }, env.JWT_SECRET, { algorithm: 'HS256', issuer: 'quizfocus-media-service', audience: 'quizfocus-chat-attachment', expiresIn: '10m' });
}

export const uploadChatAttachment = endpoint(async (req, res) => {
  try {
    const kind = req.body.kind;
    if (!req.file?.size || !chatKinds.includes(kind)) throw new AppError('Choose an image, audio, video or document to attach', 400);
    const asset = kind === 'document'
      ? await acceptDocument(req.file, req.mediaViewer.id, req.chatConversationId)
      : await acceptClip(req.file, kind, req.mediaViewer.id, undefined, req.chatConversationId);
    res.set('Cache-Control', 'no-store').status(asset.status === 'ready' ? 201 : 202).json({
      success: true, data: attachmentMetadata(asset),
    });
  } finally {
    if (req.file?.path) await fsp.rm(req.file.path, { force: true });
  }
});

export const getChatAttachmentStatus = endpoint(async (req, res) => {
  const conversationId = await verifyConversation(req);
  if (!assetIdPattern.test(req.params.assetId)) throw new AppError('Invalid attachment ID', 400);
  const asset = await MediaAsset.findOne({ _id: req.params.assetId, purpose, conversationId, ownerId: req.mediaViewer.id, deletedAt: null });
  if (!asset || Date.now() - asset.createdAt.getTime() > 86_400_000) throw new AppError('Attachment not found or expired', 404);
  res.set('Cache-Control', 'no-store').json({
    success: true, data: { ...attachmentMetadata(asset), ...(asset.status === 'ready' ? { proof: binding(asset) } : {}) },
  });
});

export const streamChatAttachment = endpoint(async (req, res) => {
  const conversationId = await verifyConversation(req);
  if (!assetIdPattern.test(req.params.assetId)) throw new AppError('Invalid attachment ID', 400);
  const message = await database().collection('messages').findOne({
    _id: objectId(req.params.messageId), conversation: objectId(conversationId), 'media.assetId': req.params.assetId,
    isDeleted: { $ne: true }, deletedFor: { $ne: objectId(req.mediaViewer.id) },
  }, { projection: { sender: 1 } });
  if (!message) throw new AppError('Attachment not found', 404);
  const asset = await MediaAsset.findOne({
    _id: req.params.assetId, purpose, conversationId, ownerId: String(message.sender), status: 'ready', deletedAt: null,
  }).select('+content.filePath');
  const file = asset?.content?.filePath;
  if (!file || path.dirname(path.resolve(file)) !== clipDirectory(req.params.assetId)) throw new AppError('Attachment not found', 404);
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat) throw new AppError('Attachment no longer available', 404);
  let range;
  try { range = parseRange(req.headers.range, stat.size); }
  catch (error) { res.set('Content-Range', `bytes */${stat.size}`); throw error; }
  const safeName = asset.originalName.replace(/[^a-z\d._ -]/gi, '_').trim() || 'attachment';
  const disposition = asset.kind === 'document' ? `attachment; filename="${safeName}"` : 'inline';
  res.set({
    'Content-Type': asset.content.mimeType,
    'Content-Disposition': disposition, 'Content-Security-Policy': 'sandbox',
    'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
  });
  res.set('Content-Length', String(range ? range.end - range.start + 1 : stat.size));
  if (range) res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
  if (req.method === 'HEAD') return res.end();
  try { await pipeline(fs.createReadStream(file, range || undefined), res); }
  catch (error) { if (!res.destroyed) throw error; }
});

export async function cleanChatAttachments() {
  const rows = await MediaAsset.find({
    purpose, createdAt: { $lt: new Date(Date.now() - 2 * 86_400_000) },
    updatedAt: { $lt: new Date(Date.now() - 86_400_000) },
    status: { $nin: ['queued', 'processing'] }, deletedAt: null,
  }).limit(100).select('_id').sort({ updatedAt: 1 });
  for (const row of rows) {
    if (await database().collection('messages').findOne({ 'media.assetId': row._id, isDeleted: { $ne: true } }, { projection: { _id: 1 } })) {
      await MediaAsset.updateOne({ _id: row._id }, { $set: { updatedAt: new Date() } });
      continue;
    }
    await fsp.rm(clipDirectory(row._id), { recursive: true, force: true });
    await MediaAsset.deleteOne({ _id: row._id, purpose });
  }
}
