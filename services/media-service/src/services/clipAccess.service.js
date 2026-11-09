import mongoose from 'mongoose';
import { verifySessionToken } from '../utils/sessionToken.js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import env from '../config/env.js';
import { getContentDb } from '../config/db.js';
import MediaAsset from '../models/MediaAsset.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { assetIds, questionAssetFilter, referencedAssets } from './clipPolicy.js';

const id = value => String(value?._id || value || '');
const oid = value => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new AppError('Invalid quiz or attempt identifier', 400);
  return new mongoose.Types.ObjectId(value);
};
const database = () => {
  const db = getContentDb();
  if (!db) throw new AppError('Media authorization is temporarily unavailable', 503);
  return db;
};
const currentUser = async (userId, tokenVersion) => {
  const user = await database().collection('users').findOne({ _id: oid(userId) }, { projection: { role: 1, isActive: 1, isDeleted: 1, isSuspended: 1, tokenVersion: 1 } });
  if (!user || user.isDeleted || user.isActive === false || user.isSuspended || (tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) throw new AppError('Authentication session is unavailable', 401);
  return { id: id(user._id), role: user.role, tokenVersion: user.tokenVersion || 0 };
};

export async function mediaViewer(req) {
  const token = req.cookies?.accessToken || req.headers.authorization?.replace(/^Bearer /, '');
  if (token) {
    let decoded;
    try { decoded = verifySessionToken(token, env.JWT_SECRET); } catch { throw new AppError('Authentication session expired', 401); }
    if (!decoded.id || decoded.aud || decoded.scope) throw new AppError('Invalid authentication token', 401);
    return currentUser(String(decoded.id), decoded.tokenVersion);
  }
  const sessionId = req.headers['x-quiz-session-id'] || req.headers['x-client-session-id'];
  return { sessionId: typeof sessionId === 'string' && sessionId.length >= 8 && sessionId.length <= 200 ? sessionId : null };
}

export async function requireMediaAuthor(req, res, next) {
  try {
    req.mediaViewer = await mediaViewer(req);
    if (!req.mediaViewer.id) throw new AppError('Sign in to upload or manage media', 401);
    if (req.cookies?.accessToken && !['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && !env.CLIENT_URL.includes(origin)) throw new AppError('Request origin is not allowed', 403);
      const csrf = req.cookies.csrfToken;
      if (!csrf || csrf !== req.headers['x-csrf-token']) throw new AppError('Invalid CSRF token', 403);
    }
    next();
  } catch (error) { next(error); }
}

export async function authorizeClips(requestedIds, context, viewer) {
  const ids = assetIds(requestedIds);
  if (!ids.length) return [];
  const assets = await MediaAsset.find({ _id: { $in: ids }, ...questionAssetFilter, deletedAt: null }).select('+content.filePath');
  if (assets.length !== ids.length || assets.some(asset => asset.status !== 'ready')) throw new AppError('One or more clips are unavailable', 404);
  if (!context.quizId && !context.attemptId) {
    if (!viewer.id || assets.some(asset => asset.ownerId !== viewer.id)) throw new AppError('Media access denied', 403);
    return assets;
  }
  const db = database();
  let attempt;
  if (context.attemptId) {
    attempt = await db.collection('attempts').findOne({ _id: oid(context.attemptId) }, {
      projection: { quizId: 1, userId: 1, sessionId: 1, 'questionSnapshot.accessibilityMedia': 1, 'questionSnapshot.options.accessibilityMedia': 1 },
    });
    if (!attempt) throw new AppError('Attempt not found', 404);
  }
  const quizId = id(attempt?.quizId) || context.quizId;
  if (context.quizId && attempt && context.quizId !== id(attempt.quizId)) throw new AppError('Media access denied', 403);
  const quiz = await db.collection('quizzes').findOne({ _id: oid(quizId) });
  if (!quiz) throw new AppError('Quiz not found', 404);
  const owner = viewer.id && id(quiz.uploader) === viewer.id;
  const admin = viewer.role === 'admin';
  const ownsAttempt = attempt && (viewer.id ? id(attempt.userId) === viewer.id : !attempt.userId && viewer.sessionId && attempt.sessionId === viewer.sessionId);
  if (attempt && !ownsAttempt && !owner && !admin) throw new AppError('Attempt access denied', 403);
  const publiclyAvailable = !quiz.isRestricted && quiz.visibility !== 'private' && quiz.accessType !== 'invite_only' &&
    quiz.metadata?.savedAsDraft !== true && !(quiz.isChallenge && ['draft','publishing'].includes(quiz.challengeStatus)) &&
    (['public','unlisted'].includes(quiz.visibility) || quiz.isPublic === true);
  if (!owner && !admin && (quiz.isRestricted || (!publiclyAvailable && !ownsAttempt))) throw new AppError('Quiz media access denied', viewer.id ? 403 : 401);
  const questions = attempt?.questionSnapshot?.length ? attempt.questionSnapshot
    : await db.collection('questions').find({ quizId: quiz._id }, {
      projection: { accessibilityMedia: 1, 'options.accessibilityMedia': 1 },
    }).toArray();
  const permitted = referencedAssets(questions);
  if (assets.some(asset => !permitted.has(String(asset._id)) || asset.ownerId !== id(quiz.uploader))) throw new AppError('Media is not attached to this quiz version', 403);
  return assets;
}

export function playbackGrant(assetId, context, viewer) {
  return jwt.sign({ assetId, quizId: context.quizId || null, attemptId: context.attemptId || null,
    viewerId: viewer.id || null, tokenVersion: viewer.tokenVersion || 0, sessionId: viewer.sessionId || null,
    scope: 'clip-playback' }, env.JWT_SECRET, { algorithm: 'HS256', jwtid:randomUUID(), audience: 'quizfocus-media', issuer: 'quizfocus-media-service', expiresIn: '5m' });
}

export async function authorizedDelivery(assetId, token, req) {
  let grant;
  try { grant = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], audience: 'quizfocus-media', issuer: 'quizfocus-media-service' }); }
  catch { throw new AppError('Playback access expired. Retry to request access again', 401); }
  if (grant.scope !== 'clip-playback' || grant.assetId !== assetId) throw new AppError('Media access denied', 403);
  let viewer;
  if(grant.viewerId) {
    viewer=await mediaViewer(req);
    if(viewer.id!==grant.viewerId || viewer.tokenVersion!==grant.tokenVersion) throw new AppError('Playback access belongs to another session',403);
  } else {
    if(grant.sessionId) {
      let session;
      try {session=jwt.verify(req.cookies?.quizMediaSession,env.JWT_SECRET,{audience:'quizfocus-media-session',issuer:'quizfocus-media-service',algorithms:['HS256']});} catch {throw new AppError('Media session expired. Retry playback',401);}
      if(session.sessionId!==grant.sessionId) throw new AppError('Playback access belongs to another session',403);
    }
    viewer={sessionId:grant.sessionId};
  }
  return (await authorizeClips([assetId], grant, viewer))[0];
}

