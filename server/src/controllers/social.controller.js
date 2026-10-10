import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Follow from '../models/Follow.model.js';
import QuizInteraction from '../models/QuizInteraction.model.js';
import QuizComment from '../models/QuizComment.model.js';
import QuizShare from '../models/QuizShare.model.js';
import Activity from '../models/Activity.model.js';
import Notification from '../models/Notification.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import {
  decorateQuizzesForViewer,
  isPublicQuiz,
  publicQuizFilter,
  recordActivity,
} from '../services/social/activity.service.js';

const USER_PUBLIC_SELECT = 'name username avatar bio quizCount followersCount followingCount activityCount isProfilePublic createdAt socialLinks';
const USER_LIST_SELECT = 'name username avatar bio quizCount followersCount followingCount';
const QUIZ_FEED_SELECT = 'title description category difficulty thumbnail visibility isPublic uploader questionCount totalAttempts avgScore likeCount commentCount bookmarkCount shareCount lastSocialActivityAt createdAt tags';

const toIdString = (value) => (value?._id ? String(value._id) : String(value || ''));
const normalizeUsername = (username = '') => String(username).replace(/^@/, '').toLowerCase().trim();

const clampPagination = (query, defaultLimit = 12, maxLimit = 50) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensurePublicProfileAccess = (user, viewer) => {
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const isOwner = viewer && toIdString(viewer._id) === toIdString(user._id);
  const isAdmin = viewer?.role === 'admin';
  if (user.isProfilePublic === false && !isOwner && !isAdmin) {
    throw new AppError('This profile is private', 403);
  }
};

const getPublicQuiz = async (quizId) => {
  if (!mongoose.isValidObjectId(quizId)) {
    throw new AppError('Invalid quiz id', 400);
  }

  const quiz = await Quiz.findOne({ _id: quizId, ...publicQuizFilter })
    .populate('uploader', USER_LIST_SELECT);

  if (!quiz || !isPublicQuiz(quiz)) {
    throw new AppError('Public quiz not found', 404);
  }

  return quiz;
};

const decorateUsersForViewer = async (users, viewerId) => {
  const plainUsers = users.map((user) => (typeof user.toObject === 'function' ? user.toObject() : user));
  if (!viewerId || plainUsers.length === 0) {
    return plainUsers.map((user) => ({ ...user, isFollowing: false }));
  }

  const userIds = plainUsers.map((user) => user._id);
  const follows = await Follow.find({
    follower: viewerId,
    following: { $in: userIds },
  }).select('following').lean();
  const followedIds = new Set(follows.map((follow) => toIdString(follow.following)));

  return plainUsers.map((user) => ({
    ...user,
    isFollowing: followedIds.has(toIdString(user._id)),
  }));
};

const syncNonNegativeUserCounters = async (userIds) => {
  await Promise.all(
    userIds.filter(Boolean).map((userId) => (
      User.updateOne(
        { _id: userId },
        [
          {
            $set: {
              followersCount: { $max: ['$followersCount', 0] },
              followingCount: { $max: ['$followingCount', 0] },
            },
          },
        ]
      )
    ))
  );
};

const syncNonNegativeQuizCounters = async (quizId) => {
  await Quiz.updateOne(
    { _id: quizId },
    [
      {
        $set: {
          likeCount: { $max: ['$likeCount', 0] },
          bookmarkCount: { $max: ['$bookmarkCount', 0] },
          commentCount: { $max: ['$commentCount', 0] },
          shareCount: { $max: ['$shareCount', 0] },
        },
      },
    ]
  );
};

const buildQuizQuery = async ({ req, publicOnly = true }) => {
  const search = String(req.query.search || '').trim();
  const filters = [publicOnly ? publicQuizFilter : {}];

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const users = await User.find({
      isProfilePublic: { $ne: false },
      $or: [{ username: regex }, { name: regex }],
    }).select('_id').limit(100).lean();

    filters.push({
      $or: [
        { title: regex },
        { description: regex },
        { category: regex },
        { tags: regex },
        { uploader: { $in: users.map((user) => user._id) } },
      ],
    });
  }

  if (req.query.category) {
    filters.push({ category: String(req.query.category).trim() });
  }

  if (req.query.difficulty) {
    filters.push({ difficulty: String(req.query.difficulty).trim() });
  }

  return filters.length === 1 ? filters[0] : { $and: filters };
};

