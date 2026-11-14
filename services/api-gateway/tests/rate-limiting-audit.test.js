import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRateLimiter,
  isUploadProcessingRequest,
  resetRateLimitStore,
} from '../src/middleware/rateLimit.js';
import {
  createAuditLogMiddleware,
  recordAuditLog,
  getAuditLogs,
  clearAuditLogs,
  extractUserIdFromAuth,
  resolveAuditEventAction,
} from '../src/middleware/auditLog.js';
import {
  pathTraversalGuard,
  sanitizeFilename,
} from '../src/middleware/security.js';
import { sanitizeProxyRequest, errorCode, errorBody } from '../src/contracts.js';

test('Rate Limiter: enforces max quota and returns standard 429 envelope and headers', () => {
  resetRateLimitStore();
  const limiter = createRateLimiter({
    windowMs: 10000,
    max: 2,
    message: 'Upload rate limit exceeded',
    keyGenerator: () => 'test-client',
  });

  const headers = {};
  let statusCode = 200;
  let responseBody = null;

  const mockRes = () => {
    const resHeaders = {};
    return {
      setHeader: (k, v) => { resHeaders[k] = v; },
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; },
        };
      },
      getHeader: (k) => resHeaders[k],
      headers: resHeaders,
    };
  };

  const req = { ip: '127.0.0.1', requestId: 'req_rl_1', method: 'POST', path: '/api/v1/upload' };

  // Call 1: Success (count = 1, remaining = 1)
  let nextCalled = false;
  const res1 = mockRes();
  limiter(req, res1, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res1.getHeader('RateLimit-Limit'), '2');
  assert.equal(res1.getHeader('RateLimit-Remaining'), '1');
  assert.ok(res1.getHeader('RateLimit-Reset'));

  // Call 2: Success (count = 2, remaining = 0)
  nextCalled = false;
  const res2 = mockRes();
  limiter(req, res2, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res2.getHeader('RateLimit-Remaining'), '0');

  // Call 3: Throttled (429)
  nextCalled = false;
  const res3 = mockRes();
  limiter(req, res3, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 429);
  assert.ok(res3.getHeader('Retry-After'));
  assert.equal(responseBody.success, false);
  assert.equal(responseBody.error.code, 'RATE_LIMITED');
  assert.equal(responseBody.requestId, 'req_rl_1');
});

test('Rate Limiter: predicate accurately filters upload mutating requests', () => {
  assert.equal(isUploadProcessingRequest({ method: 'POST', path: '/api/v1/media/assets/initiate' }), true);
  assert.equal(isUploadProcessingRequest({ method: 'POST', path: '/api/v1/upload' }), true);
  assert.equal(isUploadProcessingRequest({ method: 'POST', path: '/api/v1/parser/jobs' }), true);
  assert.equal(isUploadProcessingRequest({ method: 'GET', path: '/api/v1/media/assets/123/status' }), false);
  assert.equal(isUploadProcessingRequest({ method: 'GET', path: '/api/v1/health' }), false);
  assert.equal(isUploadProcessingRequest({ method: 'GET', path: '/api/v1/livez' }), false);
});

test('Audit Logging: extracts user ID from JWT token without credential leakage', () => {
  const fakePayload = Buffer.from(JSON.stringify({ userId: 'creator_abc_123', role: 'creator' })).toString('base64url');
  const dummyJwt = `eyJhbGciOiJIUzI1NiJ9.${fakePayload}.dummySignature`;

  const reqWithBearer = {
    headers: { authorization: `Bearer ${dummyJwt}` },
  };
  assert.equal(extractUserIdFromAuth(reqWithBearer), 'creator_abc_123');

  const reqAnon = { headers: {} };
  assert.equal(extractUserIdFromAuth(reqAnon), 'anonymous');
});

test('Audit Logging: resolves action and stores structured entry with zero leakage', () => {
  clearAuditLogs();

  const entry = recordAuditLog({
    requestContext: 'req_audit_test_1',
    userId: 'user_1',
    action: 'ASSET_UPLOAD_INITIATED',
    status: 201,
    ip: '127.0.0.1',
    latency: 42,
    assetId: 'asset_777',
  });

  assert.equal(entry.action, 'ASSET_UPLOAD_INITIATED');
  assert.equal(entry.event, 'ASSET_UPLOAD_INITIATED');
  assert.equal(entry.status, 201);
  assert.equal(entry.assetId, 'asset_777');
  assert.ok(entry.timestamp);

  const logs = getAuditLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].requestContext, 'req_audit_test_1');
  assert.equal(logs[0].authorization, undefined);
  assert.equal(logs[0].password, undefined);
});

test('Security Middleware: traps null bytes and control characters', () => {
  let status = null;
  let body = null;
  const mockRes = {
    status: (code) => {
      status = code;
      return { json: (data) => { body = data; } };
    },
  };

  // Traps null byte in url
  let nextCalled = false;
  pathTraversalGuard({ originalUrl: '/api/v1/upload?file=test%00.pdf', requestId: 'req_null_1' }, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');

  // Traps null byte in query param
  status = null;
  body = null;
  nextCalled = false;
  pathTraversalGuard({ originalUrl: '/api/v1/upload', query: { filename: 'test\0.pdf' }, requestId: 'req_null_2' }, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 400);

  // Traps control characters
  status = null;
  body = null;
  nextCalled = false;
  pathTraversalGuard({ originalUrl: '/api/v1/upload\x07', requestId: 'req_ctrl_1' }, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 400);
});

test('Security Middleware: sanitizeFilename sanitizes traversal and strips leading dots', () => {
  assert.equal(sanitizeFilename('../../../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
  assert.equal(sanitizeFilename('...hidden_file.pdf'), 'hidden_file.pdf');
  assert.equal(sanitizeFilename('normal-document.pdf'), 'normal-document.pdf');
  assert.equal(sanitizeFilename('foo/bar/baz.xlsx'), 'baz.xlsx');
});

test('Contracts: sanitizeProxyRequest sanitizes x-filename and retains trusted context', () => {
  const forwarded = new Map();
  const removed = [];
  const proxyReq = {
    setHeader: (k, v) => forwarded.set(k, v),
    removeHeader: (k) => removed.push(k),
  };

  sanitizeProxyRequest(proxyReq, {
    headers: {
      'x-filename': '../../malicious.pdf',
      'x-user-id': 'spoofed',
      'x-role': 'admin',
    },
    requestId: 'req_proxy_test',
    ip: '10.0.0.1',
  });

  assert.equal(forwarded.get('x-filename'), 'malicious.pdf');
  assert.equal(forwarded.get('x-request-id'), 'req_proxy_test');
  assert.equal(forwarded.get('x-forwarded-for'), '10.0.0.1');
  assert.ok(removed.includes('x-user-id'));
  assert.ok(removed.includes('x-role'));
});
