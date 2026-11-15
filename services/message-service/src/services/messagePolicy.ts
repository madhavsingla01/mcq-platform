import mongoose from 'mongoose';
import { AppError } from '../middleware/error.middleware.js';

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const asDateValue = (value: unknown) => value instanceof Date || typeof value === 'string' ||
  typeof value === 'number' ? value : undefined;

export const toId = (value: unknown): string => {
  const id = isRecord(value) && value._id ? value._id : value;
  if (typeof id === 'string' || typeof id === 'number') return String(id);
  return id instanceof mongoose.Types.ObjectId ? id.toHexString() : '';
};
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const requireId = (value: unknown, label = 'ID') => {
  const id = typeof value === 'string' ? value : value instanceof mongoose.Types.ObjectId ? value.toHexString() : '';
  if (!validId(id)) throw new AppError(`Invalid ${label}`, 400);
  return id;
};
export const textValue = (value: unknown, { required = false, max = 2000 } = {}) => {
  if (value != null && typeof value !== 'string') throw new AppError('Text must be a string', 400);
  const text = (value || '').trim();
  if ((required && !text) || text.length > max) throw new AppError(`Text must contain ${required ? '1' : '0'} to ${max} characters`, 400);
  return text;
};
export const safeUrl = (value: unknown) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new AppError('Invalid URL', 400);
  // Relative media paths are safe; protocol-relative and executable URLs are not.
  if (/^\/(?!\/)[^\\\s]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new AppError('Only HTTP(S) or relative URLs are supported', 400);
  }
};
export const normalizeClientMessageId = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new AppError('Invalid client message ID', 400);
  return value;
};
export const paginationOptions = (query: { limit?: unknown; q?: unknown; before?: unknown; after?: unknown } = {}) => {
  const limit = query.limit === undefined ? 50
    : typeof query.limit === 'string' || typeof query.limit === 'number' ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError('Limit must be between 1 and 100', 400);
  if (query.before && query.after) throw new AppError('Use either before or after, not both', 400);
  const q = textValue(query.q, { max: 100 });
  return { limit, q, before: query.before, after: query.after };
};
export const cursorCondition = (cursor: { createdAt: Date | string; _id: string | mongoose.Types.ObjectId }, direction: 'before' | 'after') => {
  const op = direction === 'after' ? '$gt' : '$lt';
  return { $or: [{ createdAt: { [op]: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { [op]: cursor._id } }] };
};
export const assertEditable = (message: { sender: unknown; createdAt: Date | string | number; isDeleted?: boolean }, userId: unknown, now = Date.now()) => {
  if (!toId(userId) || toId(message.sender) !== toId(userId)) throw new AppError('Only the sender can edit this message', 403);
  if (message.isDeleted) throw new AppError('Deleted messages cannot be edited', 400);
  const sentAt = new Date(message.createdAt).getTime();
  if (!Number.isFinite(sentAt) || now - sentAt > EDIT_WINDOW_MS) throw new AppError('Messages can be edited for 15 minutes after sending', 400);
};
export const deletionFields = (now: Date | string | number | null = new Date()) => ({
  isDeleted: true, deletedAt: now, text: 'This message was deleted', type: 'text',
  media: null, quizMetadata: null, quiz: null, comment: null, link: null, replyTo: null, reactions: [],
});
export function shareableQuiz(quiz: unknown): boolean {
  if (!isRecord(quiz)) return false;
  const metadata = isRecord(quiz.metadata) ? quiz.metadata : undefined;
  return (quiz.visibility === 'public' || quiz.visibility === 'unlisted' || (!quiz.visibility && quiz.isPublic === true)) &&
    !quiz.isRestricted && quiz.accessType !== 'invite_only' && metadata?.savedAsDraft !== true &&
    !(quiz.isChallenge && (quiz.challengeStatus === 'draft' || quiz.challengeStatus === 'publishing'));
}

const safeStoredUrl = (url: unknown) => {
  try { return safeUrl(url); } catch { return null; }
};

export const publicMessage = (message: unknown): Record<string, unknown> => {
  const data: unknown = isRecord(message) && typeof message.toObject === 'function' ? message.toObject() : message;
  const result = isRecord(data) ? { ...data } : {};
  delete result.readBy; // Internal unread bookkeeping must never bypass receipt privacy.
  delete result.deletedFor;
  if (result.isDeleted) {
    const deletedAt = result.deletedAt === null ? null : asDateValue(result.deletedAt);
    return { ...result, ...deletionFields(deletedAt) };
  }
  if ((result.type === 'quiz_share' || result.type === 'challenge_invite') && !shareableQuiz(result.quiz)) {
    return { ...result, text: 'Quiz unavailable', quiz: null, quizMetadata: null };
  }
  if (isRecord(result.quiz) && result.quiz.isChallenge) {
    const deadlineAt = asDateValue(result.quiz.deadlineAt);
    if (!deadlineAt || !(new Date(deadlineAt) <= new Date())) {
      result.quiz = { ...result.quiz, avgScore: 0 };
    }
  }
  if (result.type === 'comment_share' && (!isRecord(result.comment) ||
      result.comment.status !== 'active' || !shareableQuiz(result.comment.quiz))) {
    return { ...result, text: 'Comment unavailable', quiz: null, quizMetadata: null, comment: null };
  }
  if (result.link) result.link = safeStoredUrl(result.link);
  if (isRecord(result.media) && result.media.url) {
    result.media = {
      ...result.media, url: safeStoredUrl(result.media.url), thumbnailUrl: safeStoredUrl(result.media.thumbnailUrl),
    };
  }
  return result;
};
