import mongoose from 'mongoose';
import Conversation from '../models/Conversation.model.js';
import Message from '../models/Message.model.js';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import QuizComment from '../models/QuizComment.model.js';
import Follow from '../models/Follow.model.js';
import QuizShare from '../models/QuizShare.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { consumeChatBudget } from './chatBudget.js';
import { buildClosestSearch } from './closestSearch.js';
import { assertEditable, cursorCondition, deletionFields, normalizeClientMessageId, paginationOptions, publicMessage, requireId, safeUrl, shareableQuiz, textValue, toId } from './messagePolicy.js';

export const USER_CARD_SELECT = '_id name username avatar bio isProfilePublic';
const QUIZ_POLICY_SELECT = 'visibility isPublic isRestricted accessType metadata.savedAsDraft isChallenge challengeStatus deadlineAt';
export const QUIZ_PREVIEW_SELECT = `_id title description category difficulty questionCount totalAttempts avgScore thumbnail uploader ${QUIZ_POLICY_SELECT}`;
const objectId = (id) => new mongoose.Types.ObjectId(toId(id));
const populateMessage = (query) => query.populate('sender', 'name username avatar')
  .populate('quiz', QUIZ_PREVIEW_SELECT)
  .populate({ path: 'comment', populate: [{ path: 'author', select: 'name username avatar' }, { path: 'quiz', select: QUIZ_POLICY_SELECT }] })
  .populate('reactions.user', 'name username avatar');

export const requireParticipant = async (conversationId, userId) => {
  requireId(conversationId, 'conversation ID');
  const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
  if (!conversation) throw new AppError('Conversation not found or access denied', 404);
  return conversation;
};

export const assertRecipientAllowsMessages = async (recipientId, senderId) => {
  const recipient = await User.findById(recipientId).select('preferences isDeleted isActive isSuspended').lean();
  if (!recipient || recipient.isDeleted || recipient.isSuspended || recipient.isActive === false) throw new AppError('Recipient is unavailable', 403);
  const policy = recipient.preferences?.allowMessagesFrom;
  if (policy === 'none') throw new AppError('This user does not accept direct messages', 403);
  if (policy === 'followers' && !await Follow.exists({ follower: senderId, following: recipientId })) {
    throw new AppError('This user only accepts messages from followers', 403);
  }
  if (policy === 'following' && !await Follow.exists({ follower: recipientId, following: senderId })) {
    throw new AppError('This user only accepts messages from people they follow', 403);
  }
};