const sortForQuery = (query) => {
  if (query.sort === 'popular') {
    return { likeCount: -1, totalAttempts: -1, commentCount: -1, createdAt: -1 };
  }
  if (query.sort === 'top') {
    return { avgScore: -1, totalAttempts: -1, likeCount: -1, createdAt: -1 };
  }
  if (query.sort === 'active') {
    return { lastSocialActivityAt: -1, createdAt: -1 };
  }
  return { createdAt: -1 };
};

export const getFeed = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 12, 40);
  const scope = req.query.scope === 'following' ? 'following' : 'all';
  const filters = [await buildQuizQuery({ req, publicOnly: true })];

  if (scope === 'following') {
    if (!req.user) {
      throw new AppError('Log in to view following feed', 401);
    }

    const followingIds = await Follow.distinct('following', { follower: req.user._id });
    const allowedUploaders = [...followingIds, req.user._id];

    if (!allowedUploaders.length) {
      return res.json({
        success: true,
        data: {
          items: [],
          pagination: { total: 0, page, limit, pages: 0 },
        },
      });
    }

    filters.push({ uploader: { $in: allowedUploaders } });
  }

  const filter = filters.length === 1 ? filters[0] : { $and: filters };
  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .select(QUIZ_FEED_SELECT)
      .sort(sortForQuery({ ...req.query, sort: req.query.sort || 'active' }))
      .skip(skip)
      .limit(limit)
      .populate('uploader', USER_LIST_SELECT)
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  const decorated = await decorateQuizzesForViewer(quizzes, req.user?._id);

  res.json({
    success: true,
    data: {
      items: decorated.map((quiz) => ({ type: 'quiz', quiz })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const getExplore = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 18, 60);
  const filter = await buildQuizQuery({ req, publicOnly: true });
  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .select(QUIZ_FEED_SELECT)
      .sort(sortForQuery(req.query))
      .skip(skip)
      .limit(limit)
      .populate('uploader', USER_LIST_SELECT)
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      quizzes: await decorateQuizzesForViewer(quizzes, req.user?._id),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const getBookmarks = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 12, 40);
  const [interactions, total] = await Promise.all([
    QuizInteraction.find({ user: req.user._id, type: 'bookmark' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'quiz',
        match: publicQuizFilter,
        select: QUIZ_FEED_SELECT,
        populate: { path: 'uploader', select: USER_LIST_SELECT },
      })
      .lean(),
    QuizInteraction.countDocuments({ user: req.user._id, type: 'bookmark' }),
  ]);

  const quizzes = interactions.map((item) => item.quiz).filter(Boolean);

  res.json({
    success: true,
    data: {
      quizzes: await decorateQuizzesForViewer(quizzes, req.user._id),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const followUser = catchAsync(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const target = await User.findOne({ username }).select(USER_PUBLIC_SELECT);
  ensurePublicProfileAccess(target, req.user);

  if (toIdString(target._id) === toIdString(req.user._id)) {
    throw new AppError('You cannot follow yourself', 400);
  }

  const result = await Follow.updateOne(
    { follower: req.user._id, following: target._id },
    { $setOnInsert: { follower: req.user._id, following: target._id } },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: 1 } }),
      User.findByIdAndUpdate(target._id, { $inc: { followersCount: 1 } }),
      recordActivity({
        actorId: req.user._id,
        verb: 'followed',
        targetUserId: target._id,
        visibility: 'public',
      }),
    ]);
  }

  const refreshed = await User.findById(target._id).select(USER_PUBLIC_SELECT).lean();

  res.json({
    success: true,
    data: {
      profile: {
        ...refreshed,
        isFollowing: true,
      },
    },
  });
});

export const unfollowUser = catchAsync(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const target = await User.findOne({ username }).select(USER_PUBLIC_SELECT);
  ensurePublicProfileAccess(target, req.user);

  if (toIdString(target._id) === toIdString(req.user._id)) {
    throw new AppError('You cannot unfollow yourself', 400);
  }

  const result = await Follow.deleteOne({ follower: req.user._id, following: target._id });
  if (result.deletedCount > 0) {
    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: -1 } }),
      User.findByIdAndUpdate(target._id, { $inc: { followersCount: -1 } }),
    ]);
    await syncNonNegativeUserCounters([req.user._id, target._id]);
  }

  const refreshed = await User.findById(target._id).select(USER_PUBLIC_SELECT).lean();

  res.json({
    success: true,
    data: {
      profile: {
        ...refreshed,
        isFollowing: false,
      },
    },
  });
});

