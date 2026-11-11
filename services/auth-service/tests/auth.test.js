import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verifySessionToken, isCurrentSession } from '../src/utils/sessionToken.js';
import { AppError } from '../src/middleware/error.middleware.js';

const TEST_SECRET = 'super-secret-auth-testing-key-at-least-32-chars!';

test('verifySessionToken decodes valid tokens with compliant claims', () => {
  const validClaims = {
    id: '0123456789abcdef01234567',
    tokenVersion: 1,
    sid: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  };
  const token = jwt.sign(validClaims, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  const verified = verifySessionToken(token, TEST_SECRET);

  assert.equal(verified.id, validClaims.id);
  assert.equal(verified.tokenVersion, 1);
  assert.equal(verified.sid, validClaims.sid);
  assert.ok(Number.isSafeInteger(verified.exp));
});

test('verifySessionToken rejects tokens with invalid or untrusted claims', () => {
  // Invalid user ObjectId format
  const badIdToken = jwt.sign({ id: 'invalid-id-format' }, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  assert.throws(() => verifySessionToken(badIdToken, TEST_SECRET), /Invalid session claims/);

  // Prohibited aud claim
  const audToken = jwt.sign({ id: '0123456789abcdef01234567', aud: 'admin' }, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  assert.throws(() => verifySessionToken(audToken, TEST_SECRET), /Invalid session claims/);

  // Prohibited iss claim
  const issToken = jwt.sign({ id: '0123456789abcdef01234567', iss: 'issuer' }, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  assert.throws(() => verifySessionToken(issToken, TEST_SECRET), /Invalid session claims/);

  // Invalid sid UUID format
  const badSidToken = jwt.sign({ id: '0123456789abcdef01234567', sid: 'not-a-uuid' }, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  assert.throws(() => verifySessionToken(badSidToken, TEST_SECRET), /Invalid session claims/);

  // Negative tokenVersion
  const badVersionToken = jwt.sign({ id: '0123456789abcdef01234567', tokenVersion: -1 }, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  assert.throws(() => verifySessionToken(badVersionToken, TEST_SECRET), /Invalid session claims/);

  // Tampered token signature
  const validToken = jwt.sign({ id: '0123456789abcdef01234567' }, TEST_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  assert.throws(() => verifySessionToken(validToken, 'different-secret-signature-mismatch'), /invalid signature/);
});

test('isCurrentSession asserts tokenVersion and active session lifetime', () => {
  const sessionId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const now = Date.now();

  const user = {
    tokenVersion: 2,
    sessions: [
      {
        sessionId,
        expiresAt: new Date(now + 60000), // active
      },
      {
        sessionId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
        expiresAt: new Date(now - 1000), // expired
      },
    ],
  };

  // Matching active session
  assert.equal(isCurrentSession(user, { tokenVersion: 2, sid: sessionId }, now), true);

  // Outdated tokenVersion
  assert.equal(isCurrentSession(user, { tokenVersion: 1, sid: sessionId }, now), false);

  // Expired session
  assert.equal(isCurrentSession(user, { tokenVersion: 2, sid: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e' }, now), false);

  // Unknown session
  assert.equal(isCurrentSession(user, { tokenVersion: 2, sid: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f' }, now), false);
});

test('password hashing with bcrypt behaves securely and reliably', async () => {
  const password = 'CorrectHorseBatteryStaple#2026';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'));
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare('WrongPassword#1234', hash), false);
});

test('AppError creates operational error with appropriate statusCode and message', () => {
  const err = new AppError('Resource not found', 404);
  assert.equal(err.message, 'Resource not found');
  assert.equal(err.statusCode, 404);
  assert.equal(err.status, 'fail');
  assert.equal(err.isOperational, true);

  const serverErr = new AppError('Server error', 500);
  assert.equal(serverErr.status, 'error');
});
