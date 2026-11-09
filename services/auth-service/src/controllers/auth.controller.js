/**
 * Auth controller — register, login, logout, refresh, me.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.model.js';
import Follow from '../models/Follow.model.js';
import env from '../config/env.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { clearCsrfCookie, setCsrfCookie } from '../middleware/csrf.middleware.js';

const authCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/',
};

const isMediaAssetUrl = (value) => (
  typeof value === 'string' &&
  /^\/media\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/image$/i.test(value)
);

const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', authCookieOptions);
  res.clearCookie('refreshToken', authCookieOptions);
  clearCsrfCookie(res);
};

/**
 * Generate access + refresh tokens and set as httpOnly cookies.
 */
const generateTokens = (user, res) => {
  const tokenVersion = user.tokenVersion || 0;
  const accessToken = jwt.sign({ id: user._id, tokenVersion }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const refreshToken = jwt.sign({ id: user._id, tokenVersion }, env.JWT_REFRESH_SECRET, {
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
  if (!baseName || baseName.length < 3) baseName = `user${crypto.randomInt(1000)}`;
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
      username = `${baseName}_${crypto.randomInt(10000)}`;
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

      if (user && !user.isDeleted && user.isActive !== false && !user.isSuspended &&
          (decoded.tokenVersion === undefined || user.tokenVersion === undefined || decoded.tokenVersion === user.tokenVersion)) {
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

      if (user && !user.isDeleted && user.isActive !== false && !user.isSuspended &&
          (decoded.tokenVersion === undefined || decoded.tokenVersion === user.tokenVersion) &&
          user.refreshToken === token) {
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
  const { name, email, password } = req.body || {};

  if (!name || !email || !password || typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return next(new AppError('Please provide valid name, email, and password strings', 400));
  }

  // Check if user exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
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
  const { email, identifier, password } = req.body || {};
  const idValue = email !== undefined ? email : identifier;

  if (
    !idValue ||
    !password ||
    typeof idValue !== 'string' ||
    typeof password !== 'string'
  ) {
    return next(new AppError('Please provide valid email and password strings', 400));
  }

  const queryIdentifier = idValue.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(queryIdentifier);
  const user = await User.findOne(
    isEmail
      ? { email: queryIdentifier.toLowerCase() }
      : { username: queryIdentifier.toLowerCase() }
  ).select('+password');
  if (!user) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Prevent deleted accounts from logging in
  if (user.isDeleted || user.isActive === false) {
    return next(new AppError('This account has been deleted or deactivated.', 403));
  }

  if (user.isSuspended) {
    return next(new AppError(`Account is suspended: ${user.suspensionReason || 'Please contact platform administration.'}`, 403));
  }

  // Account lockout protection against brute force
  if (user.isLocked && user.isLocked()) {
    const remainingMinutes = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / (60 * 1000));
    return next(
      new AppError(
        `Account temporarily locked due to repeated failed logins. Please try again in ${remainingMinutes} minute(s).`,
        429
      )
    );
  }

  if (!(await user.comparePassword(password))) {
    if (user.incrementLoginAttempts) {
      await user.incrementLoginAttempts();
    }
    return next(new AppError('Invalid email or password', 401));
  }

  // Reset login attempts counter upon successful login
  if (user.resetLoginAttempts) {
    await user.resetLoginAttempts();
  }

  // Backfill username and userCode for existing users
  let needsSave = false;
  if (!user.username) {
    user.username = await generateUniqueUsername(user.name);
    needsSave = true;
  }
  if (!user.userCode) {
    user.userCode = 'USR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    needsSave = true;
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
  // Invalidate all active tokens for this user by incrementing tokenVersion
  if (req.user?._id) {
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { tokenVersion: 1 },
      $set: { refreshToken: null },
    });
  } else if (req.cookies?.refreshToken) {
    try {
      const decoded = jwt.verify(req.cookies.refreshToken, env.JWT_REFRESH_SECRET);
      await User.findByIdAndUpdate(decoded.id, {
        $inc: { tokenVersion: 1 },
        $set: { refreshToken: null },
      });
    } catch {
      // Ignored if expired
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

  if (!user || user.isDeleted || user.isActive === false || user.isSuspended || user.refreshToken !== token) {
    clearAuthCookies(res);
    return next(new AppError('Invalid refresh token', 401));
  }

  // Session invalidation verification
  if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
    clearAuthCookies(res);
    return next(new AppError('Session has been revoked or invalidated. Please log in again.', 401));
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
    'name', 'email', 'avatar', 'banner', 'preferences',
    'phone', 'dateOfBirth', 'gender', 'address', 'bio', 'age', 'password', 'username',
    'isProfilePublic', 'isPrivate', 'socialLinks'
  ];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update', 400));
  }

  // Password change requires old password verification and confirmation
  if (updates.password !== undefined) {
    const oldPass = req.body.currentPassword || req.body.oldPassword;
    if (!oldPass) {
      return next(new AppError('Please enter your current (old) password first', 400));
    }
    if (req.body.confirmPassword === undefined || req.body.confirmPassword !== updates.password) {
      return next(new AppError('Password confirmation does not match', 400));
    }
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) return next(new AppError('User not found', 404));

  if (updates.password !== undefined) {
    const oldPass = req.body.currentPassword || req.body.oldPassword;
    const isOldMatch = await user.comparePassword(oldPass);
    if (!isOldMatch) {
      return next(new AppError('Incorrect current (old) password', 400));
    }
  }

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
  if (updates.banner !== undefined) user.banner = updates.banner;
  if (updates.phone !== undefined) user.phone = updates.phone;
  if (updates.dateOfBirth !== undefined) {
    const d = new Date(updates.dateOfBirth);
    if (!Number.isNaN(d.getTime())) user.dateOfBirth = d;
  }
  if (updates.gender !== undefined) user.gender = updates.gender;
  if (updates.age !== undefined) user.age = Number(updates.age) || undefined;
  if (updates.address !== undefined && typeof updates.address === 'object') user.address = updates.address;
  if (updates.bio !== undefined) user.bio = updates.bio;
  if (updates.isPrivate !== undefined) {
    user.isPrivate = Boolean(updates.isPrivate);
    user.isProfilePublic = !updates.isPrivate;
  }
  if (updates.isProfilePublic !== undefined) {
    user.isProfilePublic = Boolean(updates.isProfilePublic);
    user.isPrivate = !updates.isProfilePublic;
  }
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
    const existingPrefs = (user.preferences && typeof user.preferences.toObject === 'function')
      ? user.preferences.toObject()
      : (user.preferences || {});
    user.preferences = { ...existingPrefs, ...updates.preferences };
    user.markModified('preferences');
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

  const [followingEdges, followerEdges] = await Promise.all([
    Follow.find({ follower: userId }).select('following').lean(),
    Follow.find({ following: userId }).select('follower').lean(),
  ]);
  const followingIds = followingEdges.map((edge) => edge.following);
  const followerIds = followerEdges.map((edge) => edge.follower);

  // 1. Unfollow connections so network counts stay accurate
  await Promise.all([
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    followingIds.length
      ? User.updateMany({ _id: { $in: followingIds } }, { $inc: { followersCount: -1 } })
      : Promise.resolve(),
    followerIds.length
      ? User.updateMany({ _id: { $in: followerIds } }, { $inc: { followingCount: -1 } })
      : Promise.resolve(),
  ]);

  // 2. Mark user as deleted:
  // Quizzes, questions, and comments are NOT deleted.
  // Instead, the account is marked as deleted so the community content remains preserved.
  const user = await User.findById(userId);
  const userCode = user?.userCode || ('USR-' + crypto.randomBytes(4).toString('hex').toUpperCase());

  await User.findByIdAndUpdate(userId, {
    isDeleted: true,
    deletedAt: new Date(),
    isActive: false,
    name: 'Deleted User',
    username: `deleted_${userCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    email: `deleted_${userId}@deleted.quizfocus.com`,
    avatar: '',
    bio: '',
    refreshToken: null,
    password: crypto.randomBytes(32).toString('hex'), // Invalidate password login completely
    followersCount: 0,
    followingCount: 0,
    userCode,
  });

  clearAuthCookies(res);

  res.json({
    success: true,
    message: 'Account deleted successfully. Quizzes and comments are preserved and marked as Deleted User.',
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
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const skip = (page - 1) * limit;
    const sort = req.query.sort || 'followers';

    const query = {
      isProfilePublic: { $ne: false },
      isPrivate: { $ne: true },
      'preferences.searchDiscovery': { $ne: false },
    };

    if (q) {
      const sanitized = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(sanitized, 'i');
      query.$and = [
        {
          $or: [
            { username: regex },
            { name: regex },
            { bio: regex },
          ],
        },
      ];
    }

    let sortCriteria = { followersCount: -1, quizCount: -1, createdAt: -1 };
    if (sort === 'quizzes') {
      sortCriteria = { quizCount: -1, followersCount: -1, createdAt: -1 };
    } else if (sort === 'recent') {
      sortCriteria = { createdAt: -1, followersCount: -1 };
    } else if (q) {
      sortCriteria = { followersCount: -1, quizCount: -1 };
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('username name avatar bio followersCount followingCount quizCount isPrivate isProfilePublic createdAt')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const pages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      success: true,
      data: {
        creators: users,
        users,
        pagination: {
          total,
          page,
          limit,
          pages,
          hasMore: page < pages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadUserBanner = catchAsync(async (req, res) => {
  const bannerUrl = String(req.body.imageUrl || '').trim();
  if (!isMediaAssetUrl(bannerUrl)) throw new AppError('Upload a validated image before setting a profile banner', 400);

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404);

  user.banner = bannerUrl;
  await user.save();

  res.json({
    success: true,
    data: {
      banner: user.banner,
      user,
    },
  });
});

export const uploadUserAvatar = catchAsync(async (req, res) => {
  const avatarUrl = String(req.body.imageUrl || '').trim();
  if (!isMediaAssetUrl(avatarUrl)) throw new AppError('Upload a validated image before setting a profile avatar', 400);

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404);

  user.avatar = avatarUrl;
  await user.save();

  res.json({
    success: true,
    data: {
      avatar: avatarUrl,
    },
  });
});

export const removeUserBanner = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404);

  user.banner = '';
  await user.save();

  res.json({
    success: true,
    data: {
      banner: '',
      user,
    },
  });
});

export default {
  bootstrapSession,
  register,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  uploadUserAvatar,
  uploadUserBanner,
  removeUserBanner,
  deleteAccount,
  checkUsername,
  searchUsers,
};
