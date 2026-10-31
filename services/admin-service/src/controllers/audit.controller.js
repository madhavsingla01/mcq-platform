import AdminAuditLog from '../models/AdminAuditLog.model.js';
import { catchAsync } from '../middleware/error.middleware.js';

/**
 * GET /api/v1/admin/audit-logs
 * Paginated immutable audit trail with action and target filters.
 */
export const listAuditLogs = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const skip = (page - 1) * limit;

  const action = String(req.query.action || 'all').toLowerCase();
  const targetType = String(req.query.targetType || 'all').toLowerCase();

  const filter = {};

  if (action !== 'all') {
    filter.action = action;
  }

  if (targetType !== 'all') {
    filter.targetType = targetType;
  }

  const [logs, total] = await Promise.all([
    AdminAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminAuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
});
