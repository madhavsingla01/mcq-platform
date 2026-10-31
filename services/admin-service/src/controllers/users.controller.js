import mongoose from 'mongoose';
import { getAuthDb, getQuizDb } from '../config/db.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import AdminMembership from '../models/AdminMembership.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';

/**
 * GET /api/v1/admin/users
 * Paginated user listing with search and status filters.
 */
export const listUsers = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || 'all').toLowerCase();
  const role = String(req.query.role || 'all').toLowerCase();

  const authDb = getAuthDb();
  if (!authDb) throw new AppError('Auth database unavailable', 503);
  const usersCollection = authDb.collection('users');

  const filter = { isDeleted: { $ne: true } };

  if (status === 'suspended') {
    filter.isSuspended = true;
  } else if (status === 'active') {
    filter.isSuspended = { $ne: true };
  }

  if (role !== 'all') {
    filter.role = role;
  }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { name: regex },
      { username: regex },
      { email: regex },
      { userCode: regex },
    ];
  }

  const [users, total] = await Promise.all([
    usersCollection
      .find(filter, {
        projection: {
          name: 1,
          username: 1,
          email: 1,
          userCode: 1,
          role: 1,
          isSuspended: 1,
          suspendedAt: 1,
          suspensionReason: 1,
          quizCount: 1,
          createdAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    usersCollection.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

/**
 * GET /api/v1/admin/users/:id
 * Retrieve specific user details along with administrative notes and recent content.
 */
export const getUserDetails = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid User ID', 400);
  }

  const authDb = getAuthDb();
  const quizDb = getQuizDb();

  const user = await authDb.collection('users').findOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { projection: { password: 0, refreshToken: 0 } }
  );

  if (!user) throw new AppError('User not found', 404);

  const [membership, recentQuizzes, auditLogs] = await Promise.all([
    AdminMembership.findOne({ userId: user._id }).lean(),
    quizDb?.collection('quizzes')
      .find({ uploader: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ title: 1, quizCode: 1, visibility: 1, isChallenge: 1, isRestricted: 1, createdAt: 1 })
      .toArray(),
    AdminAuditLog.find({ targetType: 'user', targetId: String(user._id) })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      user,
      membership,
      recentQuizzes: recentQuizzes || [],
      auditLogs,
    },
  });
});

/**
 * POST /api/v1/admin/users/:id/suspend
 * Suspends an account with a mandatory operational reason.
 */
export const suspendUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    throw new AppError('A valid operational reason is required for suspension.', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid User ID', 400);
  }

  // Prevent self-suspension
  if (String(req.adminUser._id) === String(id)) {
    throw new AppError('Self-suspension is strictly prohibited.', 403);
  }

  const authDb = getAuthDb();
  const usersCollection = authDb.collection('users');

  const targetUser = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!targetUser) throw new AppError('User not found', 404);

  // Super-admin protection: ordinary admins cannot suspend other admins unless super_admin
  if (targetUser.role === 'admin' && !req.adminUser.permissions.includes('*')) {
    throw new AppError('Only Super Administrators can suspend admin accounts.', 403);
  }

  const suspendedAt = new Date();
  await usersCollection.updateOne(
    { _id: targetUser._id },
    {
      $set: {
        isSuspended: true,
        suspendedAt,
        suspensionReason: String(reason).trim(),
        suspendedBy: req.adminUser._id,
        tokenVersion: (targetUser.tokenVersion || 0) + 1, // Invalidate all active user JWT tokens immediately
      },
    }
  );

  // Append to Immutable Audit Log
  await AdminAuditLog.create({
    actorId: req.adminUser._id,
    actorName: req.adminUser.name || req.adminUser.username || 'Admin',
    actorEmail: req.adminUser.email,
    action: 'user_suspend',
    targetType: 'user',
    targetId: String(targetUser._id),
    targetTitle: targetUser.username || targetUser.email,
    reason: String(reason).trim(),
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    metadata: {
      userEmail: targetUser.email,
      suspendedAt,
    },
  });

  res.json({
    success: true,
    message: `User ${targetUser.username || targetUser.email} has been suspended.`,
    data: {
      userId: targetUser._id,
      isSuspended: true,
      suspendedAt,
    },
  });
});

/**
 * POST /api/v1/admin/users/:id/restore
 * Restores a suspended account.
 */
export const restoreUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason = 'Administrative clearance' } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid User ID', 400);
  }

  const authDb = getAuthDb();
  const usersCollection = authDb.collection('users');

  const targetUser = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!targetUser) throw new AppError('User not found', 404);

  await usersCollection.updateOne(
    { _id: targetUser._id },
    {
      $set: {
        isSuspended: false,
        suspendedAt: null,
        suspensionReason: null,
        suspendedBy: null,
      },
    }
  );

  // Append to Immutable Audit Log
  await AdminAuditLog.create({
    actorId: req.adminUser._id,
    actorName: req.adminUser.name || req.adminUser.username || 'Admin',
    actorEmail: req.adminUser.email,
    action: 'user_restore',
    targetType: 'user',
    targetId: String(targetUser._id),
    targetTitle: targetUser.username || targetUser.email,
    reason: String(reason).trim(),
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    metadata: {
      userEmail: targetUser.email,
      restoredAt: new Date(),
    },
  });

  res.json({
    success: true,
    message: `User ${targetUser.username || targetUser.email} has been restored.`,
    data: {
      userId: targetUser._id,
      isSuspended: false,
    },
  });
});

/**
 * POST /api/v1/admin/users/:id/role
 * Changes the role of a user (e.g. user <-> admin).
 */
export const updateUserRole = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { role, reason = 'Administrative role reassignment' } = req.body;

  if (!['user', 'admin'].includes(role)) {
    throw new AppError('Invalid role specified. Supported: user, admin', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid User ID', 400);
  }

  const authDb = getAuthDb();
  const usersCollection = authDb.collection('users');

  const targetUser = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!targetUser) throw new AppError('User not found', 404);

  const prevRole = targetUser.role;
  await usersCollection.updateOne(
    { _id: targetUser._id },
    { $set: { role } }
  );

  await AdminAuditLog.create({
    actorId: req.adminUser._id,
    actorName: req.adminUser.name || req.adminUser.username || 'Admin',
    actorEmail: req.adminUser.email,
    action: 'user_role_change',
    targetType: 'user',
    targetId: String(targetUser._id),
    targetTitle: targetUser.username || targetUser.email,
    reason: String(reason).trim(),
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    metadata: {
      fromRole: prevRole,
      toRole: role,
    },
  });

  res.json({
    success: true,
    message: `User role updated to ${role}.`,
    data: {
      userId: targetUser._id,
      role,
    },
  });
});
