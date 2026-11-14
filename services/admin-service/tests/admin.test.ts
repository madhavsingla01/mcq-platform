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
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { AppError } from '../src/middleware/error.middleware.js';
const { hasAdminPermission, requirePermission } = await import('../src/middleware/auth.middleware.js');
const { normalizeReportInput } = await import('../src/controllers/reports.controller.js');

test('report submission validation requires targetType, targetId, and reason', () => {
  // Valid payload
  const validResult = normalizeReportInput({
    targetType: 'quiz',
    targetId: '0123456789abcdef01234567',
    reason: 'Contains inappropriate language',
    category: 'inappropriate',
  });
  assert.equal(validResult.targetType, 'quiz');
  assert.equal(validResult.targetId, '0123456789abcdef01234567');
  assert.equal(validResult.category, 'inappropriate');

  // Fallback to 'other' category if unrecognized
  const unknownCatResult = normalizeReportInput({
    targetType: 'challenge',
    targetId: '0123456789abcdef01234567',
    reason: 'Suspicious bot activity',
    category: 'unknown_tag',
  });
  assert.equal(unknownCatResult.category, 'other');

  // Missing required fields
  assert.throws(() => normalizeReportInput({ targetType: 'quiz' }), /required fields/);
  assert.throws(() => normalizeReportInput({ targetType: 'quiz', targetId: '123' }), /required fields/);
  assert.throws(() => normalizeReportInput({ targetType: 'quiz', targetId: '   ', reason: 'reason' }), /required fields/);

  // Invalid targetType
  assert.throws(() => normalizeReportInput({
    targetType: 'database_table',
    targetId: '123',
    reason: 'Invalid target type injection',
  }), /Invalid targetType/);
});

test('hasAdminPermission and routes enforce RBAC hierarchy', async () => {
  const { default: router } = await import('../src/routes/admin.routes.js');
  const { default: express } = await import('express');
  const { errorHandler } = await import('../src/middleware/error.middleware.js');

  const superAdmin = { _id: new Types.ObjectId(), permissions: ['*'] };
  const moderator = { _id: new Types.ObjectId(), permissions: ['manage_content', 'manage_reports'] };
  assert.equal(hasAdminPermission(superAdmin, 'any_random_perm'), true);
  assert.equal(hasAdminPermission(moderator, 'manage_content'), true);
  assert.equal(hasAdminPermission(moderator, 'manage_users'), false);

  const app = express();
  app.use('/admin', router);
  app.get('/permission-check', (req, _res, next) => {
    if (req.query.actor === 'moderator') req.adminUser = moderator;
    if (req.query.actor === 'root') req.adminUser = superAdmin;
    next();
  }, requirePermission('manage_users'), (_req, res) => res.sendStatus(204));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const cases: ReadonlyArray<readonly [string, number]> = [
      ['/admin/health', 200],
      ['/admin/overview', 401],
      ['/admin/users', 401],
      ['/admin/content', 401],
      ['/admin/reports', 401],
      ['/permission-check', 401],
      ['/permission-check?actor=moderator', 403],
      ['/permission-check?actor=root', 204],
    ];
    for (const [path, expected] of cases) {
      const response = await fetch(base + path);
      await response.text();
      assert.equal(response.status, expected, path);
    }
  } finally {
    server.close();
  }
});

test('admin AppError generates standard error responses', () => {
  const notFound = new AppError('Admin entity not found', 404);
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.status, 'fail');

  const forbidden = new AppError('Insufficient admin permissions', 403);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.status, 'fail');
});