// Messages are the source of truth. Counting unread rows avoids lost increments
// when concurrent sends and reads race against a denormalized conversation array.
export const unreadByConversation = async (conversationIds, userId) => {
  if (!conversationIds.length) return new Map();
  const rows = await Message.aggregate([
    { $match: { conversation: { $in: conversationIds.map(objectId) }, sender: { $ne: objectId(userId) }, readBy: { $ne: objectId(userId) }, deletedFor: { $ne: objectId(userId) }, isDeleted: { $ne: true } } },
    { $group: { _id: '$conversation', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [toId(row._id), row.count]));
};

export const latestVisibleMessage = async (conversationId, userId) => {
  const message = await populateMessage(Message.findOne({ conversation: conversationId, deletedFor: { $ne: userId } })
    .sort({ createdAt: -1, _id: -1 })).lean();
  return message ? publicMessage(message) : null;
};

export const publishConversation = async (io, conversationId) => {
  if (!io) return;
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) return;
  for (const participant of conversation.participants) {
    const counts = await unreadByConversation([conversation._id], participant);
    const latest = await latestVisibleMessage(conversation._id, participant);
    io.to(`user:${toId(participant)}`).emit('conversation:updated', {
      conversationId: toId(conversation._id), lastMessage: latest,
      lastMessageText: latest?.text || '', lastMessageAt: latest?.createdAt || conversation.lastMessageAt,
      unreadCounts: [{ user: participant, count: counts.get(toId(conversation._id)) || 0 }],
    });
  }
};

const buildPayload = async (conversation, userId, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Invalid message payload', 400);
  const text = textValue(input.text);
  let type = input.type || 'text';
  if (!['text', 'image', 'audio', 'document', 'quiz_share', 'comment_share', 'challenge_invite', 'link'].includes(type)) throw new AppError('Unsupported message type', 400);
  const payload = { conversation: conversation._id, sender: userId, text, type, readBy: [userId], clientMessageId: normalizeClientMessageId(input.clientMessageId) };
  const quizId = input.quizId || input.quizMetadata?.quizId;
  if (quizId) {
    requireId(quizId, 'quiz ID');
    const quiz = await Quiz.findById(quizId).select(QUIZ_PREVIEW_SELECT).lean();
    // Private content must not be revealed through message population.
    if (!shareableQuiz(quiz)) throw new AppError('This quiz cannot be shared', 403);
    payload.quiz = quiz._id;
    payload.type = type === 'challenge_invite' ? type : 'quiz_share';
    payload.quizMetadata = { quizId: quiz._id, title: quiz.title, category: quiz.category, questionCount: quiz.questionCount, difficulty: quiz.difficulty };
    payload.text ||= `Shared quiz: "${quiz.title}"`;
  } else if (['quiz_share', 'challenge_invite'].includes(type)) {
    throw new AppError('A valid quiz is required', 400);
  }
  if (input.commentId) {
    requireId(input.commentId, 'comment ID');
    const comment = await QuizComment.findOne({ _id: input.commentId, status: 'active' }).lean();
    const quiz = comment && await Quiz.findById(comment.quiz).select(QUIZ_POLICY_SELECT).lean();
    if (!comment || !shareableQuiz(quiz)) throw new AppError('This comment cannot be shared', 403);
    payload.comment = comment._id;
    payload.type = 'comment_share';
    payload.text ||= 'Shared a comment';
  } else if (type === 'comment_share') throw new AppError('A comment is required', 400);
  if (input.link) {
    payload.link = safeUrl(input.link);
    payload.type = 'link';
    payload.text ||= payload.link;
  } else if (type === 'link') throw new AppError('A link is required', 400);
  if (['image', 'audio', 'document'].includes(type)) {
    if (!input.media || typeof input.media !== 'object' || Array.isArray(input.media) || !input.media.url) throw new AppError('A media URL is required', 400);
    const { media } = input;
    payload.media = { url: safeUrl(media.url), thumbnailUrl: safeUrl(media.thumbnailUrl), fileName: textValue(media.fileName, { max: 255 }), mimeType: textValue(media.mimeType, { max: 100 }) };
    for (const key of ['fileSize', 'duration']) {
      if (media[key] != null) {
        if (typeof media[key] !== 'number' || !Number.isFinite(media[key]) || media[key] < 0 || (key === 'fileSize' && media[key] > 15 * 1024 * 1024)) throw new AppError('Invalid media metadata', 400);
        payload.media[key] = media[key];
      }
    }
    payload.text ||= type === 'image' ? 'Photo' : type === 'audio' ? 'Voice message' : payload.media.fileName || 'Document';
  }
  if (input.replyTo?.messageId) {
    requireId(input.replyTo.messageId, 'reply ID');
    const original = await populateMessage(Message.findOne({ _id: input.replyTo.messageId, conversation: conversation._id,
      isDeleted: { $ne: true }, deletedFor: { $ne: userId } })).lean();
    if (!original) throw new AppError('Reply must reference a visible message in this conversation', 400);
    payload.replyTo = { messageId: original._id, senderName: original.sender?.name || original.sender?.username || 'User', text: publicMessage(original).text.slice(0, 300) };
  }
  if (!payload.text) throw new AppError('Message cannot be empty', 400);
  return payload;
};

export const sendChatMessage = async (conversationId, userId, input, io) => {
  const conversation = await requireParticipant(conversationId, userId);
  const clientMessageId = normalizeClientMessageId(input?.clientMessageId);
  if (clientMessageId) {
    const existing = await populateMessage(Message.findOne({ sender: userId, clientMessageId })).lean();
    if (existing) {
      if (toId(existing.conversation) !== toId(conversationId)) throw new AppError('Client message ID already used', 409);
      return publicMessage(existing);
    }
  }
  consumeChatBudget(userId, 'send', 60);
  for (const recipient of conversation.participants.filter((id) => toId(id) !== toId(userId))) await assertRecipientAllowsMessages(recipient, userId);
  const payload = await buildPayload(conversation, userId, input);
  let message;
  try { message = await Message.create(payload); } catch (error) {
    if (error.code !== 11000 || !clientMessageId) throw error;
    const existing = await populateMessage(Message.findOne({ sender: userId, clientMessageId })).lean();
    if (!existing || toId(existing.conversation) !== toId(conversationId)) throw new AppError('Client message ID already used', 409);
    return publicMessage(existing);
  }
  try {
    await Conversation.updateOne({ _id: conversation._id, $or: [{ lastMessage: null }, { lastMessageAt: { $lt: message.createdAt } }, { lastMessageAt: message.createdAt, lastMessage: { $lt: message._id } }] }, {
      $set: { lastMessage: message._id, lastMessageText: message.text, lastMessageAt: message.createdAt },
    });
  } catch (error) {
    console.error(JSON.stringify({ service: 'message-service', operation: 'update-inbox-preview', category: error.name }));
  }
  if (payload.quiz) {
    await Promise.allSettled([
      Quiz.updateOne({ _id: payload.quiz }, { $inc: { shareCount: 1 }, $set: { lastSocialActivityAt: new Date() } }),
      QuizShare.create({ quiz: payload.quiz, user: userId, channel: 'direct_share' }),
    ]);
  }
  let populated;
  try { populated = publicMessage(await populateMessage(Message.findById(message._id)).lean() || message); }
  catch { populated = publicMessage(message); }
  io?.to(`conv:${toId(conversationId)}`).emit('message:new', { conversationId: toId(conversationId), message: populated });
  try { await publishConversation(io, conversationId); }
  catch (error) { console.error(JSON.stringify({ service: 'message-service', operation: 'publish-inbox-update', category: error.name })); }
  return populated;
};

const quizShareTypes = ['quiz_share', 'challenge_invite', 'comment_share'];
const visibleSearchShares = [
  { $lookup: { from: QuizComment.collection.name, localField: 'comment', foreignField: '_id',
    pipeline: [{ $match: { status: 'active' } }, { $project: { quiz: 1 } }], as: 'searchComment' } },
  { $set: { searchQuizId: { $cond: [{ $eq: ['$type', 'comment_share'] }, { $first: '$searchComment.quiz' }, '$quiz'] } } },
  { $lookup: { from: Quiz.collection.name, localField: 'searchQuizId', foreignField: '_id', pipeline: [
    { $match: {
      $or: [{ visibility: { $in: ['public', 'unlisted'] } }, { visibility: { $in: [null, ''] }, isPublic: true }],
      isRestricted: { $ne: true }, accessType: { $ne: 'invite_only' }, 'metadata.savedAsDraft': { $ne: true },
      $nor: [{ isChallenge: true, challengeStatus: { $in: ['draft', 'publishing'] } }],
    } }, { $project: { _id: 1 } },
  ], as: 'searchQuiz' } },
  { $match: { $or: [{ type: { $nin: quizShareTypes } }, { 'searchQuiz.0': { $exists: true } }] } },
];

const encodeSearchCursor = (row) => row ? `v1.${row.searchScore}.${row.searchTimestamp.getTime()}.${row._id}` : null;

function searchCursorFilter(cursor, operator) {
  if (typeof cursor !== 'string') throw new AppError('Invalid search cursor', 400);
  const match = /^v1\.(\d{1,3})\.(-?\d{1,16})\.([a-f\d]{24})$/i.exec(cursor);
  if (!match || Number(match[1]) > 400) throw new AppError('Invalid search cursor', 400);
  const searchScore = Number(match[1]);
  const searchTimestamp = new Date(Number(match[2]));
  if (!Number.isFinite(searchTimestamp.getTime())) throw new AppError('Invalid search cursor', 400);
  return { $or: [
    { searchScore: { [operator]: searchScore } },
    { searchScore, searchTimestamp: { [operator]: searchTimestamp } },
    { searchScore, searchTimestamp, _id: { [operator]: objectId(match[3]) } },
  ] };
}

async function rankedChatMessages(conversationId, userId, { q, limit, before, after }) {
  const closest = buildClosestSearch(q, { primary: 'text' });
  const visible = { conversation: objectId(conversationId), deletedFor: { $ne: objectId(userId) }, isDeleted: { $ne: true } };
  const cursor = before || after;
  const direction = after ? 1 : -1;
  const rows = await Message.aggregate([
    { $match: { ...visible, ...closest.filter } },
    ...visibleSearchShares,
    { $set: {
      searchScore: closest.score,
      searchTimestamp: { $convert: { input: '$createdAt', to: 'date', onNull: new Date(0), onError: new Date(0) } },
    } },
    ...(cursor ? [{ $match: searchCursorFilter(cursor, after ? '$gt' : '$lt') }] : []),
    { $sort: { searchScore: direction, searchTimestamp: direction, _id: direction } },
    { $limit: limit + 1 }, { $project: { searchScore: 1, searchTimestamp: 1 } },
  ]).option({ maxTimeMS: 5000 });
  const page = rows.slice(0, limit);
  if (after) page.reverse();
  const docs = await populateMessage(Message.find({ ...visible, _id: { $in: page.map(row => row._id) } }).maxTimeMS(5000)).lean();
  const readable = docs.filter((doc) => {
    if (doc.type === 'comment_share') return doc.comment?.status === 'active' && shareableQuiz(doc.comment.quiz);
    return !quizShareTypes.includes(doc.type) || shareableQuiz(doc.quiz);
  });
  const byId = new Map(readable.map(doc => [toId(doc), doc]));
  const messages = page.map(row => byId.get(toId(row))).filter(Boolean).map(publicMessage);
  return { messages, pagination: {
    limit, hasMore: rows.length > limit,
    nextCursor: encodeSearchCursor(page.at(-1)), prevCursor: encodeSearchCursor(page[0]),
  } };
}

export const listChatMessages = async (conversationId, userId, query) => {
  if (query.q) consumeChatBudget(userId, 'search', 60);
  const conversation = await requireParticipant(conversationId, userId);
  await conversation.populate('participants', USER_CARD_SELECT);
  const { limit, q, before, after } = paginationOptions(query);
  if (q && query.match === 'closest') {
    const [results, latest] = await Promise.all([
      rankedChatMessages(conversationId, userId, { q, limit, before, after }), latestVisibleMessage(conversationId, userId),
    ]);
    return {
      conversation: { _id: conversation._id, otherParticipant: conversation.participants.find(p => toId(p) !== toId(userId)), lastMessageText: latest?.text || '', lastMessageAt: latest?.createdAt || conversation.lastMessageAt },
      ...results, total: results.messages.length,
    };
  }
  const filter = { conversation: conversationId, deletedFor: { $ne: userId } };
  if (q) { filter.isDeleted = { $ne: true }; filter.text = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; }
  const cursorId = before || after;
  if (cursorId) {
    requireId(cursorId, 'cursor');
    const cursor = await Message.findOne({ _id: cursorId, conversation: conversationId, deletedFor: { $ne: userId } }).select('createdAt').lean();
    if (!cursor) throw new AppError('Cursor is not visible in this conversation', 400);
    Object.assign(filter, cursorCondition(cursor, after ? 'after' : 'before'));
  }
  const direction = after ? 1 : -1;
  const [rows, latest] = await Promise.all([
    populateMessage(Message.find(filter).sort({ createdAt: direction, _id: direction }).limit(limit + 1).maxTimeMS(5000)).lean(),
    latestVisibleMessage(conversationId, userId),
  ]);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (!after) page.reverse();
  const messages = page.map(publicMessage);
  return {
    conversation: { _id: conversation._id, otherParticipant: conversation.participants.find((p) => toId(p) !== toId(userId)), lastMessageText: latest?.text || '', lastMessageAt: latest?.createdAt || conversation.lastMessageAt },
    messages, total: messages.length,
    pagination: { limit, hasMore, nextCursor: messages[0]?._id?.toString() || null, prevCursor: messages.at(-1)?._id?.toString() || null },
  };
};

const visibleMessage = async (messageId, userId) => {
  requireId(messageId, 'message ID');
  const message = await Message.findOne({ _id: messageId, deletedFor: { $ne: userId } });
  if (!message) throw new AppError('Message not found', 404);
  await requireParticipant(toId(message.conversation), userId);
  return message;
};

export const editChatMessage = async (messageId, userId, text, io) => {
  const cleanText = textValue(text, { required: true });
  const message = await visibleMessage(messageId, userId);
  assertEditable(message, userId);
  const editedAt = new Date();
  // The deletion predicate prevents an edit racing with revoke from restoring text.
  const result = await Message.updateOne({ _id: message._id, isDeleted: { $ne: true } }, { $set: { text: cleanText, isEdited: true, editedAt } });
  if (!result.modifiedCount) throw new AppError('Message is no longer editable', 409);
  await Conversation.updateOne({ _id: message.conversation, lastMessage: message._id }, { $set: { lastMessageText: cleanText } });
  io?.to(`conv:${toId(message.conversation)}`).emit('message:edited', { messageId: toId(message._id), conversationId: toId(message.conversation), text: cleanText, isEdited: true, editedAt });
  await publishConversation(io, message.conversation);
  return publicMessage(await populateMessage(Message.findById(message._id)).lean());
};

export const deleteChatMessage = async (messageId, userId, mode = 'everyone', io) => {
  if (!['me', 'everyone'].includes(mode)) throw new AppError('Delete mode must be me or everyone', 400);
  const message = await visibleMessage(messageId, userId);
  if (mode === 'everyone') {
    if (toId(message.sender) !== toId(userId)) throw new AppError('Only the sender can delete for everyone', 403);
    await Message.updateOne({ _id: message._id }, { $set: deletionFields() });
    // Remove stored quote snapshots too, so revoked content cannot survive in replies.
    await Message.updateMany({ conversation: message.conversation, 'replyTo.messageId': message._id }, { $set: { 'replyTo.text': 'This message was deleted', 'replyTo.senderName': '' } });
    await Conversation.updateOne({ _id: message.conversation, lastMessage: message._id }, { $set: { lastMessageText: 'This message was deleted' } });
  } else {
    await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: userId } });
  }
  const event = { messageId: toId(message._id), conversationId: toId(message.conversation), mode };
  io?.to(mode === 'me' ? `user:${toId(userId)}` : `conv:${toId(message.conversation)}`).emit('message:deleted', event);
  await publishConversation(io, message.conversation);
  return { ...event, isDeleted: mode === 'everyone' || message.isDeleted };
};

