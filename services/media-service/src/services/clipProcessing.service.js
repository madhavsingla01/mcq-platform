import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import fileTypePackage from 'file-type';
import sharp from 'sharp';
import env from '../config/env.js';
import MediaAsset from '../models/MediaAsset.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { questionAssetFilter, sanitizeWebVtt } from './clipPolicy.js';
import { clipIsReferenced } from './clipAccess.service.js';

const detect = fileTypePackage.fromFile;
const root = path.resolve(env.MEDIA_STORAGE_PATH);
const jobs = new Map();
const queue = [];
let running = false;
let capabilityCheck;
let capabilityCheckedAt = 0;
export function clipDirectory(id) {
  if (!/^[a-f\d-]{36}$/i.test(id)) throw new AppError('Invalid asset ID', 400);
  const directory = path.resolve(root, id);
  if (path.dirname(directory) !== root) throw new AppError('Invalid storage path', 400);
  return directory;
}

export function runMediaTool(binary, args, { timeoutMs = env.MEDIA_PROCESS_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['ignore','pipe','pipe'], signal });
    let stdout = '', stderr = '', ended = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const finish = (error) => {
      if (ended) return; ended = true; clearTimeout(timer);
      if (error) reject(error); else resolve({ stdout, stderr });
    };
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 262144) child.kill('SIGKILL'); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-16384); });
    child.once('error', () => finish(new AppError('Media processor unavailable. Check FFmpeg and FFprobe configuration', 503)));
    child.once('close', code => finish(code === 0 ? null : new AppError('Media could not be safely processed. Check its format, codec and duration', 422)));
  });
}

export function processorAvailable() {
  if (!capabilityCheck || Date.now() - capabilityCheckedAt > 30000) {
    capabilityCheckedAt = Date.now();
    capabilityCheck = Promise.all([
      runMediaTool(env.MEDIA_FFMPEG_PATH, ['-version'], { timeoutMs: 5000 }),
      runMediaTool(env.MEDIA_FFPROBE_PATH, ['-version'], { timeoutMs: 5000 }),
    ]).then(() => true, () => false);
  }
  return capabilityCheck;
}

export async function inspectClip(file, kind, signal) {
  const detected = await detect(file.path);
  const formats = new Map([
    ['audio/mpeg','mp3'],['audio/wav','wav'],['audio/x-wav','wav'],['audio/vnd.wave','wav'],['audio/ogg','ogg'],['audio/opus','ogg'],
    ['audio/mp4','mov'],['video/mp4','mov'],['video/webm','matroska'],['audio/webm','matroska'],
  ]);
  const format = formats.get(detected?.mime);
  if (!format) throw new AppError('Supported clips are MP3, WAV, Ogg, M4A, MP4 and WebM', 415);
  const result = await runMediaTool(env.MEDIA_FFPROBE_PATH,[
    '-v','error','-protocol_whitelist','file,pipe','-f',format,'-show_streams','-show_format','-of','json',file.path,
  ],{timeoutMs:15000,signal});
  let metadata;
  try { metadata = JSON.parse(result.stdout); } catch { throw new AppError('Invalid media stream information',422); }
  const streams = metadata.streams || [];
  const video = streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const audio = streams.find(stream => stream.codec_type === 'audio');
  const duration = Number(metadata.format?.duration);
  const audioCodecs = ['aac','mp3','pcm_s16le','pcm_s24le','pcm_f32le','opus','vorbis'];
  const videoCodecs = ['h264','hevc','vp8','vp9','av1'];
  if (!Number.isFinite(duration) || duration <= 0 || duration > env.MEDIA_CLIP_MAX_DURATION_SECONDS) throw new AppError(`Clips must be between 0 and ${env.MEDIA_CLIP_MAX_DURATION_SECONDS} seconds`,400);
  if (kind === 'audio' && (!audio || video) || kind === 'video' && !video ||
    audio && !audioCodecs.includes(audio.codec_name) || video && !videoCodecs.includes(video.codec_name) ||
    video && (video.width > 3840 || video.height > 2160) || streams.length > 8) throw new AppError('Unsupported clip tracks, codec or dimensions',415);
  return { format, mime: detected.mime, duration, hasAudio: Boolean(audio), width: video?.width || 0, height: video?.height || 0 };
}

export const withoutLease = (field, now) => ({$or:[{[field]:{$lte:now}},{[field]:{$exists:false}}]});

const availableJobs = now => ({
  kind: { $in: ['audio','video'] },
  deletedAt: null,
  $and: [withoutLease('removalLeaseUntil',now)],
  $or: [{ status: 'queued' }, { status: 'processing', processingLeaseUntil: { $lte: now } },
    { status: 'processing', processingLeaseUntil: { $exists: false } }],
});

