import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Follow from '../models/Follow.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';

const USER_PUBLIC_SELECT = 'name username avatar banner bio quizCount followersCount followingCount activityCount isProfilePublic isPrivate createdAt socialLinks';

const toIdString = (value) => (value?._id ? String(value._id) : String(value || ''));

export const resolveUserByIdentifier = async (identifier, selectFields = USER_PUBLIC_SELECT) => {
  if (!identifier) return null;
  const clean = String(identifier).replace(/^@/, '').trim();
  const isId = mongoose.isValidObjectId(clean);
  const query = isId
    ? { $or: [{ _id: clean }, { username: clean.toLowerCase() }] }
    : { username: clean.toLowerCase() };
  return User.findOne(query).select(selectFields);
};

export const canViewPrivateDetails = async (targetUser, viewer) => {
  if (!targetUser) return false;
  const isPrivate = Boolean(targetUser.isPrivate || targetUser.isProfilePublic === false);
  if (!isPrivate) return true;
  if (!viewer) return false;
  if (toIdString(viewer._id) === toIdString(targetUser._id)) return true;
  if (viewer.role === 'admin') return true;
  const isFollowing = await Follow.exists({ follower: viewer._id, following: targetUser._id });
  return Boolean(isFollowing);
};

const publicQuizFilterFor = (userId, viewerId = null) => {
  const isOwner = viewerId && String(viewerId) === String(userId);
  if (isOwner) {
    return { uploader: userId };
  }
  return {
    uploader: userId,
    visibility: { $ne: 'private' },
    $or: [{ visibility: 'public' }, { isPublic: true }],
    'metadata.savedAsDraft': { $ne: true },
  };
};

export const getProfile = catchAsync(async (req, res, next) => {
  const user = await resolveUserByIdentifier(
    req.params.username,
    'name username avatar banner bio socialLinks quizCount followersCount followingCount activityCount isProfilePublic isPrivate createdAt'
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  const isOwnProfile = req.user && String(req.user._id) === String(user._id);
  const isFollowing = req.user
    ? Boolean(await Follow.exists({ follower: req.user._id, following: user._id }))
    : false;
  const isPrivate = Boolean(user.isPrivate || user.isProfilePublic === false);

  const quizCount = await Quiz.countDocuments(publicQuizFilterFor(user._id, req.user?._id));

  const profileData = {
    _id: user._id,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    banner: user.banner || '',
    bio: user.bio,
    socialLinks: user.socialLinks || [],
    quizCount,
    quizzesCount: quizCount,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    activityCount: user.activityCount || 0,
    isFollowing,
    isOwnProfile,
    isPrivate,
    isProfilePublic: !isPrivate,
    createdAt: user.createdAt,
  };

  res.json({
    success: true,
    data: { profile: profileData },
  });
});

export const getUserQuizzes = catchAsync(async (req, res, next) => {
  const user = await resolveUserByIdentifier(req.params.username, '_id isPrivate isProfilePublic');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  const canAccess = await canViewPrivateDetails(user, req.user);
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  if (!canAccess) {
    return res.json({
      success: true,
      data: {
        quizzes: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        isPrivate: true,
        requiresFollow: true,
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0,
        },
      },
    });
  }

  const filter = publicQuizFilterFor(user._id, req.user?._id);

  const quizzes = await Quiz.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('uploader', 'name username avatar')
    .lean();

  const total = await Quiz.countDocuments(filter);
  const decoratedQuizzes = quizzes.map((q) => ({
    ...q,
    isLiked: false,
    isBookmarked: false,
  }));

  res.json({
    success: true,
    data: {
      quizzes: decoratedQuizzes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
  const target = await resolveUserByIdentifier(req.params.username);
  if (!target) {
    throw new AppError('User not found', 404);
  }

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
  const target = await resolveUserByIdentifier(req.params.username);
  if (!target) {
    throw new AppError('User not found', 404);
  }

  if (toIdString(target._id) === toIdString(req.user._id)) {
    throw new AppError('You cannot unfollow yourself', 400);
  }

  const result = await Follow.deleteOne({ follower: req.user._id, following: target._id });
  if (result.deletedCount > 0) {
    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: -1 } }),
      User.findByIdAndUpdate(target._id, { $inc: { followersCount: -1 } }),
    ]);
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
  const user = await resolveUserByIdentifier(req.params.username);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const canAccess = await canViewPrivateDetails(user, req.user);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 60);
  const skip = (page - 1) * limit;

  if (!canAccess) {
    return res.json({
      success: true,
      data: {
        users: [],
        isPrivate: true,
        requiresFollow: true,
        pagination: { total: 0, page: 1, limit, pages: 0 },
      },
    });
  }

  const [edges, total] = await Promise.all([
    Follow.find({ following: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('follower', 'name username avatar bio quizCount followersCount followingCount')
      .lean(),
    Follow.countDocuments({ following: user._id }),
  ]);

  const rawUsers = edges.map((e) => e.follower).filter(Boolean);
  let decoratedUsers = rawUsers;
  if (req.user?._id) {
    const ids = rawUsers.map((u) => u._id);
    const followingSet = new Set(
      (await Follow.find({ follower: req.user._id, following: { $in: ids } }).select('following').lean()).map((f) => String(f.following))
    );
    decoratedUsers = rawUsers.map((u) => ({
      ...u,
      isFollowing: followingSet.has(String(u._id)),
    }));
  }

  res.json({
    success: true,
    data: {
      users: decoratedUsers,
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
  const user = await resolveUserByIdentifier(req.params.username);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const canAccess = await canViewPrivateDetails(user, req.user);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 60);
  const skip = (page - 1) * limit;

  if (!canAccess) {
    return res.json({
      success: true,
      data: {
        users: [],
        isPrivate: true,
        requiresFollow: true,
        pagination: { total: 0, page: 1, limit, pages: 0 },
      },
    });
  }

  const [edges, total] = await Promise.all([
    Follow.find({ follower: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('following', 'name username avatar bio quizCount followersCount followingCount')
      .lean(),
    Follow.countDocuments({ follower: user._id }),
  ]);

  const rawUsers = edges.map((e) => e.following).filter(Boolean);
  let decoratedUsers = rawUsers;
  if (req.user?._id) {
    const ids = rawUsers.map((u) => u._id);
    const followingSet = new Set(
      (await Follow.find({ follower: req.user._id, following: { $in: ids } }).select('following').lean()).map((f) => String(f.following))
    );
    decoratedUsers = rawUsers.map((u) => ({
      ...u,
      isFollowing: followingSet.has(String(u._id)),
    }));
  }

  res.json({
    success: true,
    data: {
      users: decoratedUsers,
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
  res.json({
    success: true,
    data: {
      activities: [],
      total: 0,
      pagination: { total: 0, page: 1, limit: 10, pages: 0 },
    },
  });
});

