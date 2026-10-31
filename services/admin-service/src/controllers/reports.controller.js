import mongoose from 'mongoose';
import ModerationReport from '../models/ModerationReport.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import { getQuizDb, getAuthDb } from '../config/db.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';

/**
 * POST /api/v1/admin/reports
 * Submit a report on content or a user.
 */
export const submitReport = catchAsync(async (req, res) => {
  const {
    targetType,
    targetId,
    targetTitle = '',
    category = 'other',
    reason,
    description = '',
  } = req.body;

  if (!targetType || !targetId || !reason) {
    throw new AppError('targetType, targetId, and reason are required fields.', 400);
  }

  const reporterId = req.user?._id || req.adminUser?._id || new mongoose.Types.ObjectId();
  const reporterName = req.user?.username || req.adminUser?.username || 'User';

  const report = await ModerationReport.create({
    reporterId,
    reporterName,
    targetType,
    targetId,
    targetTitle,
    category,
    reason: String(reason).trim(),
    description: String(description).trim(),
    status: 'pending',
  });

  res.status(201).json({
    success: true,
    message: 'Report submitted successfully for administrative review.',
    data: { report },
  });
});

/**
 * GET /api/v1/admin/reports
 * Moderation queue with category and status filtering.
 */
export const listReports = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const status = String(req.query.status || 'pending').toLowerCase();
  const targetType = String(req.query.targetType || 'all').toLowerCase();
  const category = String(req.query.category || 'all').toLowerCase();

  const filter = {};

  if (status !== 'all') {
    filter.status = status;
  }

  if (targetType !== 'all') {
    filter.targetType = targetType;
  }

  if (category !== 'all') {
    filter.category = category;
  }

  const [reports, total] = await Promise.all([
    ModerationReport.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ModerationReport.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      reports,
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
 * POST /api/v1/admin/reports/:id/resolve
 * Resolve or dismiss a report with automated action trigger.
 */
export const resolveReport = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    status = 'action_taken', // 'action_taken' or 'dismissed'
    action = 'none', // 'none', 'restricted', 'suspended', 'dismissed'
    notes = '',
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid Report ID', 400);
  }

  const report = await ModerationReport.findById(id);
  if (!report) throw new AppError('Report not found', 404);

  const resolvedAt = new Date();
  report.status = status;
  report.resolutionAction = action;
  report.resolutionNotes = String(notes).trim();
  report.resolvedBy = req.adminUser._id;
  report.resolvedByName = req.adminUser.name || req.adminUser.username || 'Admin';
  report.resolvedAt = resolvedAt;

  await report.save();

  // If action is 'restricted' and target is quiz/challenge, restrict the quiz
  if (action === 'restricted' && (report.targetType === 'quiz' || report.targetType === 'challenge')) {
    const quizDb = getQuizDb();
    if (quizDb) {
      await quizDb.collection('quizzes').updateOne(
        { _id: new mongoose.Types.ObjectId(report.targetId) },
        {
          $set: {
            isRestricted: true,
            restrictedReason: `Moderation report #${report._id}: ${report.reason}`,
            restrictedAt: resolvedAt,
            restrictedBy: req.adminUser._id,
          },
        }
      );
    }
  }

  // If action is 'suspended' and target is user, suspend the user
  if (action === 'suspended' && report.targetType === 'user') {
    const authDb = getAuthDb();
    if (authDb) {
      await authDb.collection('users').updateOne(
        { _id: new mongoose.Types.ObjectId(report.targetId) },
        {
          $set: {
            isSuspended: true,
            suspendedAt: resolvedAt,
            suspensionReason: `Moderation report #${report._id}: ${report.reason}`,
            suspendedBy: req.adminUser._id,
          },
        }
      );
    }
  }

  // Record in Audit Log
  await AdminAuditLog.create({
    actorId: req.adminUser._id,
    actorName: req.adminUser.name || req.adminUser.username || 'Admin',
    actorEmail: req.adminUser.email,
    action: `report_${status}`,
    targetType: report.targetType,
    targetId: report.targetId,
    targetTitle: report.targetTitle || `Report #${report._id}`,
    reason: notes || `Resolved as ${status} with action ${action}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    metadata: {
      reportId: report._id,
      actionTaken: action,
      category: report.category,
    },
  });

  res.json({
    success: true,
    message: `Report #${report._id} resolved with status '${status}'.`,
    data: { report },
  });
});
