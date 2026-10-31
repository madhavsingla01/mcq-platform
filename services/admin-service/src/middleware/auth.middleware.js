import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { getAuthDb } from '../config/db.js';
import { AppError, catchAsync } from './error.middleware.js';
import AdminMembership from '../models/AdminMembership.model.js';
import AdminRole from '../models/AdminRole.model.js';

export const protectAdmin = catchAsync(async (req, res, next) => {
  let token = req.cookies?.accessToken;
  if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Authentication required. Please log in as an administrator.', 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    return next(new AppError('Invalid or expired authentication session.', 401));
  }

  const authDb = getAuthDb();
  if (!authDb) {
    return next(new AppError('Authentication database connection unavailable.', 503));
  }

  const usersCollection = authDb.collection('users');
  const user = await usersCollection.findOne({
    _id: new mongoose.Types.ObjectId(decoded.id),
  });

  if (!user || user.isDeleted || user.isActive === false) {
    return next(new AppError('Account not found or has been deactivated.', 401));
  }

  if (user.isSuspended) {
    return next(new AppError(`Account is suspended: ${user.suspensionReason || 'Contact platform administration'}`, 403));
  }

  if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
    return next(new AppError('Session invalidated. Please log in again.', 401));
  }

  // Load Admin Membership
  let membership = await AdminMembership.findOne({ userId: user._id });

  // Auto-bootstrap super_admin if this user is configured as admin or has role: 'admin'
  const isSuperAdminCandidate =
    user.role === 'admin' ||
    (env.ADMIN_EMAIL && user.email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());

  if (!membership && isSuperAdminCandidate) {
    membership = await AdminMembership.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name || user.username || 'Admin',
      roleSlugs: ['super_admin'],
      notes: 'Initial auto-bootstrap super admin',
    });
  }

  // Determine permissions
  let permissions = new Set();
  if (isSuperAdminCandidate) {
    permissions.add('*'); // Universal admin
  }

  if (membership?.roleSlugs?.length) {
    const roles = await AdminRole.find({ slug: { $in: membership.roleSlugs } });
    for (const r of roles) {
      for (const p of r.permissions) {
        permissions.add(p);
      }
    }
  }

  if (!isSuperAdminCandidate && permissions.size === 0) {
    return next(new AppError('Access denied: You do not possess administrative permissions.', 403));
  }

  req.adminUser = {
    _id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    membership,
    permissions: Array.from(permissions),
  };

  next();
});

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.adminUser) {
      return next(new AppError('Unauthorized: Admin authentication required.', 401));
    }

    const { permissions } = req.adminUser;
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }

    return next(new AppError(`Access forbidden: Missing permission '${permission}'.`, 403));
  };
};
