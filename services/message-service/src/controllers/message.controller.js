import mongoose from 'mongoose';
import Conversation from '../models/Conversation.model.js';
import Message from '../models/Message.model.js';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import QuizComment from '../models/QuizComment.model.js';
import Follow from '../models/Follow.model.js';
import QuizShare from '../models/QuizShare.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { getIO } from '../socket/socketHandler.js';

const USER_CARD_SELECT = '_id name username avatar bio isProfilePublic';
const QUIZ_PREVIEW_SELECT = '_id title description category difficulty questionCount totalAttempts avgScore thumbnail visibility isPublic uploader';

const toId = (val) => (val?._id ? String(val._id) : String(val || ''));

// Get all conversations for current user
export const getConversations = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('participants', USER_CARD_SELECT)
      .populate({
        path: 'lastMessage',
        populate: [
          { path: 'sender', select: 'name username avatar' },
          { path: 'quiz', select: 'title category difficulty' },
        ],
      })
      .lean(),
    Conversation.countDocuments({ participants: userId }),
  ]);

  const formatted = conversations.map((c) => {
    const otherParticipant = c.participants.find((p) => toId(p) !== toId(userId)) || c.participants[0];
    const unreadEntry = (c.unreadCounts || []).find((u) => toId(u.user) === toId(userId));
    const unreadCount = unreadEntry ? unreadEntry.count : 0;

    return {
      _id: c._id,
      otherParticipant,
      lastMessage: c.lastMessage,
      lastMessageText: c.lastMessageText || '',
      lastMessageAt: c.lastMessageAt,
      unreadCount,
      updatedAt: c.updatedAt,
    };
  });

  const pages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      conversations: formatted,
      total,
      pagination: {
        total,
        page,
        limit,
        pages,
        hasMore: page < pages,
        hasNext: page < pages,
        hasPrev: page > 1,
      },
    },
  });
});

// Start or get 1-on-1 conversation with a user (optionally send initial message or quiz)
export const startConversation = catchAsync(async (req, res) => {
  const currentUserId = req.user._id;
  const { recipientId, username, initialMessage, quizId, commentId, link } = req.body;

  let targetUser = null;
  if (recipientId && mongoose.isValidObjectId(recipientId)) {
    targetUser = await User.findById(recipientId).select(USER_CARD_SELECT + ' preferences');
  } else if (username) {
    targetUser = await User.findOne({ username: username.toLowerCase().replace(/^@/, '').trim() }).select(USER_CARD_SELECT + ' preferences');
  }

  if (!targetUser) {
    throw new AppError('Recipient user not found', 404);
  }

  if (toId(targetUser._id) === toId(currentUserId)) {
    throw new AppError('Cannot start a conversation with yourself', 400);
  }

  if (targetUser.preferences?.allowMessagesFrom === 'none') {
    throw new AppError('This user does not accept direct messages', 403);
  }
  if (targetUser.preferences?.allowMessagesFrom === 'following') {
    const isFollowing = await Follow.exists({ follower: targetUser._id, following: currentUserId });
    if (!isFollowing) {
      throw new AppError('This user only accepts direct messages from users they follow', 403);
    }
  }

  // Find existing 1-on-1 conversation
  let conversation = await Conversation.findOne({
    participants: { $all: [currentUserId, targetUser._id], $size: 2 },
  })
    .populate('participants', USER_CARD_SELECT)
    .populate('lastMessage');

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [currentUserId, targetUser._id],
      unreadCounts: [
        { user: currentUserId, count: 0 },
        { user: targetUser._id, count: 0 },
      ],
      lastMessageAt: new Date(),
    });
    conversation = await Conversation.findById(conversation._id).populate('participants', USER_CARD_SELECT);
  }

  let sentMessage = null;

  // If there's an initial payload (e.g. sharing a quiz or sending a message)
  if (initialMessage || quizId || commentId || link) {
    let msgType = 'text';
    let text = initialMessage ? String(initialMessage).trim() : '';

    if (quizId && mongoose.isValidObjectId(quizId)) {
      msgType = 'quiz_share';
      const sharedQuiz = await Quiz.findById(quizId).select('title');
      if (!text && sharedQuiz) {
        text = `Shared quiz: "${sharedQuiz.title}"`;
      }
      // Record quiz share count
      await Quiz.findByIdAndUpdate(quizId, {
        $inc: { shareCount: 1 },
        $set: { lastSocialActivityAt: new Date() },
      }).catch(() => {});
      await QuizShare.create({
        quiz: quizId,
        user: currentUserId,
        channel: 'direct_share',
      }).catch(() => {});
    } else if (commentId && mongoose.isValidObjectId(commentId)) {
      msgType = 'comment_share';
      if (!text) text = 'Shared a comment with you';
    } else if (link) {
      msgType = 'link';
    }

    sentMessage = await Message.create({
      conversation: conversation._id,
      sender: currentUserId,
      text,
      type: msgType,
      quiz: quizId || null,
      comment: commentId || null,
      link: link || null,
      readBy: [currentUserId],
    });

    // Update conversation state & bump recipient unread count
    let foundRecipient = false;
    const updatedUnread = (conversation.unreadCounts || []).map((entry) => {
      if (toId(entry.user) === toId(targetUser._id)) {
        foundRecipient = true;
        return { user: entry.user, count: (entry.count || 0) + 1 };
      }
      return entry;
    });
    if (!foundRecipient) {
      updatedUnread.push({ user: targetUser._id, count: 1 });
    }

    conversation.lastMessage = sentMessage._id;
    conversation.lastMessageText = text;
    conversation.lastMessageAt = new Date();
    conversation.unreadCounts = updatedUnread;
    await conversation.save();

    sentMessage = await Message.findById(sentMessage._id)
      .populate('sender', 'name username avatar')
      .populate('quiz', QUIZ_PREVIEW_SELECT)
      .populate({ path: 'comment', populate: { path: 'author', select: 'name username avatar' } });
  }

  const otherParticipant = conversation.participants.find((p) => toId(p) !== toId(currentUserId)) || conversation.participants[0];

  res.status(200).json({
    success: true,
    data: {
      conversation: {
        _id: conversation._id,
        otherParticipant,
        lastMessage: sentMessage || conversation.lastMessage,
        lastMessageText: conversation.lastMessageText,
        lastMessageAt: conversation.lastMessageAt,
      },
      message: sentMessage,
    },
  });
});