export const listFollowers = catchAsync(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const user = await User.findOne({ username }).select(USER_PUBLIC_SELECT);
  ensurePublicProfileAccess(user, req.user);

  const { page, limit, skip } = clampPagination(req.query, 20, 60);
  const [edges, total] = await Promise.all([
    Follow.find({ following: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('follower', USER_LIST_SELECT)
      .lean(),
    Follow.countDocuments({ following: user._id }),
  ]);

  const users = await decorateUsersForViewer(edges.map((edge) => edge.follower).filter(Boolean), req.user?._id);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const listFollowing = catchAsync(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const user = await User.findOne({ username }).select(USER_PUBLIC_SELECT);
  ensurePublicProfileAccess(user, req.user);

  const { page, limit, skip } = clampPagination(req.query, 20, 60);
  const [edges, total] = await Promise.all([
    Follow.find({ follower: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('following', USER_LIST_SELECT)
      .lean(),
    Follow.countDocuments({ follower: user._id }),
  ]);

  const users = await decorateUsersForViewer(edges.map((edge) => edge.following).filter(Boolean), req.user?._id);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const getUserActivity = catchAsync(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const user = await User.findOne({ username }).select(USER_PUBLIC_SELECT);
  ensurePublicProfileAccess(user, req.user);

  const { page, limit, skip } = clampPagination(req.query, 12, 40);
  const [activities, total] = await Promise.all([
    Activity.find({ actor: user._id, visibility: 'public' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', USER_LIST_SELECT)
      .populate('targetUser', USER_LIST_SELECT)
      .populate({
        path: 'quiz',
        match: publicQuizFilter,
        select: QUIZ_FEED_SELECT,
        populate: { path: 'uploader', select: USER_LIST_SELECT },
      })
      .lean(),
    Activity.countDocuments({ actor: user._id, visibility: 'public' }),
  ]);

  res.json({
    success: true,
    data: {
      activities: activities.filter((activity) => activity.verb === 'followed' || activity.quiz),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const setInteraction = async ({ req, res, type, active }) => {
  const quiz = await getPublicQuiz(req.params.quizId);
  const filter = { user: req.user._id, quiz: quiz._id, type };
  const countField = type === 'like' ? 'likeCount' : 'bookmarkCount';

  if (active) {
    const result = await QuizInteraction.updateOne(
      filter,
      { $setOnInsert: filter },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      await Quiz.findByIdAndUpdate(quiz._id, {
        $inc: { [countField]: 1 },
        $set: { lastSocialActivityAt: new Date() },
      });

      if (type === 'like') {
        await recordActivity({
          actorId: req.user._id,
          verb: 'quiz_liked',
          quizId: quiz._id,
          notifyRecipientId: quiz.uploader?._id,
          visibility: 'public',
        });
      }
    }
  } else {
    const result = await QuizInteraction.deleteOne(filter);
    if (result.deletedCount > 0) {
      await Quiz.findByIdAndUpdate(quiz._id, { $inc: { [countField]: -1 } });
      await syncNonNegativeQuizCounters(quiz._id);
    }
  }

  const updatedQuiz = await Quiz.findById(quiz._id)
    .select(QUIZ_FEED_SELECT)
    .populate('uploader', USER_LIST_SELECT)
    .lean();
  const [decorated] = await decorateQuizzesForViewer([updatedQuiz], req.user._id);

  res.json({
    success: true,
    data: { quiz: decorated },
  });
};

export const likeQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'like', active: true }));
export const unlikeQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'like', active: false }));
export const bookmarkQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'bookmark', active: true }));
export const unbookmarkQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'bookmark', active: false }));

