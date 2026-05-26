/**
 * Auth controller — register, login, logout, refresh, me.
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import QuestionAnalytics from '../models/QuestionAnalytics.model.js';
import QuizSession from '../models/QuizSession.model.js';
import SessionMessage from '../models/SessionMessage.model.js';
import JoinedSession from '../models/JoinedSession.model.js';
import Upload from '../models/Upload.model.js';
import Follow from '../models/Follow.model.js';
import env from '../config/env.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { recordEvent } from '../services/activity/activity.service.js';

const authCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/',
};

const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', authCookieOptions);
  res.clearCookie('refreshToken', authCookieOptions);
};

/**
 * Generate access + refresh tokens and set as httpOnly cookies.
 */
const generateTokens = (user, res) => {
  const accessToken = jwt.sign({ id: user._id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const refreshToken = jwt.sign({ id: user._id }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

  res.cookie('accessToken', accessToken, {
    ...authCookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...authCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return { accessToken, refreshToken };
};

/**
 * Generate a unique username based on the user's name
 */
const generateUniqueUsername = async (name) => {
  // Convert name to lowercase, replace non-alphanumeric with empty, spaces with underscore
  let baseName = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '_');
  if (!baseName || baseName.length < 3) baseName = 'user' + Math.floor(Math.random() * 1000);
  if (baseName.length > 25) baseName = baseName.substring(0, 25);
  
  let username = baseName;
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 10) {
    const existing = await User.findOne({ username });
    if (!existing) {
      isUnique = true;
    } else {
      // Append random numbers
      username = `${baseName}_${Math.floor(Math.random() * 10000)}`;
      attempts++;
    }
  }
  
  return username;
};

/**
 * POST /api/auth/register
 */
export const register = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }

  const username = await generateUniqueUsername(name);

  const user = await User.create({ name, email, password, username });

  const { refreshToken } = generateTokens(user, res);

  // Store refresh token
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  await recordEvent({
    req,
    eventType: 'USER_REGISTERED',
    category: 'auth',
    userId: user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: { user },
  });
});

/**
 * POST /api/auth/login
 */
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Backfill username for existing users
  if (!user.username) {
    user.username = await generateUniqueUsername(user.name);
  }

  const { refreshToken } = generateTokens(user, res);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  await recordEvent({
    req,
    eventType: 'USER_LOGGED_IN',
    category: 'auth',
    userId: user._id,
  });

  // Remove password from response
  user.password = undefined;

  res.json({
    success: true,
    message: 'Logged in successfully',
    data: { user },
  });
});

/**
 * POST /api/auth/logout
 */
export const logout = catchAsync(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  } else if (req.cookies?.refreshToken) {
    try {
      const decoded = jwt.verify(req.cookies.refreshToken, env.JWT_REFRESH_SECRET);
      await User.findOneAndUpdate(
        { _id: decoded.id, refreshToken: req.cookies.refreshToken },
        { refreshToken: null }
      );
    } catch {
    }
  }

  clearAuthCookies(res);
  await recordEvent({
    req,
    eventType: 'USER_LOGGED_OUT',
    category: 'auth',
    userId: req.user?._id || null,
  });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * POST /api/auth/refresh
 */
export const refresh = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    clearAuthCookies(res);
    return next(new AppError('No refresh token', 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch {
    clearAuthCookies(res);
    return next(new AppError('Invalid refresh token', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');

  if (!user || user.refreshToken !== token) {
    clearAuthCookies(res);
    return next(new AppError('Invalid refresh token', 401));
  }

  const { refreshToken: newRefreshToken } = generateTokens(user, res);

  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Token refreshed',
  });
});

/**
 * GET /api/auth/me
 */
export const getMe = catchAsync(async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

/**
 * PATCH /api/auth/me
 * Update current user's profile (name, email, avatar, preferences)
 */
export const updateMe = catchAsync(async (req, res, next) => {
  const allowed = [
    'name', 'email', 'avatar', 'preferences',
    'phone', 'dateOfBirth', 'gender', 'address', 'bio', 'age', 'password', 'username',
    'isProfilePublic', 'socialLinks'
  ];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update', 400));
  }

  // Password change requires confirmation
  if (updates.password !== undefined) {
    if (req.body.confirmPassword === undefined || req.body.confirmPassword !== updates.password) {
      return next(new AppError('Password confirmation does not match', 400));
    }
  }

  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError('User not found', 404));

  // Check username uniqueness
  if (updates.username !== undefined && updates.username !== user.username) {
    const existing = await User.findOne({ username: updates.username });
    if (existing) {
      return next(new AppError('Username is already taken', 400));
    }
    user.username = updates.username;
  }

  if (updates.name !== undefined) user.name = updates.name;
  if (updates.email !== undefined) user.email = updates.email;
  if (updates.avatar !== undefined) user.avatar = updates.avatar;
  if (updates.phone !== undefined) user.phone = updates.phone;
  if (updates.dateOfBirth !== undefined) {
    const d = new Date(updates.dateOfBirth);
    if (!Number.isNaN(d.getTime())) user.dateOfBirth = d;
  }
  if (updates.gender !== undefined) user.gender = updates.gender;
  if (updates.age !== undefined) user.age = Number(updates.age) || undefined;
  if (updates.address !== undefined && typeof updates.address === 'object') user.address = updates.address;
  if (updates.bio !== undefined) user.bio = updates.bio;
  if (updates.isProfilePublic !== undefined) user.isProfilePublic = updates.isProfilePublic;
  if (updates.socialLinks !== undefined && typeof updates.socialLinks === 'object') {
    user.socialLinks = { ...(user.socialLinks || {}), ...updates.socialLinks };
  }

  if (updates.preferences !== undefined && typeof updates.preferences === 'object') {
    user.preferences = { ...(user.preferences || {}), ...updates.preferences };
  }

  if (updates.password !== undefined) {
    user.password = updates.password;
  }

  await user.save({ validateBeforeSave: true });
  await recordEvent({
    req,
    eventType: updates.preferences ? 'USER_PREFERENCES_UPDATED' : 'USER_PROFILE_UPDATED',
    category: updates.preferences ? 'settings' : 'auth',
    userId: req.user._id,
    metadata: {
      fields: Object.keys(updates),
      preferences: updates.preferences || undefined,
    },
  });
  // Ensure sensitive fields are not returned
  user.password = undefined;
  user.refreshToken = undefined;

  res.json({ success: true, message: 'Profile updated', data: { user } });
});

