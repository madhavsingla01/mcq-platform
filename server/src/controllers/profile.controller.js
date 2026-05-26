/**
 * Profile controller — public profiles, follow/unfollow, followers/following lists.
 */

import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Follow from '../models/Follow.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';

const normalizeUsername = (username = '') => String(username).replace(/^@/, '').toLowerCase().trim();
const publicQuizFilterFor = (userId) => ({
  uploader: userId,
  $or: [{ visibility: 'public' }, { isPublic: true }],
});
const isSameUser = (left, right) => left && right && left.toString() === right.toString();

const assertProfileVisible = (user, viewer) => {
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!user.isProfilePublic && !isSameUser(viewer?._id, user._id)) {
    throw new AppError('User not found', 404);
  }
};

const getFollowCounts = (userId) => Promise.all([
  Follow.countDocuments({ following: userId }),
  Follow.countDocuments({ follower: userId }),
]);

/**
 * GET /api/v1/users/:username
 * Get a user's public profile.
 */
export const getProfile = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  if (!username) {
    return next(new AppError('User not found', 404));
  }

  const user = await User.findOne({ username }).select(
    'name username avatar bio followersCount followingCount quizCount socialLinks createdAt isProfilePublic'
  );

  try {
    assertProfileVisible(user, req.user);
  } catch (error) {
    return next(error);
  }

  const [quizCount, followersCount, followingCount] = await Promise.all([
    Quiz.countDocuments(publicQuizFilterFor(user._id)),
    Follow.countDocuments({ following: user._id }),
    Follow.countDocuments({ follower: user._id }),
  ]);

  const profileData = {
    _id: user._id,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    followersCount,
    followingCount,
    quizCount,
    quizzesCount: quizCount,
    socialLinks: user.socialLinks,
    createdAt: user.createdAt,
    isProfilePublic: user.isProfilePublic,
    isFollowing: false,
  };

  // If viewer is logged in, check if they follow this user
  if (req.user && !isSameUser(req.user._id, user._id)) {
    const followDoc = await Follow.findOne({
      follower: req.user._id,
      following: user._id,
    });
    profileData.isFollowing = !!followDoc;
  }

  res.json({
    success: true,
    data: { profile: profileData },
  });
});

/**
 * GET /api/v1/users/:username/quizzes
 * Get a user's public quizzes with pagination.
 */
export const getUserQuizzes = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  if (!username) {
    return next(new AppError('User not found', 404));
  }

  const user = await User.findOne({ username }).select(
    '_id isProfilePublic'
  );

  try {
    assertProfileVisible(user, req.user);
  } catch (error) {
    return next(error);
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 12;
  const skip = (page - 1) * limit;

  const filter = publicQuizFilterFor(user._id);

  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .select('title category difficulty description thumbnail questionCount totalAttempts avgScore createdAt visibility isPublic tags')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      quizzes: quizzes.map((quiz) => ({
        ...quiz,
        averageScore: quiz.avgScore || 0,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/v1/users/:username/follow
 * Follow a user.
 */
export const followUser = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  const targetUser = await User.findOne({ username });
  if (!targetUser) {
    return next(new AppError('User not found', 404));
  }

  // Cannot follow yourself
  if (isSameUser(req.user._id, targetUser._id)) {
    return next(new AppError('You cannot follow yourself', 400));
  }

  try {
    await Follow.create({
      follower: req.user._id,
      following: targetUser._id,
    });
  } catch (error) {
    // Handle duplicate follow (E11000)
    if (error.code !== 11000) {
      throw error;
    }
  }

  const [[followersCount], [, currentUserFollowingCount]] = await Promise.all([
    getFollowCounts(targetUser._id),
    getFollowCounts(req.user._id),
  ]);

  await Promise.all([
    User.findByIdAndUpdate(targetUser._id, { followersCount }),
    User.findByIdAndUpdate(req.user._id, { followingCount: currentUserFollowingCount }),
  ]);

  res.status(201).json({
    success: true,
    message: `You are now following ${targetUser.username}`,
    data: {
      isFollowing: true,
      followersCount,
    },
  });
});

/**
 * DELETE /api/v1/users/:username/follow
 * Unfollow a user.
 */
export const unfollowUser = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  const targetUser = await User.findOne({ username });
  if (!targetUser) {
    return next(new AppError('User not found', 404));
  }

  if (isSameUser(req.user._id, targetUser._id)) {
    return next(new AppError('You cannot unfollow yourself', 400));
  }

  const result = await Follow.deleteOne({
    follower: req.user._id,
    following: targetUser._id,
  });

  const [[followersCount], [, currentUserFollowingCount]] = await Promise.all([
    getFollowCounts(targetUser._id),
    getFollowCounts(req.user._id),
  ]);

  await Promise.all([
    User.findByIdAndUpdate(targetUser._id, { followersCount }),
    User.findByIdAndUpdate(req.user._id, { followingCount: currentUserFollowingCount }),
  ]);

  res.json({
    success: true,
    message: result.deletedCount > 0
      ? `You have unfollowed ${targetUser.username}`
      : `You were not following ${targetUser.username}`,
    data: {
      isFollowing: false,
      followersCount,
    },
  });
});

/**
 * GET /api/v1/users/:username/followers
 * Get a user's followers with pagination.
 */
export const getFollowers = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  const user = await User.findOne({ username }).select('_id isProfilePublic');
  try {
    assertProfileVisible(user, req.user);
  } catch (error) {
    return next(error);
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const skip = (page - 1) * limit;

  const [followers, total] = await Promise.all([
    Follow.find({ following: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('follower', 'name username avatar'),
    Follow.countDocuments({ following: user._id }),
  ]);

  res.json({
    success: true,
    data: {
      followers: followers.map((f) => f.follower).filter(Boolean),
      users: followers.map((f) => f.follower).filter(Boolean),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/v1/users/:username/following
 * Get users that a user is following, with pagination.
 */
export const getFollowing = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  const user = await User.findOne({ username }).select('_id isProfilePublic');
  try {
    assertProfileVisible(user, req.user);
  } catch (error) {
    return next(error);
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const skip = (page - 1) * limit;

  const [following, total] = await Promise.all([
    Follow.find({ follower: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('following', 'name username avatar'),
    Follow.countDocuments({ follower: user._id }),
  ]);

  res.json({
    success: true,
    data: {
      following: following.map((f) => f.following).filter(Boolean),
      users: following.map((f) => f.following).filter(Boolean),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export default { getProfile, getUserQuizzes, followUser, unfollowUser, getFollowers, getFollowing };