export const shareQuiz = catchAsync(async (req, res) => {
  const quiz = await getPublicQuiz(req.params.quizId);
  await QuizShare.create({
    quiz: quiz._id,
    user: req.user._id,
    channel: String(req.body.channel || 'copy_link').slice(0, 40),
    clientSessionId: String(req.get('x-client-session-id') || '').slice(0, 120),
  });

  await Quiz.findByIdAndUpdate(quiz._id, {
    $inc: { shareCount: 1 },
    $set: { lastSocialActivityAt: new Date() },
  });

  await recordActivity({
    actorId: req.user._id,
    verb: 'quiz_shared',
    quizId: quiz._id,
    visibility: 'public',
  });

  const updatedQuiz = await Quiz.findById(quiz._id)
    .select(QUIZ_FEED_SELECT)
    .populate('uploader', USER_LIST_SELECT)
    .lean();
  const [decorated] = await decorateQuizzesForViewer([updatedQuiz], req.user._id);

  res.status(201).json({
    success: true,
    data: { quiz: decorated },
  });
});

export const listComments = catchAsync(async (req, res) => {
  await getPublicQuiz(req.params.quizId);
  const { page, limit, skip } = clampPagination(req.query, 10, 50);

  const [comments, total] = await Promise.all([
    QuizComment.find({ quiz: req.params.quizId, status: 'active' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', USER_LIST_SELECT)
      .lean(),
    QuizComment.countDocuments({ quiz: req.params.quizId, status: 'active' }),
  ]);

  res.json({
    success: true,
    data: {
      comments,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const createComment = catchAsync(async (req, res) => {
  const quiz = await getPublicQuiz(req.params.quizId);
  const body = String(req.body.body || '').trim();

  if (body.length < 1) {
    throw new AppError('Comment cannot be empty', 400);
  }

  if (body.length > 1000) {
    throw new AppError('Comment must be at most 1000 characters', 400);
  }

  const comment = await QuizComment.create({
    quiz: quiz._id,
    author: req.user._id,
    body,
    parentComment: req.body.parentComment || null,
  });

  await Quiz.findByIdAndUpdate(quiz._id, {
    $inc: { commentCount: 1 },
    $set: { lastSocialActivityAt: new Date() },
  });

  await recordActivity({
    actorId: req.user._id,
    verb: 'commented',
    quizId: quiz._id,
    commentId: comment._id,
    notifyRecipientId: quiz.uploader?._id,
    visibility: 'public',
  });

  const populated = await QuizComment.findById(comment._id)
    .populate('author', USER_LIST_SELECT)
    .lean();

  res.status(201).json({
    success: true,
    data: { comment: populated },
  });
});

export const updateComment = catchAsync(async (req, res) => {
  const comment = await QuizComment.findById(req.params.commentId);
  if (!comment || comment.status !== 'active') {
    throw new AppError('Comment not found', 404);
  }

  const isOwner = toIdString(comment.author) === toIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new AppError('Not authorized to edit this comment', 403);
  }

  const body = String(req.body.body || '').trim();
  if (!body) {
    throw new AppError('Comment cannot be empty', 400);
  }

  comment.body = body;
  comment.editedAt = new Date();
  await comment.save();

  const populated = await QuizComment.findById(comment._id)
    .populate('author', USER_LIST_SELECT)
    .lean();

  res.json({
    success: true,
    data: { comment: populated },
  });
});

export const deleteComment = catchAsync(async (req, res) => {
  const comment = await QuizComment.findById(req.params.commentId).populate('quiz', 'uploader');
  if (!comment || comment.status !== 'active') {
    throw new AppError('Comment not found', 404);
  }

  const isOwner = toIdString(comment.author) === toIdString(req.user._id);
  const isQuizOwner = toIdString(comment.quiz?.uploader) === toIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isQuizOwner && !isAdmin) {
    throw new AppError('Not authorized to delete this comment', 403);
  }

  comment.status = 'deleted';
  comment.body = '[deleted]';
  await comment.save();

  await Quiz.findByIdAndUpdate(comment.quiz?._id || comment.quiz, { $inc: { commentCount: -1 } });
  await syncNonNegativeQuizCounters(comment.quiz?._id || comment.quiz);

  res.json({
    success: true,
    data: null,
  });
});

export const getNotifications = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 20, 60);
  const [notifications, total, unread] = await Promise.all([
    Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', USER_LIST_SELECT)
      .populate('quiz', 'title')
      .populate('comment', 'body')
      .lean(),
    Notification.countDocuments({ recipient: req.user._id }),
    Notification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);

  res.json({
    success: true,
    data: {
      notifications,
      unread,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const markNotificationRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  res.json({
    success: true,
    data: { notification },
  });
});

export const markAllNotificationsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { readAt: new Date() }
  );

  res.json({
    success: true,
    data: null,
  });
});