export const reactToChatMessage = async (messageId, userId, emoji, io) => {
  if (typeof emoji !== 'string' || !emoji.trim() || emoji.length > 32) throw new AppError('Invalid reaction', 400);
  const message = await visibleMessage(messageId, userId);
  if (message.isDeleted) throw new AppError('Cannot react to a deleted message', 400);
  const user = objectId(userId);
  // One atomic pipeline preserves concurrent reactions from different people.
  await Message.updateOne({ _id: message._id, isDeleted: { $ne: true } }, [{ $set: { reactions: {
    $let: { vars: { reactions: { $ifNull: ['$reactions', []] } }, in: {
      $cond: [
        { $anyElementTrue: { $map: { input: '$$reactions', as: 'r', in: { $and: [{ $eq: ['$$r.user', user] }, { $eq: ['$$r.emoji', { $literal: emoji }] }] } } } },
        { $filter: { input: '$$reactions', as: 'r', cond: { $ne: ['$$r.user', user] } } },
        { $concatArrays: [{ $filter: { input: '$$reactions', as: 'r', cond: { $ne: ['$$r.user', user] } } }, [{ user, emoji: { $literal: emoji } }]] },
      ],
    } },
  } } }]);
  const updated = publicMessage(await populateMessage(Message.findById(messageId)).lean());
  io?.to(`conv:${toId(message.conversation)}`).emit('message:reaction_update', { messageId, conversationId: toId(message.conversation), reactions: updated.reactions });
  return updated;
};

