import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.PORT = '5013';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';

const { verifySessionToken, protect, optionalAuth } = await import('../src/middleware/auth.middleware.js');
const { validateBody, validateObjectId } = await import('../src/middleware/validation.middleware.js');
const { errorHandler, AppError } = await import('../src/middleware/error.middleware.js');
const { start, shutdown } = await import('../src/server.js');

describe('Empirical Adversarial Challenge Suite — Marketplace Service', () => {
  let app;
  let server;
  let baseUrl;

  const JWT_SECRET = process.env.JWT_SECRET;
  const DIFFERENT_SECRET = 'attacker-completely-different-signing-secret-32-bytes';
  const VALID_USER_ID = '507f1f77bcf86cd799439011';
  const VALID_UUID_SID = 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab';

  before(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Protected route
    app.get('/protected', protect, (req, res) => {
      res.status(200).json({
        success: true,
        user: req.user,
        authSessionId: req.authSessionId,
      });
    });

    // Optional auth route
    app.get('/optional', optionalAuth, (req, res) => {
      res.status(200).json({
        success: true,
        user: req.user || null,
        authSessionId: req.authSessionId || null,
      });
    });

    // Validation routes
    const sampleSchema = {
      title: { required: true, type: 'string', min: 4, max: 20 },
      price: { required: true, type: 'number' },
      email: { required: true, type: 'string', email: true },
      sku: { required: false, type: 'string', pattern: /^SKU-[0-9]{4}$/ },
    };

    app.post('/validate-sample', validateBody(sampleSchema), (req, res) => {
      res.status(200).json({ success: true, body: req.body });
    });

    app.get('/validate-id/:id', validateObjectId('id'), (req, res) => {
      res.status(200).json({ success: true, id: req.params.id });
    });

    app.get('/validate-custom/:listingId', validateObjectId('listingId'), (req, res) => {
      res.status(200).json({ success: true, listingId: req.params.listingId });
    });

    // Standard error handler
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  function createTestToken(payload = {}, secret = JWT_SECRET, options = {}) {
    return jwt.sign(
      {
        id: VALID_USER_ID,
        role: 'user',
        sid: VALID_UUID_SID,
        tokenVersion: 1,
        ...payload,
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: '1h',
        ...options,
      }
    );
  }

  // =========================================================================
  // SECTION 1: Auth Middleware Adversarial Tests
  // =========================================================================
  describe('1. Auth Middleware Adversarial Tests', () => {
    it('1.1 Request protected route without token -> returns 401', async () => {
      const res = await fetch(`${baseUrl}/protected`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Not authenticated. Please log in.');
      assert.equal(data.data, null);
    });

    it('1.2 Request protected route with malformed Authorization headers -> returns 401', async () => {
      const malformedHeaders = [
        { authorization: 'Bearer ' },
        { authorization: 'Bearer' },
        { authorization: 'Basic dXNlcjpwYXNz' },
        { authorization: 'Token 12345' },
        { authorization: 'Bearer null' },
        { authorization: 'Bearer undefined' },
      ];

      for (const headers of malformedHeaders) {
        const res = await fetch(`${baseUrl}/protected`, { headers });
        assert.equal(res.status, 401, `Failed for header: ${JSON.stringify(headers)}`);
        const data = await res.json();
        assert.equal(data.success, false);
      }
    });

    it('1.3 Request protected route with malformed JWT tokens -> returns 401', async () => {
      const malformedTokens = [
        'not-a-valid-token',
        'foo.bar.baz',
        'eyJhbGciOiJIUzI1NiJ9.invalid-json.signature',
        'header-only',
        'header.payload',
        createTestToken().slice(0, -10),
        `${createTestToken()}extra-junk`,
      ];

      for (const token of malformedTokens) {
        // Bearer header
        const resHeader = await fetch(`${baseUrl}/protected`, {
          headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(resHeader.status, 401, `Bearer failed to reject token: ${token}`);
        const dataHeader = await resHeader.json();
        assert.equal(dataHeader.success, false);
        assert.equal(dataHeader.message, 'Invalid or expired token.');

        // Cookie
        const resCookie = await fetch(`${baseUrl}/protected`, {
          headers: { cookie: `accessToken=${token}` },
        });
        assert.equal(resCookie.status, 401, `Cookie failed to reject token: ${token}`);
        const dataCookie = await resCookie.json();
        assert.equal(dataCookie.success, false);
        assert.equal(dataCookie.message, 'Invalid or expired token.');
      }
    });

    it('1.4 Request protected route with token signed by different secret -> returns 401', async () => {
      const foreignToken = createTestToken({}, DIFFERENT_SECRET);

      const resHeader = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: `Bearer ${foreignToken}` },
      });
      assert.equal(resHeader.status, 401);
      const dataHeader = await resHeader.json();
      assert.equal(dataHeader.success, false);
      assert.equal(dataHeader.message, 'Invalid or expired token.');

      const resCookie = await fetch(`${baseUrl}/protected`, {
        headers: { cookie: `accessToken=${foreignToken}` },
      });
      assert.equal(resCookie.status, 401);
      const dataCookie = await resCookie.json();
      assert.equal(dataCookie.success, false);
      assert.equal(dataCookie.message, 'Invalid or expired token.');
    });

    it('1.5 Request protected route with token containing disallowed claims (`aud`, `iss`, `scope`) -> returns 401', async () => {
      const disallowedScenarios = [
        { payload: { aud: 'https://quizfocus.internal' }, label: 'disallowed aud' },
        { payload: { iss: 'external-auth-server' }, label: 'disallowed iss' },
        { payload: { scope: 'read:all' }, label: 'disallowed scope' },
        { payload: { id: 'invalid-non-hex-id' }, label: 'non-hex user id' },
        { payload: { id: '507f1f77bcf86cd79943901' }, label: '23-char user id' },
        { payload: { id: '507f1f77bcf86cd799439011a' }, label: '25-char user id' },
        { payload: { sid: 'not-a-uuid-string' }, label: 'malformed sid' },
        { payload: { tokenVersion: -1 }, label: 'negative tokenVersion' },
        { payload: { tokenVersion: 1.5 }, label: 'float tokenVersion' },
      ];

      for (const { payload, label } of disallowedScenarios) {
        const token = createTestToken(payload);
        const res = await fetch(`${baseUrl}/protected`, {
          headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(res.status, 401, `Failed to reject token with ${label}`);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.message, 'Invalid or expired token.');
      }
    });

    it('1.6 Request protected route with expired token -> returns 401', async () => {
      const expiredToken = createTestToken({}, JWT_SECRET, { expiresIn: -30 });
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Invalid or expired token.');
    });

    it('1.7 Request protected route with valid signed token -> returns 200 and populates req.user', async () => {
      const validToken = createTestToken({
        id: VALID_USER_ID,
        role: 'creator',
        email: 'creator@quizfocus.com',
        tokenVersion: 3,
        sid: VALID_UUID_SID,
      });

      // Bearer header
      const resHeader = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: `Bearer ${validToken}` },
      });
      assert.equal(resHeader.status, 200);
      const dataHeader = await resHeader.json();
      assert.equal(dataHeader.success, true);
      assert.deepEqual(dataHeader.user, {
        id: VALID_USER_ID,
        role: 'creator',
        email: 'creator@quizfocus.com',
        tokenVersion: 3,
      });
      assert.equal(dataHeader.authSessionId, VALID_UUID_SID);

      // Cookie
      const resCookie = await fetch(`${baseUrl}/protected`, {
        headers: { cookie: `accessToken=${validToken}` },
      });
      assert.equal(resCookie.status, 200);
      const dataCookie = await resCookie.json();
      assert.equal(dataCookie.success, true);
      assert.equal(dataCookie.user.id, VALID_USER_ID);
      assert.equal(dataCookie.user.role, 'creator');
      assert.equal(dataCookie.authSessionId, VALID_UUID_SID);
    });

    it('1.8 OptionalAuth: attaches user on valid token, allows guest on missing/invalid token', async () => {
      // Missing token -> guest access (200, user = null)
      const resGuest = await fetch(`${baseUrl}/optional`);
      assert.equal(resGuest.status, 200);
      const dataGuest = await resGuest.json();
      assert.equal(dataGuest.success, true);
      assert.equal(dataGuest.user, null);

      // Invalid token -> guest access (200, user = null)
      const resInvalid = await fetch(`${baseUrl}/optional`, {
        headers: { authorization: 'Bearer invalid-token-string' },
      });
      assert.equal(resInvalid.status, 200);
      const dataInvalid = await resInvalid.json();
      assert.equal(dataInvalid.success, true);
      assert.equal(dataInvalid.user, null);

      // Valid token -> authenticated access (200, user populated)
      const validToken = createTestToken({ role: 'student' });
      const resAuth = await fetch(`${baseUrl}/optional`, {
        headers: { authorization: `Bearer ${validToken}` },
      });
      assert.equal(resAuth.status, 200);
      const dataAuth = await resAuth.json();
      assert.equal(dataAuth.success, true);
      assert.equal(dataAuth.user.id, VALID_USER_ID);
      assert.equal(dataAuth.user.role, 'student');
    });
  });

  // =========================================================================
  // SECTION 2: Validation Middleware Adversarial Tests
  // =========================================================================
  describe('2. Validation Middleware Adversarial Tests', () => {
    it('2.1 validateBody rejects missing body or non-object payloads with 400', async () => {
      // Empty body
      const resEmpty = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      assert.equal(resEmpty.status, 400);

      // Array payload
      const resArray = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['item1', 'item2']),
      });
      assert.equal(resArray.status, 400);
      const dataArray = await resArray.json();
      assert.equal(dataArray.success, false);
      assert.deepEqual(dataArray.errors, ['Request body must be a JSON object']);
    });

    it('2.2 validateBody reports missing required fields with structured errors array', async () => {
      const res = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Validation failed');
      assert.ok(Array.isArray(data.errors));
      assert.equal(data.errors.length, 3);
      assert.ok(data.errors.includes('title is required'));
      assert.ok(data.errors.includes('price is required'));
      assert.ok(data.errors.includes('email is required'));
    });

    it('2.3 validateBody reports wrong data types with structured errors array', async () => {
      const res = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 12345, // should be string
          price: 'free', // should be number
          email: true, // should be string
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.errors.includes('title must be of type string'));
      assert.ok(data.errors.includes('price must be of type number'));
      assert.ok(data.errors.includes('email must be of type string'));
    });

    it('2.4 validateBody reports out-of-range strings (min / max)', async () => {
      // Too short (< 4)
      const resShort = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'abc',
          price: 10,
          email: 'valid@example.com',
        }),
      });
      assert.equal(resShort.status, 400);
      const dataShort = await resShort.json();
      assert.ok(dataShort.errors.includes('title must be at least 4 characters'));

      // Too long (> 20)
      const resLong = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'This title is definitely longer than twenty characters',
          price: 10,
          email: 'valid@example.com',
        }),
      });
      assert.equal(resLong.status, 400);
      const dataLong = await resLong.json();
      assert.ok(dataLong.errors.includes('title must be at most 20 characters'));
    });

    it('2.5 validateBody reports malformed email formats', async () => {
      const invalidEmails = [
        'plainstring',
        'missing-at-sign.com',
        '@missing-local-part.com',
        'missing-domain@',
        'missing-tld@domain',
        'spaces in@email.com',
      ];

      for (const email of invalidEmails) {
        const res = await fetch(`${baseUrl}/validate-sample`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Valid Title',
            price: 19.99,
            email,
          }),
        });
        assert.equal(res.status, 400, `Expected 400 for email: ${email}`);
        const data = await res.json();
        assert.ok(data.errors.includes('email must be a valid email address'));
      }
    });

    it('2.6 validateBody validates regex patterns and passes conforming payloads', async () => {
      // Invalid pattern
      const resBadPattern = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Valid Title',
          price: 19.99,
          email: 'test@example.com',
          sku: 'INVALID-SKU',
        }),
      });
      assert.equal(resBadPattern.status, 400);
      const dataBad = await resBadPattern.json();
      assert.ok(dataBad.errors.includes('sku format is invalid'));

      // Conforming payload
      const resValid = await fetch(`${baseUrl}/validate-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Valid Title',
          price: 19.99,
          email: 'test@example.com',
          sku: 'SKU-9943',
        }),
      });
      assert.equal(resValid.status, 200);
      const dataValid = await resValid.json();
      assert.equal(dataValid.success, true);
    });

    it('2.7 validateObjectId rejects invalid non-hex IDs with 400', async () => {
      const invalidNonHex = [
        'non-hex-identifier-value',
        '507f1f77bcf86cd79943901g',
        '507f1f77bcf86cd79943901Z',
        '507f1f77bcf86cd79943901!',
        ' 507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439011 ',
      ];

      for (const badId of invalidNonHex) {
        const res = await fetch(`${baseUrl}/validate-id/${encodeURIComponent(badId)}`);
        assert.equal(res.status, 400, `Expected 400 for non-hex id: ${badId}`);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.message, 'Invalid id');
      }
    });

    it('2.8 validateObjectId rejects 23-char IDs (off-by-one under) with 400', async () => {
      const id23 = '507f1f77bcf86cd79943901';
      assert.equal(id23.length, 23);
      const res = await fetch(`${baseUrl}/validate-id/${id23}`);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Invalid id');
    });

    it('2.9 validateObjectId rejects 25-char IDs (off-by-one over) with 400', async () => {
      const id25 = '507f1f77bcf86cd799439011a';
      assert.equal(id25.length, 25);
      const res = await fetch(`${baseUrl}/validate-id/${id25}`);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Invalid id');
    });

    it('2.10 validateObjectId accepts valid 24-character hexadecimal IDs (including custom param name)', async () => {
      const validHexId = '507f1f77bcf86cd799439011';
      const res = await fetch(`${baseUrl}/validate-id/${validHexId}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.id, validHexId);

      // Custom parameter name (listingId)
      const resCustom = await fetch(`${baseUrl}/validate-custom/${validHexId}`);
      assert.equal(resCustom.status, 200);
      const dataCustom = await resCustom.json();
      assert.equal(dataCustom.success, true);
      assert.equal(dataCustom.listingId, validHexId);

      // Custom parameter failure
      const resCustomFail = await fetch(`${baseUrl}/validate-custom/bad-listing-id`);
      assert.equal(resCustomFail.status, 400);
      const dataCustomFail = await resCustomFail.json();
      assert.equal(dataCustomFail.message, 'Invalid listingId');
    });
  });

  // =========================================================================
  // SECTION 3: Graceful Shutdown Behavior
  // =========================================================================
  describe('3. Graceful Shutdown Behavior', () => {
    it('3.1 shutdown(false) cleanly closes active server without unhandled errors', async () => {
      const serverInstance = await start(0);
      assert.ok(serverInstance.listening, 'Server should be listening');
      const addr = serverInstance.address();
      assert.ok(addr.port > 0);

      const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'healthy');

      let unhandledThrown = false;
      const unhandledListener = () => { unhandledThrown = true; };
      process.on('uncaughtException', unhandledListener);
      process.on('unhandledRejection', unhandledListener);

      try {
        await shutdown(false);
        assert.equal(serverInstance.listening, false, 'Server should not be listening after shutdown');
        assert.equal(unhandledThrown, false, 'No unhandled errors or rejections should occur');
      } finally {
        process.removeListener('uncaughtException', unhandledListener);
        process.removeListener('unhandledRejection', unhandledListener);
      }
    });

    it('3.2 subsequent calls to shutdown(false) return cleanly without throwing', async () => {
      await shutdown(false);
      await shutdown(false);
    });
  });
});
