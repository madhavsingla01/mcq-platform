import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import env from '../config/env.js';
import MediaAsset from '../models/MediaAsset.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { assetIds, assetIdPattern, publicClip, parseRange, questionAssetFilter } from '../services/clipPolicy.js';
import { acceptClip, enqueueClip, processorAvailable, removeUnusedClip, withoutLease } from '../services/clipProcessing.service.js';
import { mediaViewer, authorizeClips, playbackGrant, authorizedDelivery, setGuestMediaSession } from '../services/clipAccess.service.js';
import { downloadLinkedImage } from '../services/linkedImage.service.js';

const incoming = path.join(path.resolve(env.MEDIA_STORAGE_PATH),'.incoming');
const storage = multer.diskStorage({
  destination: (req,file,done)=>fsp.mkdir(incoming,{recursive:true}).then(()=>done(null,incoming),done),
  filename: (req,file,done)=>done(null,randomUUID()+'.upload'),
});
const upload = multer({ storage, limits:{ fileSize:Math.max(env.MEDIA_CLIP_MAX_FILE_SIZE, env.MEDIA_MAX_FILE_SIZE, env.MEDIA_CAPTION_MAX_FILE_SIZE),files:1,fields:5,fieldSize:2000 } }).single('file');
export const receiveClip = (req,res,next)=>upload(req,res,error=>{
  if(error) return next(error);
  if(!req.file) return next(new AppError('Choose a file to upload',400));
  next();
});
const endpoint = fn => (req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const owned = async req => {
  if(!assetIdPattern.test(req.params.id || '')) throw new AppError('Invalid asset ID',400);
  const asset=await MediaAsset.findOne({_id:req.params.id,ownerId:req.mediaViewer.id,...questionAssetFilter,deletedAt:null}).select('+sourcePath');
  if(!asset) throw new AppError('Clip not found',404);
  return asset;
};

export const clipCapabilities = endpoint(async(req,res)=>{
  res.json({success:true,data:{maxFileSize:env.MEDIA_CLIP_MAX_FILE_SIZE,maxCaptionSize:env.MEDIA_CAPTION_MAX_FILE_SIZE,
    maxImageSize:env.MEDIA_MAX_FILE_SIZE,maxDurationSeconds:env.MEDIA_CLIP_MAX_DURATION_SECONDS,maxPrimaryClipsPerItem:3,
    formats:{audio:['.mp3','.wav','.ogg','.m4a','.webm'],video:['.mp4','.webm'],image:['.jpg','.jpeg','.png','.webp','.gif'],captions:['.vtt']},
    processorReady:await processorAvailable(),output:{audio:'audio/mp4',video:'video/mp4',image:'image/webp',captions:'text/vtt'}}});
});

export const uploadClip = endpoint(async(req,res)=>{
  try {
    if (['audio', 'video'].includes(req.body.kind)) {
      const active=await MediaAsset.countDocuments({ownerId:req.mediaViewer.id,status:{$in:['queued','processing']},deletedAt:null});
      if(active>=12) throw new AppError('Wait for your current clips to finish processing before uploading more',429);
    }
    const asset=await acceptClip(req.file,req.body.kind,req.mediaViewer.id,req.body.uploadRequestId);
    res.status(asset.status==='ready'?201:202).json({success:true,data:{asset:publicClip(asset)}});
  } finally { if(req.file?.path) await fsp.rm(req.file.path,{force:true}); }
});
export const importClipImage = endpoint(async (req, res) => {
  await fsp.mkdir(incoming, { recursive: true });
  const destination = path.join(incoming, randomUUID() + '.upload');
  const controller = new AbortController();
  res.once('close', () => controller.abort());
  try {
    const file = await downloadLinkedImage(req.body.url, destination, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
    const asset = await acceptClip(file, 'image', req.mediaViewer.id, req.body.uploadRequestId);
    res.status(201).json({ success: true, data: { asset: publicClip(asset) } });
  } finally {
    await fsp.rm(destination, { force: true });
  }
});
export const getClip = endpoint(async(req,res)=>res.json({success:true,data:{asset:publicClip(await owned(req))}}));
export const retryClip = endpoint(async(req,res)=>{
  const asset=await owned(req);
  if(asset.status!=='failed') throw new AppError('Only a failed clip can be retried',409);
  if(asset.processingAttempts>=3) throw new AppError('Choose a new file after three failed processing attempts',409);
  try { await fsp.access(asset.sourcePath); } catch { throw new AppError('Choose the file again to retry this upload',409); }
  asset.status='queued';asset.failureCode='';await asset.save();enqueueClip(String(asset._id));
  res.status(202).json({success:true,data:{asset:publicClip(asset)}});
});
export const deleteClip = endpoint(async(req,res)=>{
  await removeUnusedClip(await owned(req),req.query.pending==='true');res.json({success:true,message:'Unused clip removed'});
});

export const validateClipReferences = endpoint(async(req,res)=>{
  const ids=assetIds(req.body.assetIds);
  const now = new Date();
  const leased=await MediaAsset.updateMany({
    _id:{$in:ids}, ownerId:req.mediaViewer.id, deletedAt:null, $and:[questionAssetFilter,withoutLease('removalLeaseUntil',now)],
  },{$set:{referenceLeaseUntil:new Date(+now+120000)}});
  if(leased.matchedCount!==ids.length)throw new AppError('Only your own available clips may be attached',403);
  const assets=await MediaAsset.find({_id:{$in:ids},ownerId:req.mediaViewer.id,...questionAssetFilter,deletedAt:null});
  if(assets.length!==ids.length) throw new AppError('Only your own uploaded clips may be attached',403);
  res.json({success:true,data:{assets:assets.map(publicClip)}});
});

export const requestClipAccess = endpoint(async(req,res)=>{
  const ids=assetIds(req.body.assetIds,16),viewer=await mediaViewer(req);
  const context={quizId:req.body.quizId || null,attemptId:req.body.attemptId || null};
  const assets=await authorizeClips(ids,context,viewer);
  if(!viewer.id)setGuestMediaSession(res,viewer.sessionId);
  res.set('Cache-Control','no-store').json({success:true,data:{assets:Object.fromEntries(assets.map(asset=>[String(asset._id),{
    ...publicClip(asset),url:`/api/v1/media/clips/${asset._id}/content?access=${encodeURIComponent(playbackGrant(String(asset._id),context,viewer))}`,
  }]))}});
});

export const streamClip = endpoint(async(req,res)=>{
  if(!assetIdPattern.test(req.params.id || '')) throw new AppError('Invalid asset ID',400);
  const asset=await authorizedDelivery(req.params.id,req.query.access,req);
  const filePath=asset.content?.filePath;
  const root=path.resolve(env.MEDIA_STORAGE_PATH);
  if(!filePath || !path.resolve(filePath).startsWith(root+path.sep)) throw new AppError('Clip is unavailable',404);
  let stat;
  try {stat=await fsp.stat(filePath);} catch {throw new AppError('Clip is unavailable. Its text equivalent is still available',404);}
  let range;
  try {range=parseRange(req.headers.range,stat.size);} catch(error){res.set('Content-Range',`bytes */${stat.size}`);throw error;}
  const filename = { captions: 'captions.vtt', audio: 'audio.m4a', video: 'clip.mp4', image: 'image.webp' }[asset.kind];
  res.set({'Content-Type':asset.content.mimeType,'Accept-Ranges':'bytes','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Disposition':`inline; filename="${filename}"`});
  if(range){res.status(206);res.set('Content-Range',`bytes ${range.start}-${range.end}/${stat.size}`);}
  res.set('Content-Length',String(range?range.end-range.start+1:stat.size));
  if(req.method==='HEAD') return res.end();
  try {await pipeline(fs.createReadStream(filePath,range || undefined),res);} catch(error){if(!res.destroyed)throw error;}
});
