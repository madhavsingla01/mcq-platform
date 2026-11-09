import { AppError } from '../middleware/error.middleware.js';

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const toId = (value) => String(value?._id || value || '');
export const validId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const requireId = (value, label = 'ID') => {
  const id = typeof value === 'string' ? value : value?._bsontype === 'ObjectId' && typeof value.toHexString === 'function' ? value.toHexString() : '';
  if (!validId(id)) throw new AppError(`Invalid ${label}`, 400);
  return id;
};
export const textValue = (value, { required = false, max = 2000 } = {}) => {
  if (value != null && typeof value !== 'string') throw new AppError('Text must be a string', 400);
  const text = (value || '').trim();
  if ((required && !text) || text.length > max) throw new AppError(`Text must contain ${required ? '1' : '0'} to ${max} characters`, 400);
  return text;
};
export const safeUrl = (value) => {
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
export const normalizeClientMessageId = (value) => {
  if (value == null) return undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new AppError('Invalid client message ID', 400);
  return value;
};
export const paginationOptions = (query = {}) => {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError('Limit must be between 1 and 100', 400);
  if (query.before && query.after) throw new AppError('Use either before or after, not both', 400);
  const q = textValue(query.q, { max: 100 });
  return { limit, q, before: query.before, after: query.after };
};
export const cursorCondition = (cursor, direction) => {
  const op = direction === 'after' ? '$gt' : '$lt';
  return { $or: [{ createdAt: { [op]: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { [op]: cursor._id } }] };
};
export const assertEditable = (message, userId, now = Date.now()) => {
  if (toId(message.sender) !== toId(userId)) throw new AppError('Only the sender can edit this message', 403);
  if (message.isDeleted) throw new AppError('Deleted messages cannot be edited', 400);
  if (now - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) throw new AppError('Messages can be edited for 15 minutes after sending', 400);
};
export const deletionFields = (now = new Date()) => ({
  isDeleted: true, deletedAt: now, text: 'This message was deleted', type: 'text',
  media: null, quizMetadata: null, quiz: null, comment: null, link: null, replyTo: null, reactions: [],
});
export const shareableQuiz = (quiz) => Boolean(quiz &&
  (['public', 'unlisted'].includes(quiz.visibility) || (!quiz.visibility && quiz.isPublic === true)) &&
  !quiz.isRestricted && quiz.accessType !== 'invite_only' && quiz.metadata?.savedAsDraft !== true &&
  !(quiz.isChallenge && ['draft', 'publishing'].includes(quiz.challengeStatus)));

const safeStoredUrl = (url) => {
  try { return safeUrl(url); } catch { return null; }
};
export const publicMessage = (message) => {
  const result = message?.toObject ? message.toObject() : { ...message };
  delete result.readBy; // Internal unread bookkeeping must never bypass receipt privacy.
  delete result.deletedFor;
  if (result.isDeleted) return { ...result, ...deletionFields(result.deletedAt) };
  if (['quiz_share', 'challenge_invite'].includes(result.type) && !shareableQuiz(result.quiz)) {
    return { ...result, text: 'Quiz unavailable', quiz: null, quizMetadata: null };
  }
  if (result.quiz?.isChallenge && !(result.quiz.deadlineAt && new Date(result.quiz.deadlineAt) <= new Date())) {
    result.quiz = { ...result.quiz, avgScore: 0 };
  }
  if (result.type === 'comment_share' && (result.comment?.status !== 'active' || !shareableQuiz(result.comment?.quiz))) {
    return { ...result, text: 'Comment unavailable', quiz: null, quizMetadata: null, comment: null };
  }
  if (result.link) result.link = safeStoredUrl(result.link);
  if (result.media?.url) result.media = { ...result.media, url: safeStoredUrl(result.media.url), thumbnailUrl: safeStoredUrl(result.media.thumbnailUrl) };
  return result;
};