async function processAsset(id) {
  const now = new Date();
  const token = randomUUID();
  const lease = { _id: id, processingLeaseToken: token, deletedAt: null, status: 'processing' };
  const asset = await MediaAsset.findOneAndUpdate({ _id: id, ...availableJobs(now) }, {
    $set: { status: 'processing', processingLeaseToken: token, processingLeaseUntil: new Date(+now + env.MEDIA_PROCESS_TIMEOUT_MS + 60000) },
    $inc: { processingAttempts: 1 },
  }, { new: true }).select('+sourcePath');
  if (!asset) return;
  const controller = new AbortController(); jobs.set(id,controller);
  const output = path.join(clipDirectory(id), token + (asset.kind === 'audio' ? '.m4a' : '.mp4'));
  try {
    if (asset.processingAttempts > 3) throw new AppError('Processing attempt limit reached',409);
    const info = await inspectClip({path:asset.sourcePath},asset.kind,controller.signal);
    const input = ['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-f',info.format,'-i',asset.sourcePath];
    const encoding = asset.kind === 'audio'
      ? ['-map','0:a:0','-vn','-c:a','aac','-b:a','128k']
      : ['-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-vf',"scale=w='min(1280,iw)':h=-2",'-r','30','-c:a','aac','-b:a','128k'];
    await runMediaTool(env.MEDIA_FFMPEG_PATH,[...input,...encoding,'-map_metadata','-1','-map_chapters','-1','-sn','-dn','-t',String(env.MEDIA_CLIP_MAX_DURATION_SECONDS),'-fs',String(env.MEDIA_CLIP_MAX_FILE_SIZE * 2),'-movflags','+faststart',output],{signal:controller.signal});
    const stat = await fs.stat(output);
    const result = await MediaAsset.updateOne(lease,{
      $set:{status:'ready',failureCode:'',sanitized:true,content:{filePath:output,mimeType:asset.kind==='audio'?'audio/mp4':'video/mp4',fileSize:stat.size,duration:info.duration,width:info.width,height:info.height,hasAudio:info.hasAudio}},
      $unset:{processingLeaseUntil:1,processingLeaseToken:1},
    });
    const unusedFile = result.modifiedCount ? asset.sourcePath : output;
    await fs.rm(unusedFile,{force:true}).catch(() => console.error('Unable to remove an unused clip file'));
  } catch {
    const failed=await MediaAsset.updateOne(lease,{
      $set:{status:'failed',failureCode:'PROCESSING_FAILED'},$unset:{processingLeaseUntil:1,processingLeaseToken:1},
    });
    const retained = !failed.modifiedCount && await MediaAsset.exists({_id:id,status:'ready','content.filePath':output});
    if (!retained) await fs.rm(output,{force:true}).catch(() => console.error('Unable to remove an incomplete clip file'));
  } finally { jobs.delete(id); }
}

async function drain() {
  if (running) return;
  running = true;
  try { while (queue.length) await processAsset(queue.shift()); }
  finally { running = false; }
}
export function enqueueClip(id) {
  if (!queue.includes(id) && !jobs.has(id)) queue.push(id);
  drain().catch(() => console.error(JSON.stringify({service:'media-service',operation:'clip-queue',category:'processing-failed'})));
}

async function encodeQuestionImage(file) {
  const options = { failOn: 'error', limitInputPixels: 40000000 };
  try {
    const input = await fs.readFile(file.path);
    const metadata = await sharp(input, options).metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) {
      throw new AppError('Use a JPEG, PNG, WebP, or GIF image', 415);
    }
    const pages = metadata.pages || 1;
    const pixels = metadata.width * (metadata.pageHeight || metadata.height) * pages;
    if (pages > 120 || pixels > options.limitInputPixels) {
      throw new AppError('Image exceeds the decoded size limit or the 120-frame animation limit', 413);
    }
    const animated = pages > 1;
    let image = sharp(input, { ...options, animated });
    if (!animated) image = image.rotate();
    const { data, info } = await image
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > env.MEDIA_MAX_FILE_SIZE) throw new AppError('Optimized image exceeds the upload limit', 413);
    return { data, width: info.width, height: info.pageHeight || info.height, animated, sourceMime: `image/${metadata.format}` };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Image could not be safely decoded', 400);
  }
}

