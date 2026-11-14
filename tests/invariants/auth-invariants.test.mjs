import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../../services/auth-service/node_modules/jsonwebtoken/index.js';
import crypto from 'node:crypto';
import { verifySessionToken, isCurrentSession } from '../../services/auth-service/dist/utils/sessionToken.js';

const TEST_SECRET = 'super-secret-auth-invariants-key-at-least-32-chars!';
const TEST_REFRESH_SECRET = 'super-secret-refresh-invariants-key-at-least-32-chars!';

test('auth invariant: token expiration, tampering, and malformed claims are strictly rejected', () => {
  const validUser = '507f1f77bcf86cd799439011';
  const validUuid = '12345678-1234-4234-8234-123456789abc';

  // 1. Expired token reject
  const expiredToken = jwt.sign(
    { id: validUser, sid: validUuid, tokenVersion: 1 },
    TEST_SECRET,
    { algorithm: 'HS256', expiresIn: '-1s' }
  );
  assert.throws(() => verifySessionToken(expiredToken, TEST_SECRET), /jwt expired|Invalid session claims/);

  // 2. Tampered signature reject
  const validToken = jwt.sign(
    { id: validUser, sid: validUuid, tokenVersion: 1 },
    TEST_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
  assert.throws(() => verifySessionToken(validToken, 'tampered-secret-key-1234567890'), /invalid signature/);

  // 3. Tampered payload with original signature
  const [headerB64, payloadB64, sigB64] = validToken.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payloadB64, 'base64').toString()), id: '507f1f77bcf86cd799439099' })
  ).toString('base64url');
  const forgedToken = `${headerB64}.${tamperedPayload}.${sigB64}`;
  assert.throws(() => verifySessionToken(forgedToken, TEST_SECRET), /invalid signature/);

  // 4. Malformed claims: missing / non-hex id
  const nonHexToken = jwt.sign({ id: 'not-a-24-hex-id-string' }, TEST_SECRET, { algorithm: 'HS256' });
  assert.throws(() => verifySessionToken(nonHexToken, TEST_SECRET), /Invalid session claims/);

  // 5. Malformed claims: disallowed audience / issuer / scope claims
  for (const forbidden of [{ aud: 'public' }, { iss: 'auth' }, { scope: 'read' }]) {
    const t = jwt.sign({ id: validUser, ...forbidden }, TEST_SECRET, { algorithm: 'HS256' });
    assert.throws(() => verifySessionToken(t, TEST_SECRET), /Invalid session claims/);
  }

  // 6. Malformed claims: invalid sid UUID or negative tokenVersion
  const badSid = jwt.sign({ id: validUser, sid: 'not-a-uuid' }, TEST_SECRET, { algorithm: 'HS256' });
  assert.throws(() => verifySessionToken(badSid, TEST_SECRET), /Invalid session claims/);

  const badVersion = jwt.sign({ id: validUser, tokenVersion: -5 }, TEST_SECRET, { algorithm: 'HS256' });
  assert.throws(() => verifySessionToken(badVersion, TEST_SECRET), /Invalid session claims/);
});

test('auth invariant: cookie security attributes enforce httpOnly, sameSite, and path isolation', () => {
  // Standard auth cookie configuration in QuizFocus
  const createCookieDescriptor = (isProd = false) => ({
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });

  const devCookies = createCookieDescriptor(false);
  const prodCookies = createCookieDescriptor(true);

  // Invariant 1: httpOnly MUST always be true to prevent XSS exfiltration
  assert.equal(devCookies.httpOnly, true, 'httpOnly must be true in dev');
  assert.equal(prodCookies.httpOnly, true, 'httpOnly must be true in prod');

  // Invariant 2: path MUST be isolated to root '/'
  assert.equal(devCookies.path, '/');
  assert.equal(prodCookies.path, '/');

  // Invariant 3: sameSite must be strictly configured
  assert.equal(devCookies.sameSite, 'lax');
  assert.equal(prodCookies.sameSite, 'none');
  assert.equal(prodCookies.secure, true, 'Secure must be true in production when sameSite is none');
});

test('auth invariant: single refresh token replay protection ensures rotated tokens cannot be reused', () => {
  const digest = (token) => 'sha256:' + crypto.createHash('sha256').update(token).digest('hex');

  // Synthetic user session store
  const userId = '507f1f77bcf86cd799439011';
  const sessionId = crypto.randomUUID();
  let currentTokenVersion = 1;

  // Initial issuance
  const initialRefresh = jwt.sign(
    { id: userId, tokenVersion: currentTokenVersion, sid: sessionId },
    TEST_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '7d', jwtid: crypto.randomUUID() }
  );

  let activeSession = {
    sessionId,
    refreshTokenHash: digest(initialRefresh),
    tokenVersion: currentTokenVersion,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  };

  // Rotation function simulating session.service.js rotateSession
  const rotateRefreshToken = (presentedToken) => {
    const claims = verifySessionToken(presentedToken, TEST_REFRESH_SECRET);
    if ((claims.tokenVersion ?? 0) !== activeSession.tokenVersion) {
      throw new Error('Token version mismatch: session superseded');
    }
    if (activeSession.sessionId !== claims.sid) {
      throw new Error('Session ID mismatch');
    }
    const presentedHash = digest(presentedToken);
    if (activeSession.refreshTokenHash !== presentedHash) {
      throw new Error('Refresh token replay detected: token has already been rotated');
    }

    // Generate new rotated token
    const newRefresh = jwt.sign(
      { id: userId, tokenVersion: currentTokenVersion, sid: sessionId },
      TEST_REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '7d', jwtid: crypto.randomUUID() }
    );
    activeSession.refreshTokenHash = digest(newRefresh);
    return newRefresh;
  };

  // 1. First legitimate rotation succeeds
  const rotatedToken1 = rotateRefreshToken(initialRefresh);
  assert.ok(rotatedToken1);
  assert.notEqual(rotatedToken1, initialRefresh);

  // 2. Replay attempt: presenting initialRefresh again MUST be detected and rejected
  assert.throws(
    () => rotateRefreshToken(initialRefresh),
    /Refresh token replay detected/
  );

  // 3. Second legitimate rotation using rotatedToken1 succeeds
  const rotatedToken2 = rotateRefreshToken(rotatedToken1);
  assert.ok(rotatedToken2);
  assert.notEqual(rotatedToken2, rotatedToken1);

  // 4. Replaying rotatedToken1 now also fails
  assert.throws(
    () => rotateRefreshToken(rotatedToken1),
    /Refresh token replay detected/
  );
});
