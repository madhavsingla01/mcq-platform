process.env.NODE_ENV = 'test';
process.env.PORT = '5006';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/message-tests';
process.env.JWT_SECRET = 'message-service-test-secret-at-least-32-chars!';
process.env.CLIENT_URL = 'http://localhost:5173';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDIT_WINDOW_MS,
  textValue,
  safeUrl,
  normalizeClientMessageId,
  paginationOptions,
  cursorCondition,
  assertEditable,
  requireId,
  validId,
} from '../src/services/messagePolicy.js';
import { AppError } from '../src/middleware/error.middleware.js';

test('messagePolicy textValue and identifier validation', () => {
  // textValue
  assert.equal(textValue('  hello world  '), 'hello world');
  assert.equal(textValue('', { required: false }), '');
  assert.throws(() => textValue('', { required: true }), /Text must contain 1 to 2000 characters/);
  assert.throws(() => textValue('a'.repeat(2001)), /Text must contain 0 to 2000 characters/);
  assert.throws(() => textValue(12345), /Text must be a string/);

  // validId & requireId
  assert.equal(validId('0123456789abcdef01234567'), true);
  assert.equal(validId('not-a-valid-hex-id'), false);
  assert.equal(requireId('0123456789abcdef01234567'), '0123456789abcdef01234567');
  assert.throws(() => requireId('short-id'), /Invalid ID/);

  // normalizeClientMessageId
  assert.equal(normalizeClientMessageId('client-msg-12345'), 'client-msg-12345');
  assert.equal(normalizeClientMessageId(null), undefined);
  assert.throws(() => normalizeClientMessageId('short'), /Invalid client message ID/);
  assert.throws(() => normalizeClientMessageId('bad@id!chars'), /Invalid client message ID/);
});

test('messagePolicy safeUrl validates safe URLs and blocks malicious protocols', () => {
  // Safe relative paths and HTTPS/HTTP
  assert.equal(safeUrl('/media/assets/abc-123/image'), '/media/assets/abc-123/image');
  assert.equal(safeUrl('https://example.com/image.png'), 'https://example.com/image.png');
  assert.equal(safeUrl('http://example.com/resource'), 'http://example.com/resource');
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl(''), null);

  // Malicious protocols and formats
  assert.throws(() => safeUrl('javascript:alert(1)'), /Only HTTP\(S\) or relative URLs are supported/);
  assert.throws(() => safeUrl('data:text/html;base64,PHNjcmlwdD4='), /Only HTTP\(S\) or relative URLs are supported/);
  assert.throws(() => safeUrl('ftp://example.com/file'), /Only HTTP\(S\) or relative URLs are supported/);
  assert.throws(() => safeUrl('https://user:password@example.com'), /Only HTTP\(S\) or relative URLs are supported/);
  assert.throws(() => safeUrl('//protocol-relative.com/bad'), /Only HTTP\(S\) or relative URLs are supported/);
});

test('messagePolicy pagination and cursor conditions', () => {
  // Default pagination
  const defaultPage = paginationOptions({});
  assert.equal(defaultPage.limit, 50);

  // Custom limit
  const customPage = paginationOptions({ limit: '25' });
  assert.equal(customPage.limit, 25);

  // Invalid limit
  assert.throws(() => paginationOptions({ limit: 0 }), /Limit must be between 1 and 100/);
  assert.throws(() => paginationOptions({ limit: 101 }), /Limit must be between 1 and 100/);

  // Conflicting before and after
  assert.throws(() => paginationOptions({ before: 'cur1', after: 'cur2' }), /Use either before or after, not both/);

  // Cursor conditions
  const cursor = { createdAt: new Date('2026-01-01T00:00:00Z'), _id: '0123456789abcdef01234567' };
  const conditionAfter = cursorCondition(cursor, 'after');
  assert.deepEqual(conditionAfter, {
    $or: [
      { createdAt: { $gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $gt: cursor._id } },
    ],
  });

  const conditionBefore = cursorCondition(cursor, 'before');
  assert.deepEqual(conditionBefore, {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ],
  });
});

test('assertEditable enforces sender ownership, deleted state, and 15-minute window', () => {
  const senderId = '0123456789abcdef01234567';
  const now = Date.now();

  const validMessage = {
    sender: senderId,
    createdAt: new Date(now - 5 * 60 * 1000), // 5 minutes ago
    isDeleted: false,
  };

  // Valid edit by sender
  assert.doesNotThrow(() => assertEditable(validMessage, senderId, now));

  // Unauthorized edit by another user
  assert.throws(
    () => assertEditable(validMessage, 'fedcba9876543210fedcba98', now),
    /Only the sender can edit this message/
  );

  // Attempting to edit a deleted message
  const deletedMessage = { ...validMessage, isDeleted: true };
  assert.throws(
    () => assertEditable(deletedMessage, senderId, now),
    /Deleted messages cannot be edited/
  );

  // Attempting to edit after 15-minute window expired (16 minutes ago)
  const expiredMessage = {
    sender: senderId,
    createdAt: new Date(now - (EDIT_WINDOW_MS + 60000)),
    isDeleted: false,
  };
  assert.throws(
    () => assertEditable(expiredMessage, senderId, now),
    /Messages can be edited for 15 minutes after sending/
  );
});

test('message routes structure adheres to microservice boundary', async () => {
  const { default: router } = await import('../src/routes/message.routes.js');
  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(routePaths.includes('/start'), 'Should support starting conversation');
  assert.ok(routePaths.includes('/conversations/:conversationId'), 'Should support conversation messages');
  assert.ok(routePaths.includes('/:messageId'), 'Should support single message mutations');
});
