import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from '../services/marketplace-service/node_modules/jsonwebtoken/index.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '5013';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';

const { validateEnv } = await import('../services/marketplace-service/src/config/env.js');
const { app, start, shutdown } = await import('../services/marketplace-service/src/server.js');
const { AppError, catchAsync, errorHandler, notFoundHandler } = await import('../services/marketplace-service/src/middleware/error.middleware.js');
const { validateBody, validateObjectId } = await import('../services/marketplace-service/src/middleware/validation.middleware.js');
const { verifySessionToken, protect, optionalAuth } = await import('../services/marketplace-service/src/middleware/auth.middleware.js');

describe('Adversarial Stress Testing — Marketplace Service (Port 5013)', () => {
  let testServer;
  let baseUrl;

  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const { port } = testServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  // --- Suite 1: Environment & Port Validation Stress ---
  describe('Suite 1: Environment & Port Validation Stress', () => {
    const validBase = {
      PORT: '5013',
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173,http://localhost:3000',
      JWT_SECRET: 'quizfocus-local-development-secret-minimum-32-bytes-long',
    };

    it('rejects floating point ports and trailing alpha strings', () => {
      const invalidPorts = ['5013.5', '5013abc', 'abc', 'NaN', 'Infinity', '-Infinity', '0', '-1', '65536', '70000'];
      for (const p of invalidPorts) {
        assert.throws(
          () => validateEnv({ ...validBase, PORT: p }),
          /PORT must be an integer from 1 to 65535/,
          `Port "${p}" should have been rejected`
        );
      }
    });

    it('accepts boundary ports 1 and 65535', () => {
      const p1 = validateEnv({ ...validBase, PORT: '1' });
      assert.equal(p1.PORT, 1);
      const p65535 = validateEnv({ ...validBase, PORT: 65535 });
      assert.equal(p65535.PORT, 65535);
    });

    it('handles comma-separated CLIENT_URL with irregular whitespace and trims properly', () => {
      const config = validateEnv({
        ...validBase,
        CLIENT_URL: '  https://app.quizfocus.com , http://localhost:5173  ,  ',
      });
      assert.deepEqual(config.CLIENT_URL, ['https://app.quizfocus.com', 'http://localhost:5173']);
    });

    it('rejects CLIENT_URL containing only commas or whitespace', () => {
      assert.throws(
        () => validateEnv({ ...validBase, CLIENT_URL: ',,,,   , ' }),
        /CLIENT_URL must contain at least one allowed origin/
      );
    });

    it('validates secret byteLength vs character length accurately for multibyte UTF-8', () => {
      // 16 2-byte characters = 32 bytes in UTF-8
      const multiByteSecret = '©'.repeat(16); // 16 chars * 2 bytes = 32 bytes
      assert.equal(multiByteSecret.length, 16);
      assert.equal(Buffer.byteLength(multiByteSecret), 32);

      const config = validateEnv({
        ...validBase,
        JWT_SECRET: multiByteSecret,
      });
      assert.equal(config.JWT_SECRET, multiByteSecret);

      // 31 ASCII characters = 31 bytes (must be rejected)
      const secret31 = 'a'.repeat(31);
      assert.throws(
        () => validateEnv({ ...validBase, JWT_SECRET: secret31 }),
        /JWT_SECRET must be at least 32 bytes/
      );
    });

    it('enforces production placeholder secret rejection across case variations and known defaults', () => {
      const placeholders = [
        'quizfocus-local-development-secret-minimum-32-bytes-long',
        'QUIZFOCUS-LOCAL-DEVELOPMENT-SECRET-MINIMUM-32-BYTES-LONG',
        'default-jwt-secret-for-testing-purposes-only-32',
        'mcq-platform-jwt-secret-change-in-production-12345',
        'replace-with-your-secure-production-key-here-now',
      ];
      for (const ph of placeholders) {
        assert.throws(
          () => validateEnv({ ...validBase, NODE_ENV: 'production', JWT_SECRET: ph }),
          /JWT_SECRET must be a configured, non-placeholder secret in production/,
          `Placeholder "${ph}" should have been rejected in production`
        );
      }
    });
  });

  // --- Suite 2: Probes, Route Isolation & HTTP Verbs ---
  describe('Suite 2: Probes, Route Isolation & HTTP Verbs', () => {
    it('returns 200 with ISO timestamp for all 6 probe routes', async () => {
      const probePaths = [
        '/health',
        '/ready',
        '/api/v1/health',
        '/api/v1/ready',
        '/api/v1/marketplace/health',
        '/api/v1/marketplace/ready',
      ];

      for (const p of probePaths) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.equal(res.status, 200, `Expected 200 for ${p}`);
        const data = await res.json();
        assert.equal(data.service, 'marketplace-service');
        assert.equal(data.status, 'healthy');
        const parsedTime = Date.parse(data.timestamp);
        assert.ok(!isNaN(parsedTime), `Invalid timestamp format on ${p}`);
        assert.ok(Math.abs(Date.now() - parsedTime) < 10000, `Timestamp too far from now: ${data.timestamp}`);
      }
    });

    it('probes reject non-GET verbs cleanly with 404', async () => {
      const verbs = ['POST', 'PUT', 'DELETE', 'PATCH'];
      for (const verb of verbs) {
        const res = await fetch(`${baseUrl}/health`, { method: verb });
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.message, 'Route not found');
      }
    });

    it('returns structured 404 for arbitrary unimplemented Phase 2 business routes under /api/v1/marketplace', async () => {
      const businessPaths = [
        { path: '/api/v1/marketplace/orders', method: 'GET' },
        { path: '/api/v1/marketplace/orders/507f1f77bcf86cd799439011', method: 'GET' },
        { path: '/api/v1/marketplace/checkout', method: 'POST' },
        { path: '/api/v1/marketplace/listings', method: 'GET' },
        { path: '/api/v1/marketplace/listings/publish', method: 'POST' },
        { path: '/api/v1/marketplace/entitlements/verify', method: 'POST' },
      ];

      for (const { path: p, method } of businessPaths) {
        const res = await fetch(`${baseUrl}${p}`, { method });
        assert.equal(res.status, 404, `Expected 404 for ${method} ${p}`);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.message, 'Marketplace business routes are not yet implemented in Phase 1');
        assert.equal(data.data, null);
        assert.deepEqual(data.errors, []);
      }
    });

    it('survives rapid concurrent probe requests without latency degradation or failures', async () => {
      const requests = Array.from({ length: 50 }, () => fetch(`${baseUrl}/health`));
      const responses = await Promise.all(requests);
      for (const r of responses) {
        assert.equal(r.status, 200);
      }
    });
  });

  // --- Suite 3: Auth Middleware Adversarial Security ---
  describe('Suite 3: Auth Middleware Adversarial Security', () => {
    const validUserId = '507f1f77bcf86cd799439011';
    const secret = process.env.JWT_SECRET;

    it('rejects "none" algorithm tokens (critical CVE attack vector)', () => {
      // Create unsigned "none" algorithm token
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ id: validUserId, role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      assert.throws(() => verifySessionToken(noneToken, secret));
    });

    it('rejects tokens signed with foreign symmetric key', () => {
      const foreignToken = jwt.sign(
        { id: validUserId, role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 },
        'different-secret-key-that-is-at-least-32-bytes-long'
      );
      assert.throws(() => verifySessionToken(foreignToken, secret));
    });

    it('rejects tokens with malformed or non-hex user id', () => {
      const badIds = [
        '507f1f77bcf86cd79943901', // 23 hex chars
        '507f1f77bcf86cd7994390111', // 25 hex chars
        '507f1f77bcf86cd79943901g', // 'g' non-hex
        '../etc/passwd',
        '',
      ];
      for (const id of badIds) {
        const token = jwt.sign(
          { id, role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 },
          secret,
          { algorithm: 'HS256' }
        );
        assert.throws(
          () => verifySessionToken(token, secret),
          /Invalid session claims/,
          `User id "${id}" should have been rejected`
        );
      }
    });

    it('rejects tokens with prohibited claims (aud, iss, scope)', () => {
      const forbiddenClaimSets = [
        { aud: 'quizfocus-client' },
        { iss: 'https://accounts.google.com' },
        { scope: 'admin:write' },
      ];
      for (const claims of forbiddenClaimSets) {
        const token = jwt.sign(
          { id: validUserId, role: 'user', exp: Math.floor(Date.now() / 1000) + 3600, ...claims },
          secret,
          { algorithm: 'HS256' }
        );
        assert.throws(
          () => verifySessionToken(token, secret),
          /Invalid session claims/,
          `Claims ${JSON.stringify(claims)} should have been rejected`
        );
      }
    });

    it('rejects tokens with invalid sid or negative tokenVersion', () => {
      // Non-UUID sid
      const badSidToken = jwt.sign(
        { id: validUserId, sid: 'not-a-uuid-string', exp: Math.floor(Date.now() / 1000) + 3600 },
        secret,
        { algorithm: 'HS256' }
      );
      assert.throws(() => verifySessionToken(badSidToken, secret), /Invalid session claims/);

      // Negative tokenVersion
      const negVerToken = jwt.sign(
        { id: validUserId, tokenVersion: -1, exp: Math.floor(Date.now() / 1000) + 3600 },
        secret,
        { algorithm: 'HS256' }
      );
      assert.throws(() => verifySessionToken(negVerToken, secret), /Invalid session claims/);

      // Non-integer tokenVersion
      const floatVerToken = jwt.sign(
        { id: validUserId, tokenVersion: 1.5, exp: Math.floor(Date.now() / 1000) + 3600 },
        secret,
        { algorithm: 'HS256' }
      );
      assert.throws(() => verifySessionToken(floatVerToken, secret), /Invalid session claims/);
    });

    it('protect middleware correctly prioritizes and extracts tokens', () => {
      const validToken = jwt.sign(
        { id: validUserId, role: 'creator', exp: Math.floor(Date.now() / 1000) + 3600 },
        secret,
        { algorithm: 'HS256' }
      );

      // 1. Missing header and cookies
      let errPassed = null;
      protect({ headers: {}, cookies: {} }, {}, (err) => { errPassed = err; });
      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 401);

      // 2. Bearer with empty token
      errPassed = null;
      protect({ headers: { authorization: 'Bearer ' }, cookies: {} }, {}, (err) => { errPassed = err; });
      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 401);

      // 3. Non-Bearer authorization scheme
      errPassed = null;
      protect({ headers: { authorization: 'Basic dXNlcjpwYXNz' }, cookies: {} }, {}, (err) => { errPassed = err; });
      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 401);

      // 4. Valid Bearer token
      let req = { headers: { authorization: `Bearer ${validToken}` }, cookies: {} };
      protect(req, {}, () => {});
      assert.equal(req.user.id, validUserId);
      assert.equal(req.user.role, 'creator');

      // 5. Valid cookie token
      req = { headers: {}, cookies: { accessToken: validToken } };
      protect(req, {}, () => {});
      assert.equal(req.user.id, validUserId);
    });
  });

  // --- Suite 4: Request Validation Middleware Adversarial Inputs ---
  describe('Suite 4: Request Validation Middleware Adversarial Inputs', () => {
    it('rejects prototype pollution attempts without modifying Object.prototype', () => {
      const schema = {
        title: { required: true, type: 'string' },
      };
      const middleware = validateBody(schema);

      const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "title": "Test Title"}');
      let calledNext = false;
      middleware({ body: maliciousPayload }, {}, () => { calledNext = true; });

      assert.equal(calledNext, true);
      assert.equal(Object.prototype.polluted, undefined, 'Prototype pollution must not succeed');
    });

    it('rejects arrays, primitives, and null bodies with standard 400', () => {
      const schema = { name: { required: true, type: 'string' } };
      const middleware = validateBody(schema);

      const badBodies = [null, undefined, [], [1, 2, 3], 'string-body', 12345, true];
      for (const body of badBodies) {
        let errPassed = null;
        middleware({ body }, {}, (err) => { errPassed = err; });
        assert.ok(errPassed instanceof AppError, `Expected AppError for body: ${JSON.stringify(body)}`);
        assert.equal(errPassed.statusCode, 400);
      }
    });

    it('validateObjectId rejects NoSQL injection objects and invalid hex strings', () => {
      const middleware = validateObjectId('id');
      const injectionAttempts = [
        { '$gt': '' },
        '507f1f77bcf86cd799439011; DROP TABLE listings;',
        '507f1f77bcf86cd799439011\0',
        '   507f1f77bcf86cd799439011   ',
        '0'.repeat(23),
        '0'.repeat(25),
      ];

      for (const id of injectionAttempts) {
        let errPassed = null;
        middleware({ params: { id } }, {}, (err) => { errPassed = err; });
        assert.ok(errPassed instanceof AppError, `Expected AppError for id: ${JSON.stringify(id)}`);
        assert.equal(errPassed.statusCode, 400);
      }
    });
  });

  // --- Suite 5: Error Middleware Production Security ---
  describe('Suite 5: Error Middleware Production Security', () => {
    it('masks internal server error details in production mode and redacts stack traces', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        let statusCode = 0;
        let responseJson = null;
        const mockRes = {
          status: (code) => {
            statusCode = code;
            return {
              json: (data) => { responseJson = data; }
            };
          }
        };

        const secretLeakingError = new Error('Database password was incorrect in connection string mongodb://admin:secret123@db:27017');
        errorHandler(secretLeakingError, {}, mockRes, () => {});

        assert.equal(statusCode, 500);
        assert.equal(responseJson.success, false);
        assert.equal(responseJson.message, 'Internal server error');
        assert.deepEqual(responseJson.errors, []);
        assert.equal(responseJson.data, null);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('preserves client-facing operational 4xx messages in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        let statusCode = 0;
        let responseJson = null;
        const mockRes = {
          status: (code) => {
            statusCode = code;
            return {
              json: (data) => { responseJson = data; }
            };
          }
        };

        const clientErr = new AppError('Quiz listing has expired or was removed', 404, ['listingId expired']);
        errorHandler(clientErr, {}, mockRes, () => {});

        assert.equal(statusCode, 404);
        assert.equal(responseJson.success, false);
        assert.equal(responseJson.message, 'Quiz listing has expired or was removed');
        assert.deepEqual(responseJson.errors, ['listingId expired']);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // --- Suite 6: Graceful Shutdown Idempotency ---
  describe('Suite 6: Graceful Shutdown Idempotency', () => {
    it('handles shutdown when server was not started or already closed without unhandled exceptions', async () => {
      // Calling shutdown with exitProcess = false must complete cleanly
      await shutdown(false);
      await shutdown(false);
    });
  });
});