export async function acceptClip(file, kind, ownerId, requestKey) {
  if (!file || !['audio','video','image','captions'].includes(kind)) throw new AppError('Choose one audio, video, image, or WebVTT file',400);
  const limit = { captions: env.MEDIA_CAPTION_MAX_FILE_SIZE, image: env.MEDIA_MAX_FILE_SIZE }[kind] ?? env.MEDIA_CLIP_MAX_FILE_SIZE;
  if (file.size < 1 || file.size > limit) throw new AppError('Media exceeds its configured upload limit or is empty',413);
  if (requestKey && !/^[a-z\d_-]{8,100}$/i.test(requestKey)) throw new AppError('Invalid upload request ID',400);
  // A caller can retry an interrupted response with the same opaque upload ID.
  if (requestKey) {
    const existing = await MediaAsset.findOne({ownerId,'uploadRequestId':requestKey,deletedAt:null});
    if (existing) {
      if (existing.kind !== kind) throw new AppError('Upload request ID is already used for a different media type',409);
      return existing;
    }
  }
  let captions, image, info;
  if (kind === 'captions') captions = sanitizeWebVtt(await fs.readFile(file.path),env.MEDIA_CLIP_MAX_DURATION_SECONDS);
  else if (kind === 'image') image = await encodeQuestionImage(file);
  else info = await inspectClip(file,kind);
  const ready = Boolean(captions || image);
  const id = randomUUID(), directory = clipDirectory(id);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file.path)) hash.update(chunk);
  await fs.mkdir(directory,{recursive:true});
  const sourcePath = path.join(directory,'source.bin');
  try {
    if (!ready) await fs.rename(file.path, sourcePath);
    let content;
    if (captions) {
      const filePath = path.join(directory,'captions.vtt');
      await fs.writeFile(filePath,captions.text,'utf8');
      content = {filePath,mimeType:'text/vtt; charset=utf-8',fileSize:Buffer.byteLength(captions.text),duration:captions.duration,hasAudio:false};
    }
    if (image) {
      const filePath = path.join(directory, 'image.webp');
      await fs.writeFile(filePath, image.data);
      content = { filePath, mimeType: 'image/webp', fileSize: image.data.length, width: image.width, height: image.height, animated: image.animated };
    }
    const asset = await MediaAsset.create({_id:id,ownerId,kind,purpose:'quiz-clip',status:ready?'ready':'queued',sourcePath:ready?undefined:sourcePath,
      uploadRequestId:requestKey || undefined,originalName:path.basename(file.originalname || 'clip').slice(0,255),sourceMimeType:captions?'text/vtt':image?.sourceMime || info.mime,
      sourceSize:file.size,fileHash:hash.digest('hex'),sanitized:ready,content});
    if (!ready) enqueueClip(id);
    return asset;
  } catch (error) {
    await fs.rm(directory,{recursive:true,force:true});
    if (error.code === 11000 && requestKey) {
      const existing = await MediaAsset.findOne({ ownerId, uploadRequestId: requestKey, deletedAt: null });
      if (existing?.kind === kind) return existing;
      throw new AppError('Upload request ID is no longer available. Choose the file again',409);
    }
    throw error;
  }
}

export async function removeUnusedClip(asset, cancelPending = false) {
  const now = new Date();
  const token = randomUUID();
  const claim=await MediaAsset.findOneAndUpdate({
    _id:asset._id, deletedAt:null, $and:[withoutLease('referenceLeaseUntil',now),withoutLease('removalLeaseUntil',now)],
  },{$set:{removalLeaseUntil:new Date(+now+60000),removalLeaseToken:token}},{new:true});
  if(!claim)throw new AppError('This clip is being saved. Try removing it after the save completes',409);
  const lock={_id:asset._id,removalLeaseToken:token};
  try {
    if (await clipIsReferenced(String(asset._id), !cancelPending)) {
      throw new AppError('This clip is retained by a draft, published quiz or attempt. Remove the reference before deleting it',409);
    }
    const removed=await MediaAsset.updateOne({...lock,removalLeaseUntil:{$gt:new Date()}},{
      $set:{status:'cancelled',deletedAt:new Date()},$unset:{removalLeaseUntil:1,removalLeaseToken:1},
    });
    if(!removed.modifiedCount)throw new AppError('Clip removal timed out. Try again',409);
  } finally {
    await MediaAsset.updateOne(lock,{$unset:{removalLeaseUntil:1,removalLeaseToken:1}});
  }
  jobs.get(String(asset._id))?.abort();
  if (!claim.processingLeaseUntil || claim.processingLeaseUntil <= now) {
    await fs.rm(clipDirectory(String(asset._id)),{recursive:true,force:true}).catch(() => console.error('Clip removal will be retried by cleanup'));
  }
}

export async function recoverClipJobs() {
  const rows = await MediaAsset.find(availableJobs(new Date())).limit(100).select('_id');
  rows.forEach(row=>enqueueClip(String(row._id)));
}
export async function cleanupAbandonedClips() {
  const before = new Date(Date.now()-env.MEDIA_ABANDONED_DAYS*86400000);
  const rows = MediaAsset.find({...questionAssetFilter,createdAt:{$lt:before},deletedAt:null}).select('_id').cursor();
  for await (const asset of rows) {
    if (jobs.has(String(asset._id))) continue;
    try { await removeUnusedClip(asset); }
    catch (error) { if (error.statusCode !== 409) throw error; }
  }
  const removed = await MediaAsset.find({...questionAssetFilter,status:'cancelled',deletedAt:{$lt:before}}).limit(100).select('_id');
  for (const asset of removed) {
    if (jobs.has(String(asset._id))) continue;
    await fs.rm(clipDirectory(String(asset._id)),{recursive:true,force:true});
    await MediaAsset.deleteOne({_id:asset._id,status:'cancelled'});
  }
  const incoming = path.join(root,'.incoming');
  const entries = await fs.readdir(incoming).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries.filter(name => /^[a-f\d-]{36}\.upload$/i.test(name))) {
    const file = path.join(incoming,entry);
    const stat = await fs.lstat(file).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (stat?.isFile() && stat.mtime < before) await fs.rm(file,{force:true});
  }
}
