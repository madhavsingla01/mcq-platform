/**
 * Auth controller — register, login, logout, refresh, me.
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import Upload from '../models/Upload.model.js';
import Follow from '../models/Follow.model.js';
import env from '../config/env.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { clearCsrfCookie, setCsrfCookie } from '../middleware/csrf.middleware.js';
import { deleteQuizSocialData, deleteUserSocialData } from '../services/social/activity.service.js';

const authCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/',
};

const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', authCookieOptions);
  res.clearCookie('refreshToken', authCookieOptions);
  clearCsrfCookie(res);
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

  setCsrfCookie(res);

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
 * GET /api/auth/bootstrap
 * Returns the current session state without using 401 for anonymous users.
 */
export const bootstrapSession = catchAsync(async (req, res) => {
  const accessToken = req.cookies?.accessToken;

  if (accessToken) {
    try {
      const decoded = jwt.verify(accessToken, env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -refreshToken');

      if (user) {
        setCsrfCookie(res);
        return res.json({
          success: true,
          data: { authenticated: true, user },
        });
      }
    } catch {
      // Fall through to refresh-token bootstrap.
    }
  }

  const token = req.cookies?.refreshToken;

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.id).select('+refreshToken');

      if (user && user.refreshToken === token) {
        const { refreshToken } = generateTokens(user, res);
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        user.password = undefined;
        user.refreshToken = undefined;

        return res.json({
          success: true,
          data: { authenticated: true, user },
        });
      }
    } catch {
      // Anonymous response below is intentional for expired sessions.
    }
  }

  clearAuthCookies(res);
  return res.json({
    success: true,
    data: { authenticated: false, user: null },
  });
});

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
  if (updates.socialLinks !== undefined && Array.isArray(updates.socialLinks)) {
    user.socialLinks = updates.socialLinks
      .map((link) => ({
        platform: String(link.platform || 'Website').trim().slice(0, 40),
        url: String(link.url || '').trim().slice(0, 500),
      }))
      .filter((link) => link.url)
      .slice(0, 12);
  }

  if (updates.preferences !== undefined && typeof updates.preferences === 'object') {
    user.preferences = { ...(user.preferences || {}), ...updates.preferences };
  }

  if (updates.password !== undefined) {
    user.password = updates.password;
  }

  await user.save({ validateBeforeSave: true });
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
  const [followingEdges, followerEdges] = await Promise.all([
    Follow.find({ follower: userId }).select('following').lean(),
    Follow.find({ following: userId }).select('follower').lean(),
  ]);
  const followingIds = followingEdges.map((edge) => edge.following);
  const followerIds = followerEdges.map((edge) => edge.follower);

  // 3. Delete everything cascaded
  await Promise.all([
    ...quizIds.map((quizId) => deleteQuizSocialData(quizId)),
    deleteUserSocialData(userId),
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    followingIds.length
      ? User.updateMany({ _id: { $in: followingIds } }, { $inc: { followersCount: -1 } })
      : Promise.resolve(),
    followerIds.length
      ? User.updateMany({ _id: { $in: followerIds } }, { $inc: { followingCount: -1 } })
      : Promise.resolve(),
    Quiz.deleteMany({ uploader: userId }),
    Question.deleteMany({ quizId: { $in: quizIds } }),
    Attempt.deleteMany({ userId: userId }),
    Upload.deleteMany({ userId: userId }),
    User.deleteOne({ _id: userId })
  ]);

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

export default {
  bootstrapSession,
  register,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  deleteAccount,
  checkUsername,
  searchUsers,
};
