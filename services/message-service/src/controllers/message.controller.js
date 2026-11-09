import Conversation from '../models/Conversation.model.js';
import User from '../models/User.model.js';
import Follow from '../models/Follow.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { getIO } from '../socket/socketHandler.js';
import { requireId, textValue, toId } from '../services/messagePolicy.js';
import { consumeChatBudget } from '../services/chatBudget.js';
import { USER_CARD_SELECT, assertRecipientAllowsMessages, deleteChatMessage, editChatMessage, latestVisibleMessage, listChatMessages, reactToChatMessage, readChatMessages, sendChatMessage, unreadByConversation } from '../services/messaging.service.js';

export const getConversations = catchAsync(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 30);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError('Invalid pagination', 400);
  const userId = req.user._id;
  const filter = { participants: userId };
  const [conversations, total] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('participants', USER_CARD_SELECT).lean(),
    Conversation.countDocuments(filter),
  ]);
  const unread = await unreadByConversation(conversations.map((c) => c._id), userId);
  const formatted = await Promise.all(conversations.map(async (c) => {
    const last = await latestVisibleMessage(c._id, userId);
    return { _id: c._id, otherParticipant: c.participants.find((p) => toId(p) !== toId(userId)), lastMessage: last, lastMessageText: last?.text || '', lastMessageAt: last?.createdAt || c.lastMessageAt, unreadCount: unread.get(toId(c._id)) || 0, updatedAt: c.updatedAt };
  }));
  const pages = Math.ceil(total / limit) || 1;
  res.json({ success: true, data: { conversations: formatted, total, pagination: { total, page, limit, pages, hasMore: page < pages, hasNext: page < pages, hasPrev: page > 1 } } });
});

export const startConversation = catchAsync(async (req, res) => {
  consumeChatBudget(req.user._id, 'start', 30);
  const { recipientId, initialMessage, quizId, commentId, link, clientMessageId } = req.body;
  const username = req.body.username || req.body.recipientUsername;
  const currentUserId = req.user._id;
  let targetUser;
  if (recipientId) {
    requireId(recipientId, 'recipient ID');
    targetUser = await User.findById(recipientId).select(USER_CARD_SELECT).lean();
  } else if (username) {
    const cleanUsername = textValue(username, { required: true, max: 31 }).replace(/^@/, '').toLowerCase();
    targetUser = await User.findOne({ username: cleanUsername }).select(USER_CARD_SELECT).lean();
  }
  if (!targetUser) throw new AppError('Recipient user not found', 404);
  if (toId(targetUser._id) === toId(currentUserId)) throw new AppError('Cannot start a conversation with yourself', 400);
  await assertRecipientAllowsMessages(targetUser._id, currentUserId);
  let conversation = await Conversation.findOne({ isGroup: { $ne: true }, participants: { $all: [currentUserId, targetUser._id], $size: 2 } });
  if (!conversation) {
    const directKey = [toId(currentUserId), toId(targetUser._id)].sort().join(':');
    try {
      conversation = await Conversation.findOneAndUpdate({ directKey }, { $setOnInsert: { directKey, participants: [currentUserId, targetUser._id], unreadCounts: [{ user: currentUserId, count: 0 }, { user: targetUser._id, count: 0 }] } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      conversation = await Conversation.findOne({ directKey });
    }
  }
  let message = null;
  if (initialMessage || quizId || commentId || link) message = await sendChatMessage(toId(conversation._id), currentUserId, { text: initialMessage, quizId, commentId, link, clientMessageId }, getIO());
  const last = message || await latestVisibleMessage(conversation._id, currentUserId);
  res.json({ success: true, data: { conversation: { _id: conversation._id, otherParticipant: targetUser, lastMessage: last, lastMessageText: last?.text || '', lastMessageAt: last?.createdAt || conversation.lastMessageAt }, message } });
});

export const getMessages = catchAsync(async (req, res) => {
  res.json({ success: true, data: await listChatMessages(req.params.conversationId, req.user._id, req.query) });
});
export const sendMessage = catchAsync(async (req, res) => {
  const message = await sendChatMessage(req.params.conversationId, req.user._id, req.body, getIO());
  res.status(201).json({ success: true, data: { message } });
});
export const editMessage = catchAsync(async (req, res) => {
  const message = await editChatMessage(req.params.messageId, req.user._id, req.body.text, getIO());
  res.json({ success: true, data: { message } });
});
export const deleteMessage = catchAsync(async (req, res) => {
  const data = await deleteChatMessage(req.params.messageId, req.user._id, req.query.mode || 'everyone', getIO());
  res.json({ success: true, data });
});
export const toggleMessageReaction = catchAsync(async (req, res) => {
  const message = await reactToChatMessage(req.params.messageId, req.user._id, req.body.emoji, getIO());
  res.json({ success: true, data: { message } });
});
export const markConversationRead = catchAsync(async (req, res) => {
  const data = await readChatMessages(req.params.conversationId, req.user._id, req.body?.messageIds, getIO());
  res.json({ success: true, data });
});
export const getUnreadMessagesCount = catchAsync(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user._id }).select('_id').lean();
  const counts = await unreadByConversation(conversations.map((c) => c._id), req.user._id);
  res.json({ success: true, data: { unreadCount: [...counts.values()].reduce((sum, count) => sum + count, 0) } });
});

export const searchMessageUsers = catchAsync(async (req, res) => {
  consumeChatBudget(req.user._id, 'search', 60);
  const q = textValue(req.query.q, { max: 100 });
  const currentUserId = req.user._id;
  const discoverable = { _id: { $ne: currentUserId }, isDeleted: { $ne: true }, isSuspended: { $ne: true }, isActive: { $ne: false }, 'preferences.searchDiscovery': { $ne: false }, 'preferences.allowMessagesFrom': { $ne: 'none' } };
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ ...discoverable, $or: [{ username: regex }, { name: regex }] }).select(USER_CARD_SELECT).limit(20).maxTimeMS(5000).lean();
    return res.json({ success: true, data: { users } });
  }
  const follows = await Follow.find({ $or: [{ follower: currentUserId }, { following: currentUserId }] }).limit(30).lean();
  const ids = follows.map((f) => toId(f.follower) === toId(currentUserId) ? f.following : f.follower);
  const related = ids.length ? await User.find({ ...discoverable, _id: { $ne: currentUserId, $in: ids } }).select(USER_CARD_SELECT).limit(20).lean() : [];
  if (related.length < 5) {
    const more = await User.find({ ...discoverable, _id: { $ne: currentUserId, $nin: related.map((u) => u._id) }, isProfilePublic: { $ne: false } }).select(USER_CARD_SELECT).sort({ quizCount: -1, _id: -1 }).limit(10).lean();
    related.push(...more);
  }
  res.json({ success: true, data: { users: related } });
});
