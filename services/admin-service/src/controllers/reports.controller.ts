import { pagination, requireAdminUser, routeId } from '../middleware/request.js';
import mongoose from 'mongoose';
import { z } from 'zod';
import { parseBody } from '../middleware/body.js';
import ModerationReport from '../models/ModerationReport.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import { getQuizDb, getAuthDb, type AccountRecord, type ContentRecord } from '../config/db.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';

const reportBody = z.object({
  targetType: z.string().optional(),
  targetId: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional(),
  targetTitle: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  details: z.string().optional(),
});
const resolutionBody = z.object({
  status: z.enum(['pending', 'in_review', 'action_taken', 'dismissed', 'appealed', 'closed']).optional(),
  action: z.enum(['none', 'restricted', 'suspended', 'dismissed', 'warned']).optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/v1/admin/reports
 * Submit a report on content or a user.
 */
export function normalizeReportInput(body: unknown) {
  const {
    targetType,
    targetId,
    targetTitle = '',
    category = 'other',
    reason,
    description = '',
    details = '',
  } = parseBody(reportBody, body);

  const finalDescription = String(description || details || '').trim();

  if (
    !targetType ||
    !targetId ||
    !String(targetId).trim() ||
    !reason ||
    !String(reason).trim()
  ) {
    throw new AppError('targetType, targetId, and reason are required fields.', 400);
  }

  const validTargetTypes = ['quiz', 'challenge', 'user', 'comment', 'question', 'feedback'];
  if (!validTargetTypes.includes(String(targetType).toLowerCase())) {
    throw new AppError('Invalid targetType.', 400);
  }

  const validCategories = [
    'spam',
    'harassment',
    'inappropriate',
    'impersonation',
    'cheating',
    'copyright',
    'misinformation',
    'other',
  ];
  const normalizedCategory = validCategories.includes(String(category).toLowerCase())
    ? String(category).toLowerCase()
    : 'other';

  return {
    targetType: targetType.toLowerCase(),
    targetId: String(targetId).trim(),
    targetTitle: targetTitle.trim(),
    category: normalizedCategory,
    reason: reason.trim(),
    description: finalDescription,
  };
}

export const submitReport = catchAsync(async (req, res) => {
  const input = normalizeReportInput(req.body);
  const reporterId = req.user?._id || req.adminUser?._id || new mongoose.Types.ObjectId();
  const reporterName = req.user?.username || req.adminUser?.username || 'User';
  const report = await ModerationReport.create({
    ...input,
    reporterId,
    reporterName,
    status: 'pending',
  });

  res.status(201).json({
    success: true,
    message: 'Report submitted successfully for administrative review.',
    reportId: String(report._id),
    data: { report },
  });
});

/**
 * GET /api/v1/admin/reports
 * Moderation queue with category and status filtering.
 */
export const listReports = catchAsync(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);

  const status = String(req.query.status || 'pending').toLowerCase();
  const targetType = String(req.query.targetType || 'all').toLowerCase();
  const category = String(req.query.category || 'all').toLowerCase();

  const filter: { status?: string; targetType?: string; category?: string } = {};

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
  const admin = requireAdminUser(req);
  const id = routeId(req);
  const {
    status = 'action_taken', // 'action_taken' or 'dismissed'
    action = 'none', // 'none', 'restricted', 'suspended', 'dismissed'
    notes = '',
  } = parseBody(resolutionBody, req.body);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid Report ID', 400);
  }

  const report = await ModerationReport.findById(id);
  if (!report) throw new AppError('Report not found', 404);

  const actsOnQuiz = action === 'restricted' && (report.targetType === 'quiz' || report.targetType === 'challenge');
  const actsOnUser = action === 'suspended' && report.targetType === 'user';
  if ((actsOnQuiz || actsOnUser) && !mongoose.Types.ObjectId.isValid(report.targetId)) {
    throw new AppError('Invalid moderation target identifier', 400);
  }

  const resolvedAt = new Date();
  report.status = status;
  report.resolutionAction = action;
  report.resolutionNotes = String(notes).trim();
  report.resolvedBy = admin._id;
  report.resolvedByName = admin.name || admin.username || 'Admin';
  report.resolvedAt = resolvedAt;

  await report.save();

  // If action is 'restricted' and target is quiz/challenge, restrict the quiz
  if (actsOnQuiz) {
    const quizDb = getQuizDb();
    if (quizDb) {
      await quizDb.collection<ContentRecord>('quizzes').updateOne(
        { _id: new mongoose.Types.ObjectId(report.targetId) },
        {
          $set: {
            isRestricted: true,
            restrictedReason: `Moderation report #${report._id}: ${report.reason}`,
            restrictedAt: resolvedAt,
            restrictedBy: admin._id,
          },
        }
      );
    }
  }

  // If action is 'suspended' and target is user, suspend the user
  if (actsOnUser) {
    const authDb = getAuthDb();
    if (authDb) {
      await authDb.collection<AccountRecord>('users').updateOne(
        { _id: new mongoose.Types.ObjectId(report.targetId) },
        {
          $set: {
            isSuspended: true,
            suspendedAt: resolvedAt,
            suspensionReason: `Moderation report #${report._id}: ${report.reason}`,
            suspendedBy: admin._id,
          },
        }
      );
    }
  }

  // Record in Audit Log
  await AdminAuditLog.create({
    actorId: admin._id,
    actorName: admin.name || admin.username || 'Admin',
    actorEmail: admin.email,
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
