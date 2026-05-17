/**
 * Auth controller — register, login, logout, refresh, me.
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
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
 * POST /api/auth/register
 */
export const register = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }

  const user = await User.create({ name, email, password });

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
    'phone', 'dateOfBirth', 'gender', 'address', 'bio', 'age', 'password'
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

export default { register, login, logout, refresh, getMe, updateMe };