export function setGuestMediaSession(res,sessionId) {
  if(!sessionId) return;
  const token=jwt.sign({sessionId},env.JWT_SECRET,{algorithm:'HS256',audience:'quizfocus-media-session',issuer:'quizfocus-media-service',expiresIn:'30m'});
  res.cookie('quizMediaSession',token,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'lax',path:'/api/v1/media/clips',maxAge:1800000});
}

export async function clipIsReferenced(assetId, includePending = true) {
  const db = database();
  const paths = ['accessibilityMedia','options.accessibilityMedia'];
  const fields = ['assetId','captionAssetId','describedAssetId', 'describedCaptionAssetId',...(includePending?['pendingAssetId']:[])];
  const clauses = prefix => paths.flatMap(path => fields.map(field => ({ [`${prefix}${path}.${field}`]: assetId })));
  const matches = await Promise.all([
    db.collection('questions').findOne({ $or: clauses('') }, { projection: { _id: 1 } }),
    db.collection('quizzes').findOne({ $or: [...clauses('questions.'), ...clauses('draftData.questions.')] }, { projection: { _id: 1 } }),
    db.collection('attempts').findOne({ $or: clauses('questionSnapshot.') }, { projection: { _id: 1 } }),
  ]);
  return matches.some(Boolean);
}
