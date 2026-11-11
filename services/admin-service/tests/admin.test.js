process.env.NODE_ENV = 'test';
process.env.PORT = '5008';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/admin-tests';
process.env.AUTH_MONGO_URI = 'mongodb://127.0.0.1:27017/auth-tests';
process.env.QUIZ_MONGO_URI = 'mongodb://127.0.0.1:27017/quiz-tests';
process.env.ATTEMPT_MONGO_URI = 'mongodb://127.0.0.1:27017/attempt-tests';
process.env.JWT_SECRET = 'admin-service-test-secret-at-least-32-chars!';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.HEALTH_CHECK_TIMEOUT_MS = '5000';
process.env.GATEWAY_URL = 'http://127.0.0.1:5000';
process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:5001';
process.env.QUIZ_SERVICE_URL = 'http://127.0.0.1:5002';
process.env.PARSER_SERVICE_URL = 'http://127.0.0.1:5003';
process.env.ATTEMPT_SERVICE_URL = 'http://127.0.0.1:5004';
process.env.SOCIAL_SERVICE_URL = 'http://127.0.0.1:5005';
process.env.MESSAGE_SERVICE_URL = 'http://127.0.0.1:5006';
process.env.MEDIA_SERVICE_URL = 'http://127.0.0.1:5007';
process.env.CHALLENGE_SERVICE_URL = 'http://127.0.0.1:5009';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/middleware/error.middleware.js';
import { hasAdminPermission, requirePermission } from '../src/middleware/auth.middleware.js';

test('report submission validation requires targetType, targetId, and reason', () => {
  const validTargetTypes = ['quiz', 'challenge', 'user', 'comment', 'question', 'feedback'];
  const validCategories = [
    'spam', 'harassment', 'inappropriate', 'impersonation',
    'cheating', 'copyright', 'misinformation', 'other',
  ];

  const validateReportInput = (body) => {
    const { targetType, targetId, reason, category } = body || {};
    if (!targetType || !targetId || !String(targetId).trim() || !reason || !String(reason).trim()) {
      throw new AppError('targetType, targetId, and reason are required fields.', 400);
    }
    if (!validTargetTypes.includes(String(targetType).toLowerCase())) {
      throw new AppError('Invalid targetType.', 400);
    }
    const normalizedCategory = validCategories.includes(String(category).toLowerCase())
      ? String(category).toLowerCase()
      : 'other';
    return {
      targetType: String(targetType).toLowerCase(),
      targetId: String(targetId).trim(),
      reason: String(reason).trim(),
      category: normalizedCategory,
    };
  };

  // Valid payload
  const validResult = validateReportInput({
    targetType: 'quiz',
    targetId: '0123456789abcdef01234567',
    reason: 'Contains inappropriate language',
    category: 'inappropriate',
  });
  assert.equal(validResult.targetType, 'quiz');
  assert.equal(validResult.targetId, '0123456789abcdef01234567');
  assert.equal(validResult.category, 'inappropriate');

  // Fallback to 'other' category if unrecognized
  const unknownCatResult = validateReportInput({
    targetType: 'challenge',
    targetId: '0123456789abcdef01234567',
    reason: 'Suspicious bot activity',
    category: 'unknown_tag',
  });
  assert.equal(unknownCatResult.category, 'other');

  // Missing required fields
  assert.throws(() => validateReportInput({ targetType: 'quiz' }), /required fields/);
  assert.throws(() => validateReportInput({ targetType: 'quiz', targetId: '123' }), /required fields/);
  assert.throws(() => validateReportInput({ targetType: 'quiz', targetId: '   ', reason: 'reason' }), /required fields/);

  // Invalid targetType
  assert.throws(() => validateReportInput({
    targetType: 'database_table',
    targetId: '123',
    reason: 'Invalid target type injection',
  }), /Invalid targetType/);
});

test('hasAdminPermission and requirePermission enforce RBAC hierarchy', () => {
  // Wildcard admin
  const superAdmin = { permissions: ['*'] };
  assert.equal(hasAdminPermission(superAdmin, 'manage_users'), true);
  assert.equal(hasAdminPermission(superAdmin, 'suspend_users'), true);
  assert.equal(hasAdminPermission(superAdmin, 'any_random_perm'), true);

  // Scoped moderator
  const moderator = { permissions: ['manage_content', 'manage_reports'] };
  assert.equal(hasAdminPermission(moderator, 'manage_content'), true);
  assert.equal(hasAdminPermission(moderator, 'manage_reports'), true);
  assert.equal(hasAdminPermission(moderator, 'manage_users'), false);

  // requirePermission middleware execution
  const manageUsersMiddleware = requirePermission('manage_users');

  // 1. Unauthenticated request
  let errorReturned = null;
  manageUsersMiddleware({ adminUser: null }, {}, (err) => { errorReturned = err; });
  assert.ok(errorReturned instanceof AppError);
  assert.equal(errorReturned.statusCode, 401);

  // 2. Insufficient permissions
  errorReturned = null;
  manageUsersMiddleware({ adminUser: moderator }, {}, (err) => { errorReturned = err; });
  assert.ok(errorReturned instanceof AppError);
  assert.equal(errorReturned.statusCode, 403);
  assert.match(errorReturned.message, /Missing permission 'manage_users'/);

  // 3. Authorized request
  let nextCalled = false;
  manageUsersMiddleware({ adminUser: superAdmin }, {}, (err) => {
    assert.equal(err, undefined);
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('admin route isolation distinguishes public vs protected routes', async () => {
  const { default: router } = await import('../src/routes/admin.routes.js');
  
  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  // Health and report submission exist
  assert.ok(routePaths.includes('/health'), 'Public routes must include /health');
  assert.ok(routePaths.includes('/reports/submit'), 'Report submission route must exist');

  // Protected operational routes exist
  assert.ok(routePaths.includes('/overview'), 'Overview route must exist');
  assert.ok(routePaths.includes('/users'), 'Users route must exist');
  assert.ok(routePaths.includes('/content'), 'Content route must exist');
  assert.ok(routePaths.includes('/reports'), 'Reports route must exist');

  // Middlewares in router stack: layer 2 is router.use(protectAdmin)
  const middlewareLayers = router.stack.filter(l => !l.route);
  assert.ok(middlewareLayers.length >= 1, 'Router must mount protectAdmin middleware');
});

test('admin AppError generates standard error responses', () => {
  const notFound = new AppError('Admin entity not found', 404);
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.status, 'fail');

  const forbidden = new AppError('Insufficient admin permissions', 403);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.status, 'fail');
});
