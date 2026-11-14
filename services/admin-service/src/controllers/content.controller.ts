import { pagination, requireAdminUser, routeId } from '../middleware/request.js';
import mongoose from 'mongoose';
import { parseBody, reasonBody } from '../middleware/body.js';
import { getQuizDb, getAuthDb, type AccountRecord, type ContentRecord } from '../config/db.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import ModerationReport from '../models/ModerationReport.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { hasAdminPermission } from '../middleware/auth.middleware.js';
import { buildClosestSearch } from '../services/closestSearch.js';

/**
 * GET /api/v1/admin/content
 * Paginated quizzes & challenges with moderation filters.
 */
export const listContent = catchAsync(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);

  const search = String(req.query.search || '').trim();
  const closest = search && req.query.match === 'closest' ? buildClosestSearch(search, {
    primary: 'title', arrays: ['tags'], literalFields: ['quizCode'], literalOnly: /^!?qz-/i.test(search),
  }) : null;
  const type = String(req.query.type || 'all').toLowerCase();
  const visibility = String(req.query.visibility || 'all').toLowerCase();
  const restricted = String(req.query.restricted || 'all').toLowerCase();

  const quizDb = getQuizDb();
  if (!quizDb) throw new AppError('Quiz database unavailable', 503);
  const quizzesCollection = quizDb.collection<ContentRecord>('quizzes');

  const filter: { isChallenge?: boolean | { $ne: boolean }; visibility?: string; isRestricted?: boolean | { $ne: boolean }; $or?: Array<Record<string, unknown>> } = {};

  if (type === 'challenge') {
    filter.isChallenge = true;
  } else if (type === 'quiz') {
    filter.isChallenge = { $ne: true };
  }

  if (visibility !== 'all') {
    filter.visibility = visibility;
  }

  if (restricted === 'true') {
    filter.isRestricted = true;
  } else if (restricted === 'false') {
    filter.isRestricted = { $ne: true };
  }

  if (closest) {
    filter.$or = closest.filter.$or;
  } else if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { title: regex },
      { quizCode: regex },
      { tags: regex },
    ];
  }

  const projection = {
    title: 1, quizCode: 1, visibility: 1, isChallenge: 1, challengeStatus: 1, deadlineAt: 1,
    totalQuestions: 1, totalAttempts: 1, isRestricted: 1, restrictedReason: 1, restrictedAt: 1, uploader: 1, createdAt: 1,
  };
  const order = { createdAt: -1, _id: -1 } as const;
  const pageQuery = closest ? quizzesCollection.aggregate<ContentRecord>([
    { $match: filter }, { $set: { searchScore: closest.score } },
    { $sort: { searchScore: -1, ...order } }, { $skip: skip }, { $limit: limit }, { $project: projection },
  ], { maxTimeMS: 5000 }) : quizzesCollection.find(filter, { projection }).sort(order).skip(skip).limit(limit);
  const [items, total] = await Promise.all([
    pageQuery.toArray(), quizzesCollection.countDocuments(filter, closest ? { maxTimeMS: 5000 } : {}),
  ]);

  // Optionally attach uploader usernames
  const authDb = getAuthDb();
  if (authDb && items.length > 0) {
    const uploaderIds = Array.from(new Set(items.map((item) => item.uploader)
      .filter((id: unknown): id is mongoose.Types.ObjectId => id instanceof mongoose.Types.ObjectId)));
    const users = await authDb
      .collection<AccountRecord>('users')
      .find({ _id: { $in: uploaderIds } })
      .project<AccountRecord>({ name: 1, username: 1, email: 1 })
      .toArray();

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    items.forEach((item) => {
      item.uploaderDetails = userMap.get(String(item.uploader)) || null;
    });
  }

  res.json({
    success: true,
    data: {
      content: items,
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
 * GET /api/v1/admin/content/:id
 * Content details with reports and question counts.
 */
export const getContentDetails = catchAsync(async (req, res) => {
  const id = routeId(req);
  const quizDb = getQuizDb();
  if (!quizDb) throw new AppError('Quiz database unavailable', 503);

  const filter = mongoose.Types.ObjectId.isValid(id)
    ? { _id: new mongoose.Types.ObjectId(id) }
    : { quizCode: id.toUpperCase() };

  const quiz = await quizDb.collection<ContentRecord>('quizzes').findOne(filter);
  if (!quiz) throw new AppError('Quiz/Challenge not found', 404);

  const [reports, auditLogs] = await Promise.all([
    hasAdminPermission(req.adminUser, 'manage_reports')
      ? ModerationReport.find({ targetId: String(quiz._id) }).sort({ createdAt: -1 }).lean() : [],
    hasAdminPermission(req.adminUser, 'view_audit_logs')
      ? AdminAuditLog.find({ targetId: String(quiz._id) }).sort({ createdAt: -1 }).lean() : [],
  ]);

  res.json({
    success: true,
    data: {
      quiz,
      reports,
      auditLogs,
    },
  });
});

/**
 * POST /api/v1/admin/content/:id/restrict
 * Restricts content from public discovery (search, explore, challenges) with an operational reason.
 */
export const restrictContent = catchAsync(async (req, res) => {
  const admin = requireAdminUser(req);
  const id = routeId(req);
  const { reason } = parseBody(reasonBody, req.body);

  if (!reason || !String(reason).trim()) {
    throw new AppError('A valid operational reason is required to restrict content.', 400);
  }

  const quizDb = getQuizDb();
  if (!quizDb) throw new AppError('Quiz database unavailable', 503);
  const quizzesCollection = quizDb.collection<ContentRecord>('quizzes');

  const filter = mongoose.Types.ObjectId.isValid(id)
    ? { _id: new mongoose.Types.ObjectId(id) }
    : { quizCode: id.toUpperCase() };

  const quiz = await quizzesCollection.findOne(filter);
  if (!quiz) throw new AppError('Quiz not found', 404);

  const restrictedAt = new Date();
  await quizzesCollection.updateOne(
    { _id: quiz._id },
    {
      $set: {
        isRestricted: true,
        restrictedReason: String(reason).trim(),
        restrictedAt,
        restrictedBy: admin._id,
      },
    }
  );

  await AdminAuditLog.create({
    actorId: admin._id,
    actorName: admin.name || admin.username || 'Admin',
    actorEmail: admin.email,
    action: 'content_restrict',
    targetType: quiz.isChallenge ? 'challenge' : 'quiz',
    targetId: String(quiz._id),
    targetTitle: quiz.title,
    reason: String(reason).trim(),
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    metadata: {
      quizCode: quiz.quizCode,
      visibility: quiz.visibility,
    },
  });

  res.json({
    success: true,
    message: `Content "${quiz.title}" has been restricted from public discovery.`,
    data: {
      quizId: quiz._id,
      isRestricted: true,
      restrictedAt,
    },
  });
});

/**
 * POST /api/v1/admin/content/:id/restore
 * Restores content visibility after review.
 */
export const restoreContent = catchAsync(async (req, res) => {
  const admin = requireAdminUser(req);
  const id = routeId(req);
  const { reason = 'Reviewed and cleared by administration' } = parseBody(reasonBody, req.body);

  const quizDb = getQuizDb();
  if (!quizDb) throw new AppError('Quiz database unavailable', 503);
  const quizzesCollection = quizDb.collection<ContentRecord>('quizzes');

  const filter = mongoose.Types.ObjectId.isValid(id)
    ? { _id: new mongoose.Types.ObjectId(id) }
    : { quizCode: id.toUpperCase() };

  const quiz = await quizzesCollection.findOne(filter);
  if (!quiz) throw new AppError('Quiz not found', 404);

  await quizzesCollection.updateOne(
    { _id: quiz._id },
    {
      $set: {
        isRestricted: false,
        restrictedReason: null,
        restrictedAt: null,
        restrictedBy: null,
      },
    }
  );

  await AdminAuditLog.create({
    actorId: admin._id,
    actorName: admin.name || admin.username || 'Admin',
    actorEmail: admin.email,
    action: 'content_restore',
    targetType: quiz.isChallenge ? 'challenge' : 'quiz',
    targetId: String(quiz._id),
    targetTitle: quiz.title,
    reason: String(reason).trim(),
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    metadata: {
      quizCode: quiz.quizCode,
    },
  });

  res.json({
    success: true,
    message: `Content "${quiz.title}" visibility has been restored.`,
    data: {
      quizId: quiz._id,
      isRestricted: false,
    },
  });
});