// Get messages for a specific conversation
export const getMessages = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError('Invalid conversation ID', 400);
  }

  const conversation = await Conversation.findById(conversationId)
    .populate('participants', USER_CARD_SELECT);

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  const isParticipant = conversation.participants.some((p) => toId(p) === toId(userId));
  if (!isParticipant) {
    throw new AppError('Not authorized to view this conversation', 403);
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const { before, after } = req.query;

  const query = {
    conversation: conversationId,
    deletedFor: { $ne: userId },
  };

  if (before) {
    if (mongoose.isValidObjectId(before)) {
      const beforeDoc = await Message.findById(before).select('createdAt').lean();
      if (beforeDoc) {
        query.createdAt = { $lt: beforeDoc.createdAt };
      }
    } else if (!isNaN(Date.parse(before))) {
      query.createdAt = { $lt: new Date(before) };
    }
  } else if (after) {
    if (mongoose.isValidObjectId(after)) {
      const afterDoc = await Message.findById(after).select('createdAt').lean();
      if (afterDoc) {
        query.createdAt = { $gt: afterDoc.createdAt };
      }
    } else if (!isNaN(Date.parse(after))) {
      query.createdAt = { $gt: new Date(after) };
    }
  }

  // Fetch limit + 1 to know if more items exist
  const rawMessages = await Message.find(query)
    .sort({ createdAt: before ? -1 : 1 })
    .limit(limit + 1)
    .populate('sender', 'name username avatar')
    .populate('quiz', QUIZ_PREVIEW_SELECT)
    .populate({
      path: 'comment',
      populate: { path: 'author', select: 'name username avatar' },
    })
    .populate('reactions.user', 'name username avatar')
    .lean();

  const hasMore = rawMessages.length > limit;
  const messages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

  if (before) {
    messages.reverse(); // maintain forward chronological order
  }

  // Mark all unread messages in this conversation as read by current user
  await Message.updateMany(
    { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );

  // Reset current user's unread count in conversation
  const convDoc = await Conversation.findById(conversationId);
  if (!convDoc) throw new AppError('Conversation not found', 404);
  if (!convDoc.participants.some((participant) => toId(participant) === toId(userId))) {
    throw new AppError('Not authorized to access this conversation', 403);
  }
  if (convDoc) {
    if (!Array.isArray(convDoc.unreadCounts)) convDoc.unreadCounts = [];
    const entry = convDoc.unreadCounts.find((u) => toId(u.user) === toId(userId));
    if (entry) {
      entry.count = 0;
    } else {
      convDoc.unreadCounts.push({ user: userId, count: 0 });
    }
    await convDoc.save();
  }

  const otherParticipant = conversation.participants.find((p) => toId(p) !== toId(userId)) || conversation.participants[0];
  const oldestMsg = messages[0];
  const newestMsg = messages[messages.length - 1];

  res.json({
    success: true,
    data: {
      conversation: {
        _id: conversation._id,
        otherParticipant,
        lastMessageText: conversation.lastMessageText,
        lastMessageAt: conversation.lastMessageAt,
      },
      messages,
      total: messages.length,
      pagination: {
        limit,
        hasMore,
        nextCursor: oldestMsg ? String(oldestMsg._id) : null,
        prevCursor: newestMsg ? String(newestMsg._id) : null,
      },
    },
  });
});

