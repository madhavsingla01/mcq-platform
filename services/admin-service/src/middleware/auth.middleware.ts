import { verifySessionToken, isCurrentSession } from '../utils/sessionToken.js';
import mongoose from 'mongoose';
import { z } from 'zod';
import type { Request, RequestHandler } from 'express';
import { requestCookie } from './request.js';
import env from '../config/env.js';
import { getAuthDb } from '../config/db.js';
import { AppError, catchAsync } from './error.middleware.js';
import AdminMembership from '../models/AdminMembership.model.js';
import AdminRole from '../models/AdminRole.model.js';

const authAccount = z.object({
  _id: z.instanceof(mongoose.Types.ObjectId),
  name: z.string().nullish(),
  username: z.string().nullish(),
  email: z.string().nullish(),
  role: z.string().nullish(),
  isDeleted: z.boolean().nullish(),
  isActive: z.boolean().nullish(),
  isSuspended: z.boolean().nullish(),
  suspensionReason: z.string().nullish(),
  tokenVersion: z.number().nullish(),
  sessions: z.array(z.object({
    sessionId: z.string(), expiresAt: z.union([z.date(), z.string(), z.number()]),
  })).nullish().transform(sessions => sessions ?? []),
});

const accountProjection = {
  name: 1, username: 1, email: 1, role: 1, isDeleted: 1, isActive: 1,
  isSuspended: 1, suspensionReason: 1, tokenVersion: 1,
  'sessions.sessionId': 1, 'sessions.expiresAt': 1,
};

function readToken(req: Request) {
  const cookie = requestCookie(req, 'accessToken');
  return cookie || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : undefined);
}

export const protectAdmin = catchAsync(async (req, res, next) => {
  const token = readToken(req);

  if (!token) {
    return next(new AppError('Authentication required. Please log in as an administrator.', 401));
  }

  let decoded;
  try {
    decoded = verifySessionToken(token, env.JWT_SECRET);
  } catch (err) {
    return next(new AppError('Invalid or expired authentication session.', 401));
  }

  const authDb = getAuthDb();
  if (!authDb) {
    return next(new AppError('Authentication database connection unavailable.', 503));
  }

  const usersCollection = authDb.collection('users');
  const user = authAccount.safeParse(await usersCollection.findOne({
    _id: new mongoose.Types.ObjectId(decoded.id),
  }, { projection: accountProjection })).data;

  if (!user || user.isDeleted || user.isActive === false) {
    return next(new AppError('Account not found or has been deactivated.', 401));
  }

  if (user.isSuspended) {
    return next(new AppError(`Account is suspended: ${user.suspensionReason || 'Contact platform administration'}`, 403));
  }

  if (!isCurrentSession(user, decoded)) {
    return next(new AppError('Session invalidated. Please log in again.', 401));
  }

  const membership = await AdminMembership.findOne({ userId: user._id }).lean();
  const permissions = new Set<string>();
  if (user.role === 'admin') {
    permissions.add('*');
  } else if (membership?.roleSlugs?.length) {
    // Older provisioning copied the global role into a membership.
    const inheritedRole = ['Initial auto-bootstrap super admin', 'Promoted via make-admin script'].includes(membership.notes ?? '');
    const roleSlugs = inheritedRole
      ? membership.roleSlugs.filter(slug => slug !== 'super_admin')
      : membership.roleSlugs;
    const roles = await AdminRole.find({ slug: { $in: roleSlugs } });
    for (const r of roles) {
      for (const p of r.permissions) {
        if (p !== '*') permissions.add(p);
      }
    }
  }

  if (permissions.size === 0) {
    return next(new AppError('Access denied: You do not possess administrative permissions.', 403));
  }

  req.adminUser = {
    _id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: Array.from(permissions),
  };

  next();
});

export const hasAdminPermission = (adminUser: { permissions: readonly string[] } | null | undefined, permission: string) =>
  Boolean(adminUser?.permissions.includes('*') || adminUser?.permissions.includes(permission));

export const requirePermission = (permission: string): RequestHandler => {
  return (req, res, next) => {
    if (!req.adminUser) {
      return next(new AppError('Unauthorized: Admin authentication required.', 401));
    }

    if (hasAdminPermission(req.adminUser, permission)) {
      return next();
    }

    return next(new AppError(`Access forbidden: Missing permission '${permission}'.`, 403));
  };
};

export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = readToken(req);

    if (!token) return next();

    let decoded;
    try {
      decoded = verifySessionToken(token, env.JWT_SECRET);
    } catch {
      return next();
    }

    if (!decoded || !decoded.id) return next();

    const authDb = getAuthDb();
    if (!authDb) return next();

    const user = authAccount.safeParse(await authDb.collection('users').findOne({
      _id: new mongoose.Types.ObjectId(decoded.id),
    }, { projection: accountProjection })).data;

    if (
      user &&
      !user.isDeleted &&
      user.isActive !== false &&
      !user.isSuspended &&
      isCurrentSession(user, decoded)
    ) {
      req.user = {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      };
    }

    return next();
  } catch {
    return next();
  }
};
