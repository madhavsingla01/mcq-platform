import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.PORT = '5015';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';

const { verifySessionToken, readToken, protect, optionalAuth, restrictTo } = await import(
  '../dist/middleware/auth.middleware.js'
);
const { AppError } = await import('../dist/middleware/error.middleware.js');

const SECRET = process.env.JWT_SECRET;
const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const VALID_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Analytics Service — Auth Middleware & Session Invariants', () => {
  describe('verifySessionToken()', () => {
    it('verifies valid HS256 JWT with full claims', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = jwt.sign(
        {
          id: VALID_OBJECT_ID,
          role: 'creator',
          email: 'creator@example.com',
          exp,
          sid: VALID_SESSION_ID,
          tokenVersion: 2,
        },
        SECRET,
        { algorithm: 'HS256' }
      );

      const claims = verifySessionToken(token, SECRET);
      assert.equal(claims.id, VALID_OBJECT_ID);
      assert.equal(claims.role, 'creator');
      assert.equal(claims.email, 'creator@example.com');
      assert.equal(claims.exp, exp);
      assert.equal(claims.sid, VALID_SESSION_ID);
      assert.equal(claims.tokenVersion, 2);
    });

    it('rejects empty, non-string, or malformed tokens', () => {
      assert.throws(() => verifySessionToken(''), /Invalid session token/);
      assert.throws(() => verifySessionToken(null), /Invalid session token/);
      assert.throws(() => verifySessionToken(undefined), /Invalid session token/);
      assert.throws(() => verifySessionToken(12345), /Invalid session token/);
      assert.throws(() => verifySessionToken('invalid.token.structure'), /jwt malformed|invalid token/i);
    });

    it('rejects algorithm "none" token attacks', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          id: VALID_OBJECT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      assert.throws(() => verifySessionToken(unsignedToken, SECRET));
    });

    it('rejects tokens signed with a different symmetric secret', () => {
      const foreignSecret = 'foreign-key-foreign-key-foreign-key-foreign-key';
      const token = jwt.sign(
        {
          id: VALID_OBJECT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        foreignSecret,
        { algorithm: 'HS256' }
      );

      assert.throws(() => verifySessionToken(token, SECRET));
    });

    it('rejects malformed user ObjectId (must be 24 hex characters)', () => {
      for (const badId of ['short', '12345', '507f1f77bcf86cd79943901z', '507f1f77bcf86cd79943901111']) {
        const token = jwt.sign(
          {
            id: badId,
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          SECRET,
          { algorithm: 'HS256' }
        );
        assert.throws(() => verifySessionToken(token, SECRET), /Invalid session claims/);
      }
    });

    it('rejects prohibited claims (aud, iss, scope)', () => {
      for (const claim of [{ aud: 'some-audience' }, { iss: 'some-issuer' }, { scope: 'read:all' }]) {
        const token = jwt.sign(
          {
            id: VALID_OBJECT_ID,
            exp: Math.floor(Date.now() / 1000) + 3600,
            ...claim,
          },
          SECRET,
          { algorithm: 'HS256' }
        );
        assert.throws(() => verifySessionToken(token, SECRET), /Invalid session claims/);
      }
    });

    it('rejects malformed sid (must be valid UUID format)', () => {
      const token = jwt.sign(
        {
          id: VALID_OBJECT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          sid: 'not-a-valid-uuid',
        },
        SECRET,
        { algorithm: 'HS256' }
      );
      assert.throws(() => verifySessionToken(token, SECRET), /Invalid session claims/);
    });

    it('rejects negative or non-integer tokenVersion', () => {
      for (const badVersion of [-1, 1.5, '1']) {
        const token = jwt.sign(
          {
            id: VALID_OBJECT_ID,
            exp: Math.floor(Date.now() / 1000) + 3600,
            tokenVersion: badVersion,
          },
          SECRET,
          { algorithm: 'HS256' }
        );
        assert.throws(() => verifySessionToken(token, SECRET), /Invalid session claims/);
      }
    });
  });

  describe('readToken()', () => {
    it('extracts token from req.cookies.accessToken', () => {
      const req = { cookies: { accessToken: 'cookie-jwt-token' } };
      assert.equal(readToken(req), 'cookie-jwt-token');
    });

    it('extracts token from req.cookies.token fallback', () => {
      const req = { cookies: { token: 'fallback-cookie-jwt' } };
      assert.equal(readToken(req), 'fallback-cookie-jwt');
    });

    it('extracts token from Authorization: Bearer <token>', () => {
      const req = { headers: { authorization: 'Bearer header-jwt-token' } };
      assert.equal(readToken(req), 'header-jwt-token');
    });

    it('returns undefined if no token is present', () => {
      assert.equal(readToken({}), undefined);
      assert.equal(readToken({ cookies: {} }), undefined);
      assert.equal(readToken({ headers: {} }), undefined);
      assert.equal(readToken({ headers: { authorization: 'Basic dXNlcjpwYXNz' } }), undefined);
    });
  });

  describe('protect middleware', () => {
    it('calls next with 401 when token is missing', (t, done) => {
      const req = {};
      protect(req, {}, (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Not authenticated. Please log in.');
        done();
      });
    });

    it('calls next with 401 when token is invalid or expired', (t, done) => {
      const req = { headers: { authorization: 'Bearer invalid.token' } };
      protect(req, {}, (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Invalid or expired token.');
        done();
      });
    });

    it('attaches req.user and calls next() on valid token', (t, done) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const validToken = jwt.sign(
        {
          id: VALID_OBJECT_ID,
          role: 'creator',
          email: 'creator@example.com',
          exp,
          sid: VALID_SESSION_ID,
          tokenVersion: 1,
        },
        SECRET,
        { algorithm: 'HS256' }
      );

      const req = { headers: { authorization: `Bearer ${validToken}` } };
      protect(req, {}, (err) => {
        assert.equal(err, undefined);
        assert.ok(req.user);
        assert.equal(req.user.id, VALID_OBJECT_ID);
        assert.equal(req.user.userId, VALID_OBJECT_ID);
        assert.equal(req.user.role, 'creator');
        assert.equal(req.user.email, 'creator@example.com');
        assert.equal(req.user.tokenVersion, 1);
        assert.equal(req.authSessionId, VALID_SESSION_ID);
        done();
      });
    });
  });

  describe('optionalAuth middleware', () => {
    it('quietly continues without error and without user when token is missing', (t, done) => {
      const req = {};
      optionalAuth(req, {}, (err) => {
        assert.equal(err, undefined);
        assert.equal(req.user, undefined);
        done();
      });
    });

    it('quietly ignores invalid token on optional route', (t, done) => {
      const req = { headers: { authorization: 'Bearer bad.token' } };
      optionalAuth(req, {}, (err) => {
        assert.equal(err, undefined);
        assert.equal(req.user, undefined);
        done();
      });
    });

    it('attaches user when valid token is present', (t, done) => {
      const token = jwt.sign(
        { id: VALID_OBJECT_ID, role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 },
        SECRET,
        { algorithm: 'HS256' }
      );
      const req = { cookies: { accessToken: token } };
      optionalAuth(req, {}, (err) => {
        assert.equal(err, undefined);
        assert.ok(req.user);
        assert.equal(req.user.id, VALID_OBJECT_ID);
        done();
      });
    });
  });

  describe('restrictTo middleware', () => {
    it('allows access when user role matches', (t, done) => {
      const req = { user: { id: VALID_OBJECT_ID, userId: VALID_OBJECT_ID, role: 'creator' } };
      const middleware = restrictTo('creator', 'admin');
      middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        done();
      });
    });

    it('rejects with 403 when user role does not match', (t, done) => {
      const req = { user: { id: VALID_OBJECT_ID, userId: VALID_OBJECT_ID, role: 'user' } };
      const middleware = restrictTo('creator', 'admin');
      middleware(req, {}, (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /do not have permission/);
        done();
      });
    });
  });
});