// Send a message in an existing conversation
export const sendMessage = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const currentUserId = req.user._id;
  const { text, type = 'text', quizId, commentId, link, replyTo, media, quizMetadata } = req.body;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError('Invalid conversation ID', 400);
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  const isParticipant = conversation.participants.some((p) => toId(p) === toId(currentUserId));
  if (!isParticipant) {
    throw new AppError('Not authorized to send messages in this conversation', 403);
  }

  const cleanText = String(text || '').trim();
  if (!cleanText && !quizId && !commentId && !link && !media && !quizMetadata) {
    throw new AppError('Message cannot be empty', 400);
  }

  let finalType = type;
  let finalPreview = cleanText;

  if (quizId && mongoose.isValidObjectId(quizId)) {
    finalType = 'quiz_share';
    const sharedQuiz = await Quiz.findById(quizId).select('title');
    if (!finalPreview && sharedQuiz) {
      finalPreview = `Shared quiz: "${sharedQuiz.title}"`;
    }
    await Quiz.findByIdAndUpdate(quizId, {
      $inc: { shareCount: 1 },
      $set: { lastSocialActivityAt: new Date() },
    }).catch(() => {});
    await QuizShare.create({
      quiz: quizId,
      user: currentUserId,
      channel: 'direct_share',
    }).catch(() => {});
  } else if (commentId && mongoose.isValidObjectId(commentId)) {
    finalType = 'comment_share';
    if (!finalPreview) finalPreview = 'Shared a comment';
  } else if (link) {
    finalType = 'link';
  } else if (type === 'image') {
    if (!finalPreview) finalPreview = '📷 Photo';
  } else if (type === 'audio') {
    if (!finalPreview) finalPreview = '🎤 Voice message';
  } else if (type === 'document') {
    if (!finalPreview) finalPreview = `📄 ${media?.fileName || 'Document'}`;
  } else if (type === 'challenge_invite') {
    if (!finalPreview) finalPreview = '⚔️ 1v1 Challenge Invite';
  }

  const messagePayload = {
    conversation: conversation._id,
    sender: currentUserId,
    text: cleanText || finalPreview,
    type: finalType,
    quiz: quizId || null,
    comment: commentId || null,
    link: link || null,
    readBy: [currentUserId],
  };

  if (media && typeof media === 'object') {
    messagePayload.media = media;
  }

  if (quizMetadata && typeof quizMetadata === 'object') {
    messagePayload.quizMetadata = quizMetadata;
    if (quizMetadata.quizId && mongoose.isValidObjectId(quizMetadata.quizId)) {
      messagePayload.quiz = quizMetadata.quizId;
    }
  }

  if (replyTo && replyTo.messageId) {
    messagePayload.replyTo = {
      messageId: replyTo.messageId,
      senderName: String(replyTo.senderName || '').trim(),
      text: String(replyTo.text || '').trim().slice(0, 300),
    };
  }

  const message = await Message.create(messagePayload);

  // Increment unread count for other participants
  if (!Array.isArray(conversation.unreadCounts)) {
    conversation.unreadCounts = [];
  }
  const otherParticipants = conversation.participants.filter((p) => toId(p) !== toId(currentUserId));
  for (const other of otherParticipants) {
    const otherId = toId(other);
    let found = false;
    for (const entry of conversation.unreadCounts) {
      if (toId(entry.user) === otherId) {
        entry.count = (entry.count || 0) + 1;
        found = true;
        break;
      }
    }
    if (!found) {
      conversation.unreadCounts.push({ user: otherId, count: 1 });
    }
  }

  conversation.lastMessage = message._id;
  conversation.lastMessageText = cleanText || finalPreview;
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const populated = await Message.findById(message._id)
    .populate('sender', 'name username avatar')
    .populate('quiz', QUIZ_PREVIEW_SELECT)
    .populate({
      path: 'comment',
      populate: { path: 'author', select: 'name username avatar' },
    })
    .populate('reactions.user', 'name username avatar');

  // Emit real-time Socket events
  try {
    const socketServer = getIO();
    if (socketServer) {
      // 1. Broadcast to conversation room
      socketServer.to(`conv:${conversation._id}`).emit('message:new', {
        conversationId: conversation._id,
        message: populated,
      });

      // 2. Broadcast conversation update to each participant room
      for (const p of conversation.participants) {
        socketServer.to(`user:${toId(p)}`).emit('conversation:updated', {
          conversationId: conversation._id,
          lastMessage: populated,
          lastMessageText: cleanText || finalPreview,
          lastMessageAt: conversation.lastMessageAt,
          unreadCounts: conversation.unreadCounts,
        });
      }
    }
  } catch (socketErr) {
    // Non-blocking socket error
  }

  res.status(201).json({
    success: true,
    data: {
      message: populated,
    },
  });
});