export const readChatMessages = async (conversationId, userId, messageIds, io) => {
  await requireParticipant(conversationId, userId);
  if (messageIds !== undefined && (!Array.isArray(messageIds) || messageIds.length > 200)) throw new AppError('Provide at most 200 message IDs', 400);
  if (messageIds?.some((id) => { try { requireId(id); return false; } catch { return true; } })) throw new AppError('Invalid message ID', 400);
  const reader = await User.findById(userId).select('preferences').lean();
  const receipts = reader?.preferences?.messagingReadReceipts !== false;
  const filter = { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId }, deletedFor: { $ne: userId }, isDeleted: { $ne: true } };
  if (messageIds) filter._id = { $in: messageIds };
  const rows = await Message.find(filter).select('_id').limit(200).lean();
  const acknowledgedIds = rows.map(row => row._id);
  const update = { $addToSet: { readBy: userId } };
  if (receipts) update.$set = { deliveryStatus: 'read' };
  if (acknowledgedIds.length) await Message.updateMany({ ...filter, _id: { $in: acknowledgedIds } }, update);
  if (receipts && acknowledgedIds.length) io?.to(`conv:${toId(conversationId)}`).emit('message:read_status', { conversationId, readerId: toId(userId), readAt: new Date(), messageIds: acknowledgedIds.map(toId) });
  const counts = await unreadByConversation([conversationId], userId);
  const unreadCount = counts.get(toId(conversationId)) || 0;
  // Retain the legacy cleared event only when the whole conversation is read.
  if (!unreadCount) io?.to(`user:${toId(userId)}`).emit('conversation:unread_cleared', { conversationId });
  await publishConversation(io, conversationId);
  return { unreadCount };
};
