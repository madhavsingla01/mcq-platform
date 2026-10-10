import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Follow from '../models/Follow.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { decorateQuizzesForViewer } from '../services/social/activity.service.js';

const normalizeUsername = (username = '') => String(username).replace(/^@/, '').toLowerCase().trim();
const publicQuizFilterFor = (userId) => ({
  uploader: userId,
  $or: [{ visibility: 'public' }, { isPublic: true }],
});

const assertProfileVisible = (user, viewer) => {
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const isOwner = viewer && String(viewer._id) === String(user._id);
  const isAdmin = viewer?.role === 'admin';
  if (user.isProfilePublic === false && !isOwner && !isAdmin) {
    throw new AppError('This profile is private', 403);
  }
};

export const getProfile = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  if (!username) {
    return next(new AppError('User not found', 404));
  }

  const user = await User.findOne({ username }).select(
    'name username avatar bio socialLinks quizCount followersCount followingCount activityCount isProfilePublic createdAt'
  );

  try {
    assertProfileVisible(user, req.user);
  } catch (error) {
    return next(error);
  }

  const quizCount = await Quiz.countDocuments(publicQuizFilterFor(user._id));
  const isFollowing = req.user
    ? Boolean(await Follow.exists({ follower: req.user._id, following: user._id }))
    : false;
  const isOwnProfile = req.user && String(req.user._id) === String(user._id);

  const profileData = {
    _id: user._id,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    socialLinks: user.socialLinks || [],
    quizCount,
    quizzesCount: quizCount,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    activityCount: user.activityCount || 0,
    isFollowing,
    isOwnProfile,
    createdAt: user.createdAt,
  };

  res.json({
    success: true,
    data: { profile: profileData },
  });
});

export const getUserQuizzes = catchAsync(async (req, res, next) => {
  const username = normalizeUsername(req.params.username);

  if (!username) {
    return next(new AppError('User not found', 404));
  }

  const user = await User.findOne({ username }).select('_id');
  
  try {
    assertProfileVisible(user, req.user);
  } catch (error) {
    return next(error);
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = publicQuizFilterFor(user._id);

  const quizzes = await Quiz.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('uploader', 'name username avatar')
    .lean();

  const total = await Quiz.countDocuments(filter);
  const decoratedQuizzes = await decorateQuizzesForViewer(quizzes, req.user?._id);

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