// Edit a message (WhatsApp style)
export const editMessage = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const currentUserId = req.user._id;
  const { text } = req.body;

  const cleanText = String(text || '').trim();
  if (!cleanText) {
    throw new AppError('Message text cannot be empty', 400);
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  if (toId(message.sender) !== toId(currentUserId)) {
    throw new AppError('Not authorized to edit this message', 403);
  }

  if (message.isDeleted) {
    throw new AppError('Deleted message cannot be edited', 400);
  }

  message.text = cleanText;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  // If this was the last message in conversation, update conversation preview
  const conversation = await Conversation.findById(message.conversation);
  if (conversation && toId(conversation.lastMessage) === toId(message._id)) {
    conversation.lastMessageText = cleanText;
    await conversation.save();
  }

  const populated = await Message.findById(message._id)
    .populate('sender', 'name username avatar')
    .populate('quiz', QUIZ_PREVIEW_SELECT)
    .populate({
      path: 'comment',
      populate: { path: 'author', select: 'name username avatar' },
    })
    .populate('reactions.user', 'name username avatar');

  try {
    getIO()?.to(`conv:${toId(message.conversation)}`).emit('message:edited', {
      messageId: message._id,
      conversationId: toId(message.conversation),
      text: cleanText,
      isEdited: true,
      editedAt: message.editedAt,
    });
  } catch (err) {}

  res.json({
    success: true,
    data: { message: populated },
  });
});

// Delete a message (WhatsApp style: for everyone or for me)
export const deleteMessage = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const currentUserId = req.user._id;
  const mode = req.query.mode === 'me' ? 'me' : 'everyone';

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  const conversation = await Conversation.findById(message.conversation);
  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  const isParticipant = conversation.participants.some((p) => toId(p) === toId(currentUserId));
  if (!isParticipant) {
    throw new AppError('Not authorized', 403);
  }

  if (mode === 'everyone') {
    if (toId(message.sender) !== toId(currentUserId)) {
      throw new AppError('Only the sender can delete a message for everyone', 403);
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.text = 'This message was deleted';
    await message.save();

    if (toId(conversation.lastMessage) === toId(message._id)) {
      conversation.lastMessageText = 'This message was deleted';
      await conversation.save();
    }
  } else {
    // Delete for me
    if (!message.deletedFor.includes(currentUserId)) {
      message.deletedFor.push(currentUserId);
      await message.save();
    }
  }

  try {
    getIO()?.to(`conv:${toId(message.conversation)}`).emit('message:deleted', {
      messageId: message._id,
      conversationId: toId(message.conversation),
      mode,
    });
  } catch (err) {}

  res.json({
    success: true,
    data: {
      messageId: message._id,
      isDeleted: message.isDeleted,
      mode,
    },
  });
});

