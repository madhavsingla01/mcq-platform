import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Follow from '../models/Follow.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { decorateQuizzesForViewer, publicQuizFilter } from '../services/social/activity.service.js';
import { canViewPrivateDetails, resolveUserByIdentifier } from './social.controller.js';

const publicQuizFilterFor = (userId, viewerId = null) => {
  const isOwner = viewerId && String(viewerId) === String(userId);
  if (isOwner) {
    return { uploader: userId };
  }
  return {
    uploader: userId,
    ...publicQuizFilter,
  };
};

export const getProfile = catchAsync(async (req, res, next) => {
  const user = await resolveUserByIdentifier(
    req.params.username,
    'name username avatar banner bio socialLinks quizCount followersCount followingCount activityCount isProfilePublic isPrivate preferences createdAt'
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  const isOwnProfile = req.user && String(req.user._id) === String(user._id);
  const canViewDetails = await canViewPrivateDetails(user, req.user);
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
    bio: canViewDetails ? user.bio : '',
    socialLinks: canViewDetails ? (user.socialLinks || []) : [],
    quizCount,
    quizzesCount: quizCount,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    activityCount: user.activityCount || 0,
    isFollowing,
    isOwnProfile,
    isPrivate,
    isProfilePublic: !isPrivate,
    showRankOnProfile: user.preferences?.showRankOnProfile !== false,
    preferences: isOwnProfile ? user.preferences : { showRankOnProfile: user.preferences?.showRankOnProfile !== false },
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
