/**
 * Auth controller — register, login, logout, refresh, me.
 */

import { verifySessionToken } from '../utils/sessionToken.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.model.js';
import Follow from '../models/Follow.model.js';
import env from '../config/env.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { setCsrfCookie } from '../middleware/csrf.middleware.js';
import { activeSessionFilter, clearAuthCookies, endSession, issueSession, rotateSession } from '../services/session.service.js';
import { validatePreferences, preferenceUpdates } from '../utils/preferences.js';

const isMediaAssetUrl = (value) => (
  typeof value === 'string' &&
  /^\/media\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/image$/i.test(value)
);

// A missing user takes the same bcrypt work as an incorrect password.
const DUMMY_PASSWORD_HASH = '$2a$12$cI2i4CP66nRSFHnA6/edMOy0UJWBy5k12wBusX9mlL.fkSHxt8k7K';

const auditSession = (req, event, outcome, userId) => {
  const requestId = req.get('x-request-id');
  console.info(JSON.stringify({
    category: 'identity-security', event, outcome, at: new Date().toISOString(),
    ...(userId ? { actorId: String(userId) } : {}),
    ...(/^[\w.-]{1,100}$/.test(requestId || '') ? { requestId } : {}),
  }));
};

const validateNewPassword = password => {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
    throw new AppError('Password must be at most 72 UTF-8 bytes', 400);
  }
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
  let claims;
  try { claims = verifySessionToken(req.cookies?.accessToken, env.JWT_SECRET); }
  catch { /* Try the refresh cookie if the access cookie has expired. */ }

  let user = claims
    ? await User.findOne(activeSessionFilter(claims.id, claims.tokenVersion ?? 0))
    : null;
  if (user) {
    setCsrfCookie(res, /^[a-f\d]{64}$/i.test(req.cookies?.csrfToken || '') ? req.cookies.csrfToken : undefined);
  } else {
    user = await rotateSession(req, res);
  }

  res.json({ success: true, data: { authenticated: Boolean(user), user } });
});

/**
 * POST /api/auth/register
 */
export const register = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password || typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return next(new AppError('Please provide valid name, email, and password strings', 400));
  }

  validateNewPassword(password);

  // Check if user exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }

  const username = await generateUniqueUsername(name);

  const user = await User.create({ name, email, password, username });

  await issueSession(user, req, res);

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
    !password || password.length > 1024 ||
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
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    auditSession(req, 'login', 'denied');
    return next(new AppError('Invalid email or password', 401));
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
    auditSession(req, 'login', 'denied');
    return next(new AppError('Invalid email or password', 401));
  }

  // Prevent deleted accounts from logging in
  if (user.isDeleted || user.isActive === false) {
    return next(new AppError('This account has been deleted or deactivated.', 403));
  }

  if (user.isSuspended) {
    return next(new AppError(`Account is suspended: ${user.suspensionReason || 'Please contact platform administration.'}`, 403));
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

  if (needsSave) await user.save({ validateBeforeSave: false });
  await issueSession(user, req, res);

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
  const userId = await endSession(req);
  clearAuthCookies(res);
  if (userId) auditSession(req, 'logout', 'revoked', userId);
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/auth/refresh
 */
export const refresh = catchAsync(async (req, res, next) => {
  const user = await rotateSession(req, res);
  if (!user) {
    // A stale response from another tab must not clear newly issued cookies.
    auditSession(req, 'refresh', 'denied');
    return next(new AppError('Invalid refresh token', 401));
  }
  res.json({ success: true, message: 'Token refreshed' });
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

  const preferencePatch = updates.preferences === undefined
    ? null : preferenceUpdates(validatePreferences(updates.preferences));

  // Preferences use atomic leaf updates: two tabs can change separate settings
  // without replacing the entire preferences document with an older snapshot.
  if (Object.keys(updates).every((key) => key === 'preferences')) {
    const user = Object.keys(preferencePatch).length
      ? await User.findByIdAndUpdate(req.user._id, { $set: preferencePatch }, { new: true, runValidators: true })
      : await User.findById(req.user._id);
    if (!user) return next(new AppError('User not found', 404));
    return res.json({ success: true, message: 'Preferences updated', data: { user } });
  }

  // Password change requires old password verification and confirmation
  if (updates.password !== undefined) {
    validateNewPassword(updates.password);
    const oldPass = req.body.currentPassword || req.body.oldPassword;
    if (!oldPass) {
      return next(new AppError('Please enter your current (old) password first', 400));
    }
    if (req.body.confirmPassword === undefined || req.body.confirmPassword !== updates.password) {
      return next(new AppError('Password confirmation does not match', 400));
    }
  }

  let user = await User.findById(req.user._id).select('+password');
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

  if (updates.password !== undefined) {
    const version = req.user.tokenVersion ?? 0;
    user.$where = activeSessionFilter(user._id, version);
    user.password = updates.password;
    user.tokenVersion = version + 1;
    user.refreshToken = null;
  }

  try {
    await user.save({ validateBeforeSave: true });
  } catch (error) {
    if (updates.password !== undefined && error.name === 'DocumentNotFoundError') {
      return next(new AppError('Session changed. Please sign in again.', 401));
    }
    throw error;
  }
  if (updates.password !== undefined) {
    auditSession(req, 'password_change', 'revoked', user._id);
    await issueSession(user, req, res);
  }
  if (preferencePatch && Object.keys(preferencePatch).length) {
    user = await User.findByIdAndUpdate(user._id, { $set: preferencePatch }, { new: true, runValidators: true });
  }
  // Ensure sensitive fields are not returned
  user.password = undefined;
  user.refreshToken = undefined;

  res.json({ success: true, message: 'Profile updated', data: { user } });
});

/** Revoke every older token while keeping the verified current browser signed in. */
export const revokeOtherSessions = catchAsync(async (req, res, next) => {
  const currentPassword = req.body?.currentPassword;
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return next(new AppError('Current password is required', 400));
  }
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.comparePassword(currentPassword))) {
    return next(new AppError('Incorrect current password', 400));
  }
  const version = req.user.tokenVersion ?? 0;
  const refreshed = await User.findOneAndUpdate(activeSessionFilter(user._id, version), {
    $set: { tokenVersion: version + 1, refreshToken: null },
  }, { new: true });
  if (!refreshed) return next(new AppError('Session changed. Please sign in again.', 401));
  auditSession(req, 'session_revocation', 'revoked', refreshed._id);
  await issueSession(refreshed, req, res);
  res.json({ success: true, message: 'Other sessions signed out', data: { user: refreshed } });
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
    password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
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