export const deleteAccount = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  // 1. Find all quizzes created by the user
  const quizzes = await Quiz.find({ uploader: userId }, '_id');
  const quizIds = quizzes.map(q => q._id);

  // 2. Find all sessions created for these quizzes
  const quizSessions = await QuizSession.find({ quizId: { $in: quizIds } }, '_id');
  const sessionIds = quizSessions.map(s => s._id);
  const followDocs = await Follow.find({
    $or: [{ follower: userId }, { following: userId }],
  }, 'follower following').lean();
  const affectedFollowUserIds = [
    ...new Set(
      followDocs
        .flatMap((follow) => [follow.follower?.toString(), follow.following?.toString()])
        .filter((id) => id && id !== userId.toString())
    ),
  ];

  // 3. Delete everything cascaded
  await Promise.all([
    Quiz.deleteMany({ uploader: userId }),
    Question.deleteMany({ quizId: { $in: quizIds } }),
    Attempt.deleteMany({ userId: userId }),
    QuestionAnalytics.deleteMany({ quizId: { $in: quizIds } }),
    QuizSession.deleteMany({ quizId: { $in: quizIds } }),
    SessionMessage.deleteMany({ $or: [{ sessionId: { $in: sessionIds } }, { senderId: userId }] }),
    JoinedSession.deleteMany({ $or: [{ sessionId: { $in: sessionIds } }, { userId: userId }] }),
    Upload.deleteMany({ userId: userId }),
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    User.deleteOne({ _id: userId })
  ]);

  await Promise.all(affectedFollowUserIds.map(async (affectedUserId) => {
    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: affectedUserId }),
      Follow.countDocuments({ follower: affectedUserId }),
    ]);
    return User.findByIdAndUpdate(affectedUserId, { followersCount, followingCount });
  }));

  clearAuthCookies(res);

  res.json({
    success: true,
    message: 'Account deleted successfully',
  });
});

/**
 * GET /api/auth/check-username
 */
export const checkUsername = catchAsync(async (req, res, next) => {
  const { username } = req.query;
  if (!username) {
    return res.json({ success: true, available: false, message: 'Username is required' });
  }

  // Regex validation
  const isValid = /^[a-z0-9_.]+$/.test(username);
  if (!isValid || username.length < 3 || username.length > 30) {
    return res.json({ success: true, available: false, message: 'Invalid username format' });
  }

  // Check if taken by someone else
  // If the user is logged in, they can check if it's theirs
  const existing = await User.findOne({ username });
  if (existing) {
    // If it's the current user's own username, say it's available (for them)
    if (req.user && existing._id.toString() === req.user._id.toString()) {
      return res.json({ success: true, available: true });
    }
    return res.json({ success: true, available: false, message: 'Username is already taken' });
  }

  res.json({ success: true, available: true });
});

/**
 * @desc    Search users by username prefix (for invite-only suggestions)
 * @route   GET /api/v1/auth/users/search?q=...
 * @access  Optional auth
 */
export const searchUsers = async (req, res, next) => {
  try {
    const q = req.query.q?.trim() || '';
    if (!q || q.length < 1) {
      return res.status(200).json({ success: true, data: [] });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      isProfilePublic: { $ne: false },
      $or: [
        { username: regex },
        { name: regex },
      ],
    })
      .select('username name avatar bio followersCount quizCount')
      .limit(10)
      .lean();

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

export default { register, login, logout, refresh, getMe, updateMe, deleteAccount, checkUsername, searchUsers };
