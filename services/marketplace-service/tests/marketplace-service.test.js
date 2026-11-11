import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.PORT = '5013';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';

const { validateEnv } = await import('../src/config/env.js');
const { app, start, shutdown } = await import('../src/server.js');
const { AppError, catchAsync, errorHandler, notFoundHandler } = await import('../src/middleware/error.middleware.js');
const { validateBody, validateObjectId } = await import('../src/middleware/validation.middleware.js');
const { verifySessionToken, protect, optionalAuth } = await import('../src/middleware/auth.middleware.js');

describe('Marketplace Service — Milestone 3 Test Suite', () => {
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

  // 1. Env Config Validation
  describe('1. Environment Configuration Validation', () => {
    const validConfig = {
      PORT: '5013',
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173,http://localhost:3000',
      JWT_SECRET: 'quizfocus-local-development-secret-minimum-32-bytes-long',
    };

    it('successfully parses valid environment configuration and defaults port to 5013 when omitted', () => {
      const config = validateEnv(validConfig);
      assert.equal(config.PORT, 5013);
      assert.equal(config.NODE_ENV, 'test');
      assert.deepEqual(config.CLIENT_URL, ['http://localhost:5173', 'http://localhost:3000']);
      assert.equal(config.JWT_SECRET, validConfig.JWT_SECRET);
      assert.equal(config.isDev, false);
      assert.equal(config.isProd, false);

      const defaulted = validateEnv({ ...validConfig, PORT: undefined });
      assert.equal(defaulted.PORT, 5013);
    });

    it('rejects invalid or out-of-range ports', () => {
      assert.throws(() => validateEnv({ ...validConfig, PORT: 'abc' }), /PORT must be an integer/);
      assert.throws(() => validateEnv({ ...validConfig, PORT: '0' }), /PORT must be an integer/);
      assert.throws(() => validateEnv({ ...validConfig, PORT: '-5' }), /PORT must be an integer/);
      assert.throws(() => validateEnv({ ...validConfig, PORT: '65536' }), /PORT must be an integer/);
    });

    it('rejects missing NODE_ENV or empty CLIENT_URL', () => {
      assert.throws(() => validateEnv({ ...validConfig, NODE_ENV: '' }), /NODE_ENV is required/);
      assert.throws(() => validateEnv({ ...validConfig, CLIENT_URL: '' }), /CLIENT_URL must contain at least one allowed origin/);
      assert.throws(() => validateEnv({ ...validConfig, CLIENT_URL: '  ,  ' }), /CLIENT_URL must contain at least one allowed origin/);
    });

    it('rejects missing or under-length JWT_SECRET', () => {
      assert.throws(() => validateEnv({ ...validConfig, JWT_SECRET: '' }), /JWT_SECRET is required/);
      assert.throws(() => validateEnv({ ...validConfig, JWT_SECRET: 'short-secret' }), /JWT_SECRET must be at least 32 bytes/);
    });

    it('rejects placeholder JWT_SECRET in production mode while accepting genuine secrets', () => {
      assert.throws(
        () =>
          validateEnv({
            ...validConfig,
            NODE_ENV: 'production',
            JWT_SECRET: 'quizfocus-local-development-secret-minimum-32-bytes-long',
          }),
        /JWT_SECRET must be a configured, non-placeholder secret in production/
      );

      const prodConfig = validateEnv({
        ...validConfig,
        NODE_ENV: 'production',
        JWT_SECRET: 'genuine-prod-high-entropy-random-secret-key-at-least-32-bytes',
      });
      assert.equal(prodConfig.isProd, true);
    });
  });

  // 2. Health and Readiness Probe Responses
  describe('2. Health and Readiness Probes & Route Isolation', () => {
    it('GET /health returns HTTP 200 with healthy service metadata', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.service, 'marketplace-service');
      assert.equal(data.status, 'healthy');
      assert.ok(data.timestamp);
      assert.ok(!isNaN(Date.parse(data.timestamp)));
    });

    it('GET /ready returns HTTP 200 with healthy service metadata', async () => {
      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.service, 'marketplace-service');
      assert.equal(data.status, 'healthy');
      assert.ok(data.timestamp);
    });

    it('GET /api/v1/health returns HTTP 200 with healthy service metadata', async () => {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.service, 'marketplace-service');
      assert.equal(data.status, 'healthy');
    });

    it('GET /api/v1/ready returns HTTP 200 with healthy service metadata', async () => {
      const res = await fetch(`${baseUrl}/api/v1/ready`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.service, 'marketplace-service');
      assert.equal(data.status, 'healthy');
    });

    it('GET /api/v1/marketplace/health and /api/v1/marketplace/ready return HTTP 200', async () => {
      const healthRes = await fetch(`${baseUrl}/api/v1/marketplace/health`);
      assert.equal(healthRes.status, 200);
      const healthData = await healthRes.json();
      assert.equal(healthData.service, 'marketplace-service');
      assert.equal(healthData.status, 'healthy');

      const readyRes = await fetch(`${baseUrl}/api/v1/marketplace/ready`);
      assert.equal(readyRes.status, 200);
      const readyData = await readyRes.json();
      assert.equal(readyData.service, 'marketplace-service');
      assert.equal(readyData.status, 'healthy');
    });

    it('GET /api/v1/marketplace/listings returns HTTP 404 for unmounted Phase 2 routes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/marketplace/listings`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Marketplace business routes are not yet implemented in Phase 1');
      assert.equal(data.data, null);
      assert.deepEqual(data.errors, []);
    });

    it('GET /unknown-random-route returns HTTP 404 via notFoundHandler', async () => {
      const res = await fetch(`${baseUrl}/unknown-random-route`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Route not found');
      assert.equal(data.data, null);
      assert.deepEqual(data.errors, []);
    });
  });

  // 3. Error Handling Middleware
  describe('3. Error Handling Middleware', () => {
    it('creates AppError with operational metadata and status code', () => {
      const appErr = new AppError('Resource not found', 404, ['id missing']);
      assert.equal(appErr.message, 'Resource not found');
      assert.equal(appErr.statusCode, 404);
      assert.equal(appErr.status, 'fail');
      assert.equal(appErr.isOperational, true);
      assert.deepEqual(appErr.errors, ['id missing']);

      const serverErr = new AppError('Server boom', 500);
      assert.equal(serverErr.status, 'error');
    });

    it('catchAsync captures asynchronous rejections and passes to next()', async () => {
      let passedError = null;
      const asyncRoute = catchAsync(async () => {
        throw new Error('Async failure');
      });

      await asyncRoute({}, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError);
      assert.equal(passedError.message, 'Async failure');
    });

    it('errorHandler formats operational AppError into standard response payload', () => {
      let statusCode = 0;
      let responsePayload = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (payload) => {
              responsePayload = payload;
            },
          };
        },
      };

      const err = new AppError('Invalid credentials', 401, ['Wrong password']);
      errorHandler(err, {}, mockRes, () => {});

      assert.equal(statusCode, 401);
      assert.equal(responsePayload.success, false);
      assert.equal(responsePayload.message, 'Invalid credentials');
      assert.equal(responsePayload.data, null);
      assert.deepEqual(responsePayload.errors, ['Wrong password']);
    });

    it('errorHandler handles uncaught generic 500 errors', () => {
      let statusCode = 0;
      let responsePayload = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (payload) => {
              responsePayload = payload;
            },
          };
        },
      };

      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const err = new Error('Database crash dump details');
        errorHandler(err, {}, mockRes, () => {});

        assert.equal(statusCode, 500);
        assert.equal(responsePayload.success, false);
        assert.equal(responsePayload.message, 'Internal server error');
        assert.equal(responsePayload.data, null);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('errorHandler converts JsonWebTokenError and TokenExpiredError to 401 AppErrors', () => {
      let statusCode = 0;
      let responsePayload = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (payload) => {
              responsePayload = payload;
            },
          };
        },
      };

      const jwtErr = new Error('invalid signature');
      jwtErr.name = 'JsonWebTokenError';
      errorHandler(jwtErr, {}, mockRes, () => {});
      assert.equal(statusCode, 401);
      assert.equal(responsePayload.message, 'Invalid token');

      const expiredErr = new Error('jwt expired');
      expiredErr.name = 'TokenExpiredError';
      errorHandler(expiredErr, {}, mockRes, () => {});
      assert.equal(statusCode, 401);
      assert.equal(responsePayload.message, 'Token expired');
    });

    it('notFoundHandler returns standardized 404 response payload', () => {
      let statusCode = 0;
      let responsePayload = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (payload) => {
              responsePayload = payload;
            },
          };
        },
      };

      notFoundHandler({}, mockRes, () => {});
      assert.equal(statusCode, 404);
      assert.equal(responsePayload.success, false);
      assert.equal(responsePayload.message, 'Route not found');
      assert.equal(responsePayload.data, null);
      assert.deepEqual(responsePayload.errors, []);
    });
  });

  // 4. Validation Middleware
  describe('4. Validation Middleware', () => {
    it('validateBody passes when payload conforms to schema', () => {
      const middleware = validateBody({
        title: { required: true, type: 'string', min: 3, max: 50 },
        price: { required: true, type: 'number' },
        email: { required: false, type: 'string', email: true },
      });

      const req = {
        body: {
          title: 'Advanced Calculus Quiz Pack',
          price: 29.99,
          email: 'seller@example.com',
        },
      };

      let calledNext = false;
      let errPassed = null;
      middleware(req, {}, (err) => {
        calledNext = true;
        errPassed = err;
      });

      assert.equal(calledNext, true);
      assert.equal(errPassed, undefined);
    });

    it('validateBody collects all rule violations and yields AppError 400', () => {
      const middleware = validateBody({
        title: { required: true, type: 'string', min: 5, max: 20 },
        price: { required: true, type: 'number' },
        contact: { required: true, type: 'string', email: true },
        code: { required: true, type: 'string', pattern: /^[A-Z]{3}-\d{3}$/ },
      });

      const req = {
        body: {
          title: 'Hi', // too short (<5)
          price: 'free', // not a number
          contact: 'not-an-email', // invalid email
          code: 'bad-code', // pattern mismatch
        },
      };

      let errPassed = null;
      middleware(req, {}, (err) => {
        errPassed = err;
      });

      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 400);
      assert.equal(errPassed.errors.length, 4);
      assert.ok(errPassed.errors.some((e) => e.includes('title must be at least 5 characters')));
      assert.ok(errPassed.errors.some((e) => e.includes('price must be of type number')));
      assert.ok(errPassed.errors.some((e) => e.includes('contact must be a valid email address')));
      assert.ok(errPassed.errors.some((e) => e.includes('code format is invalid')));
    });

    it('validateBody rejects missing or non-object request body', () => {
      const middleware = validateBody({ title: { required: true, type: 'string' } });

      let errPassed = null;
      middleware({ body: null }, {}, (err) => {
        errPassed = err;
      });
      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 400);

      middleware({ body: ['not', 'an', 'object'] }, {}, (err) => {
        errPassed = err;
      });
      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 400);
    });

    it('validateObjectId accepts valid 24-char hex MongoDB ObjectIds', () => {
      const middleware = validateObjectId('quizId');
      const req = { params: { quizId: '507f1f77bcf86cd799439011' } };

      let calledNext = false;
      let errPassed = null;
      middleware(req, {}, (err) => {
        calledNext = true;
        errPassed = err;
      });

      assert.equal(calledNext, true);
      assert.equal(errPassed, undefined);
    });

    it('validateObjectId rejects malformed, too short, or non-hex identifiers', () => {
      const middleware = validateObjectId('id');

      const invalidIds = ['123', 'not-an-id', '507f1f77bcf86cd79943901z', '507f1f77bcf86cd799439011-extra'];
      for (const badId of invalidIds) {
        let errPassed = null;
        middleware({ params: { id: badId } }, {}, (err) => {
          errPassed = err;
        });
        assert.ok(errPassed instanceof AppError, `Expected AppError for ${badId}`);
        assert.equal(errPassed.statusCode, 400);
      }
    });
  });

  // 5. Auth Middleware
  describe('5. Authentication Integration Foundation', () => {
    const validUserId = '507f1f77bcf86cd799439011';
    const validSid = 'c4b1e5a2-97b4-4b51-8935-86f7b3a01942';

    const createToken = (payload = {}, secret = process.env.JWT_SECRET, options = {}) => {
      return jwt.sign(
        {
          id: validUserId,
          role: 'seller',
          sid: validSid,
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
    };

    it('verifySessionToken decodes valid HS256 tokens matching QuizFocus claims specification', () => {
      const token = createToken();
      const claims = verifySessionToken(token, process.env.JWT_SECRET);
      assert.equal(claims.id, validUserId);
      assert.equal(claims.role, 'seller');
      assert.equal(claims.sid, validSid);
      assert.equal(claims.tokenVersion, 1);
    });

    it('verifySessionToken rejects tokens with invalid signature, expired exp, or prohibited claims', () => {
      const tokenWrongSecret = createToken({}, 'wrong-secret-with-at-least-32-bytes-length');
      assert.throws(() => verifySessionToken(tokenWrongSecret, process.env.JWT_SECRET));

      const expiredToken = createToken({}, process.env.JWT_SECRET, { expiresIn: -10 });
      assert.throws(() => verifySessionToken(expiredToken, process.env.JWT_SECRET));

      // Token with invalid user ID format
      const badIdToken = createToken({ id: 'bad-id' });
      assert.throws(() => verifySessionToken(badIdToken, process.env.JWT_SECRET), /Invalid session claims/);

      // Token with prohibited audience claim
      const audToken = createToken({ aud: 'quizfocus-client' });
      assert.throws(() => verifySessionToken(audToken, process.env.JWT_SECRET), /Invalid session claims/);
    });

    it('protect rejects unauthenticated requests with HTTP 401', () => {
      const req = { cookies: {}, headers: {} };
      let errPassed = null;
      protect(req, {}, (err) => {
        errPassed = err;
      });

      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 401);
      assert.equal(errPassed.message, 'Not authenticated. Please log in.');
    });

    it('protect rejects invalid or tampered tokens with HTTP 401', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Bearer completely-invalid-jwt-token' },
      };
      let errPassed = null;
      protect(req, {}, (err) => {
        errPassed = err;
      });

      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 401);
      assert.equal(errPassed.message, 'Invalid or expired token.');
    });

    it('protect accepts valid Bearer authorization header and attaches user context', () => {
      const token = createToken({ email: 'seller@quizfocus.com' });
      const req = {
        cookies: {},
        headers: { authorization: `Bearer ${token}` },
      };

      let calledNext = false;
      let errPassed = null;
      protect(req, {}, (err) => {
        calledNext = true;
        errPassed = err;
      });

      assert.equal(calledNext, true);
      assert.equal(errPassed, undefined);
      assert.ok(req.user);
      assert.equal(req.user.id, validUserId);
      assert.equal(req.user.role, 'seller');
      assert.equal(req.user.email, 'seller@quizfocus.com');
      assert.equal(req.authSessionId, validSid);
    });

    it('protect accepts valid accessToken cookie and attaches user context', () => {
      const token = createToken();
      const req = {
        cookies: { accessToken: token },
        headers: {},
      };

      let calledNext = false;
      let errPassed = null;
      protect(req, {}, (err) => {
        calledNext = true;
        errPassed = err;
      });

      assert.equal(calledNext, true);
      assert.equal(errPassed, undefined);
      assert.equal(req.user.id, validUserId);
      assert.equal(req.authSessionId, validSid);
    });

    it('optionalAuth attaches user context when token is present and valid', () => {
      const token = createToken();
      const req = {
        cookies: { accessToken: token },
        headers: {},
      };

      let calledNext = false;
      optionalAuth(req, {}, () => {
        calledNext = true;
      });

      assert.equal(calledNext, true);
      assert.ok(req.user);
      assert.equal(req.user.id, validUserId);
    });

    it('optionalAuth allows guest requests through when token is missing or invalid', () => {
      const guestReq = { cookies: {}, headers: {} };
      let guestCalled = false;
      optionalAuth(guestReq, {}, () => {
        guestCalled = true;
      });
      assert.equal(guestCalled, true);
      assert.equal(guestReq.user, undefined);

      const invalidTokenReq = {
        cookies: {},
        headers: { authorization: 'Bearer bad-token' },
      };
      let invalidCalled = false;
      optionalAuth(invalidTokenReq, {}, () => {
        invalidCalled = true;
      });
      assert.equal(invalidCalled, true);
      assert.equal(invalidTokenReq.user, undefined);
    });
  });

  // 6. Graceful Shutdown
  describe('6. Graceful Shutdown Lifecycle', () => {
    it('start binds to port and shutdown drains HTTP connections cleanly', async () => {
      const instance = await start(0);
      assert.ok(instance.listening);
      const addr = instance.address();
      assert.ok(addr.port > 0);

      // Verify server responds
      const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
      assert.equal(res.status, 200);

      // Perform shutdown without terminating the test process
      await shutdown(false);
      assert.equal(instance.listening, false);

      // Subsequent shutdown calls should safely return without throwing
      await shutdown(false);
    });
  });
});
