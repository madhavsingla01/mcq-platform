import { Router } from 'express';
import { protectAdmin, requirePermission } from '../middleware/auth.middleware.js';
import { getDashboardOverview } from '../controllers/dashboard.controller.js';
import {
  listUsers,
  getUserDetails,
  suspendUser,
  restoreUser,
  updateUserRole,
} from '../controllers/users.controller.js';
import {
  listContent,
  getContentDetails,
  restrictContent,
  restoreContent,
} from '../controllers/content.controller.js';
import {
  submitReport,
  listReports,
  resolveReport,
} from '../controllers/reports.controller.js';
import { listAuditLogs } from '../controllers/audit.controller.js';
import { getSystemHealth } from '../controllers/system.controller.js';

const router = Router();

// Public Health Check for microservice supervision & Gateway
router.get('/health', (req, res) => {
  res.json({
    service: 'admin-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Report submission (can be called by authenticated users or admins)
router.post('/reports/submit', submitReport);

// All routes below require Admin authentication
router.use(protectAdmin);

// Dashboard Overview
router.get('/overview', getDashboardOverview);

// User Management
router.get('/users', requirePermission('manage_users'), listUsers);
router.get('/users/:id', requirePermission('manage_users'), getUserDetails);
router.post('/users/:id/suspend', requirePermission('suspend_users'), suspendUser);
router.post('/users/:id/restore', requirePermission('suspend_users'), restoreUser);
router.post('/users/:id/role', requirePermission('manage_roles'), updateUserRole);

// Quiz & Challenge Moderation
router.get('/content', requirePermission('manage_content'), listContent);
router.get('/content/:id', requirePermission('manage_content'), getContentDetails);
router.post('/content/:id/restrict', requirePermission('restrict_content'), restrictContent);
router.post('/content/:id/restore', requirePermission('restrict_content'), restoreContent);

// Reports Queue
router.get('/reports', requirePermission('manage_reports'), listReports);
router.post('/reports/:id/resolve', requirePermission('manage_reports'), resolveReport);

// Audit Logs
router.get('/audit-logs', requirePermission('view_audit_logs'), listAuditLogs);

// System Health & Diagnostics
router.get('/system', requirePermission('system_health'), getSystemHealth);

export default router;
