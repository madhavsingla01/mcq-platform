import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

export function verifyChatAttachment(proof: unknown, userId: string, conversationId: string) {
  try {
    if (typeof proof !== 'string' || proof.length > 4096) throw new Error();
    const claims = jwt.verify(proof, env.JWT_SECRET, {
      algorithms: ['HS256'], issuer: 'quizfocus-media-service', audience: 'quizfocus-chat-attachment',
    });
    if (typeof claims === 'string' || claims.ownerId !== userId || claims.conversationId !== conversationId ||
        typeof claims.id !== 'string' || !/^[\da-f-]{36}$/i.test(claims.id) || claims.status !== 'ready' ||
        !['image', 'audio', 'video', 'document'].includes(claims.kind) ||
        typeof claims.fileName !== 'string' || typeof claims.fileSize !== 'number' ||
        typeof claims.mimeType !== 'string') throw new Error();
    return { type: claims.kind, media: {
      assetId: claims.id, fileName: claims.fileName, fileSize: claims.fileSize, mimeType: claims.mimeType,
    } };
  } catch {
    throw new AppError('Upload this attachment to the current conversation before sending.', 400);
  }
}