// Toggle reaction on a message (WhatsApp style)
export const toggleMessageReaction = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const currentUserId = req.user._id;
  const { emoji } = req.body;

  if (!emoji || typeof emoji !== 'string') {
    throw new AppError('Valid emoji is required', 400);
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  const conversation = await Conversation.findById(message.conversation);
  if (!conversation || !conversation.participants.some((p) => toId(p) === toId(currentUserId))) {
    throw new AppError('Not authorized', 403);
  }

  if (!Array.isArray(message.reactions)) {
    message.reactions = [];
  }

  const existingIndex = message.reactions.findIndex(
    (r) => toId(r.user) === toId(currentUserId) && r.emoji === emoji
  );

  if (existingIndex > -1) {
    // Remove reaction if clicked again (toggle off)
    message.reactions.splice(existingIndex, 1);
  } else {
    // Add reaction (or replace user's current reaction)
    const userOtherReactionIndex = message.reactions.findIndex(
      (r) => toId(r.user) === toId(currentUserId)
    );
    if (userOtherReactionIndex > -1) {
      message.reactions[userOtherReactionIndex].emoji = emoji;
    } else {
      message.reactions.push({ user: currentUserId, emoji });
    }
  }

  await message.save();

  const populated = await Message.findById(message._id)
    .populate('sender', 'name username avatar')
    .populate('quiz', QUIZ_PREVIEW_SELECT)
    .populate({
      path: 'comment',
      populate: { path: 'author', select: 'name username avatar' },
    })
    .populate('reactions.user', 'name username avatar');

  try {
    getIO()?.to(`conv:${toId(message.conversation)}`).emit('message:reaction_update', {
      messageId: message._id,
      conversationId: toId(message.conversation),
      reactions: populated.reactions,
    });
  } catch (err) {}

  res.json({
    success: true,
    data: { message: populated },
  });
});

// Mark conversation as read
export const markConversationRead = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError('Invalid conversation ID', 400);
  }

  const convDoc = await Conversation.findById(conversationId);
  if (convDoc) {
    if (!Array.isArray(convDoc.unreadCounts)) convDoc.unreadCounts = [];
    const entry = convDoc.unreadCounts.find((u) => toId(u.user) === toId(userId));
    if (entry) {
      entry.count = 0;
    } else {
      convDoc.unreadCounts.push({ user: userId, count: 0 });
    }
    await convDoc.save();
  }

  await Message.updateMany(
    { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId }, $set: { deliveryStatus: 'read' } }
  );

  try {
    const socketServer = getIO();
    if (socketServer) {
      socketServer.to(`conv:${conversationId}`).emit('message:read_status', {
        conversationId,
        readerId: toId(userId),
        readAt: new Date(),
      });
      socketServer.to(`user:${toId(userId)}`).emit('conversation:unread_cleared', {
        conversationId,
      });
    }
  } catch (err) {}

  res.json({
    success: true,
    data: null,
  });
});

// Total unread messages count across all conversations (for navigation badge)
export const getUnreadMessagesCount = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const conversations = await Conversation.find({ participants: userId }).select('unreadCounts').lean();
  let totalUnread = 0;

  for (const c of conversations) {
    const entry = (c.unreadCounts || []).find((u) => toId(u.user) === toId(userId));
    if (entry && entry.count > 0) {
      totalUnread += entry.count;
    }
  }

  res.json({
    success: true,
    data: {
      unreadCount: totalUnread,
    },
  });
});

// Search users to start a conversation with
export const searchMessageUsers = catchAsync(async (req, res) => {
  const currentUserId = req.user._id;
  const q = String(req.query.q || '').trim();

  // If query is provided, search by name or username
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [{ username: regex }, { name: regex }],
    })
      .select(USER_CARD_SELECT)
      .limit(20)
      .lean();

    return res.json({
      success: true,
      data: { users },
    });
  }

  // Otherwise, return frequently contacted / followed users
  const [following, followers] = await Promise.all([
    Follow.find({ follower: currentUserId }).populate('following', USER_CARD_SELECT).limit(15).lean(),
    Follow.find({ following: currentUserId }).populate('follower', USER_CARD_SELECT).limit(15).lean(),
  ]);

  const map = new Map();
  for (const f of following) {
    if (f.following && toId(f.following) !== toId(currentUserId)) {
      map.set(toId(f.following), f.following);
    }
  }
  for (const f of followers) {
    if (f.follower && toId(f.follower) !== toId(currentUserId)) {
      map.set(toId(f.follower), f.follower);
    }
  }

  // If still fewer than 5 users, pull recent public creators
  if (map.size < 5) {
    const moreUsers = await User.find({
      _id: { $ne: currentUserId, $nin: Array.from(map.keys()) },
      isProfilePublic: { $ne: false },
    })
      .select(USER_CARD_SELECT)
      .sort({ quizCount: -1, followersCount: -1 })
      .limit(10)
      .lean();

    for (const u of moreUsers) {
      map.set(toId(u), u);
    }
  }

  res.json({
    success: true,
    data: {
      users: Array.from(map.values()),
    },
  });
});
