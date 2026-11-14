import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { rateLimit } from '../../services/auth-service/dist/middleware/rateLimit.middleware.js';
import { sanitizeProxyRequest, errorBody } from '../../services/api-gateway/dist/contracts.js';

test('rateLimit middleware decrements remaining quota and rejects over-limit with 429 and RFC headers', async () => {
  const limiter = rateLimit({
    windowMs: 1000,
    max: 5,
    message: 'Rate limit exceeded for testing.',
    keyPrefix: 'test-limit-rfc',
  });

  const server = http.createServer((req, res) => {
    // Adapt native response to middleware expectations
    res.set = (name, value) => res.setHeader(name, value);
    limiter(req, res, (err) => {
      if (err) {
        res.statusCode = err.statusCode || 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(errorBody(res.statusCode, err.message, 'test-trace-id')));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'allowed' }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Send 5 permitted requests within window
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${baseUrl}/test-endpoint`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('ratelimit-limit'), '5');
      assert.equal(res.headers.get('ratelimit-remaining'), String(5 - i));
      assert.ok(res.headers.get('ratelimit-reset'), 'RateLimit-Reset must be present');
      assert.equal(res.headers.get('retry-after'), null, 'Retry-After should not be present when under quota');
      const body = await res.json();
      assert.equal(body.success, true);
    }

    // 2. 6th request: quota exhausted -> HTTP 429 with RFC headers
    const blockedRes = await fetch(`${baseUrl}/test-endpoint`);
    assert.equal(blockedRes.status, 429);
    assert.equal(blockedRes.headers.get('ratelimit-limit'), '5');
    assert.equal(blockedRes.headers.get('ratelimit-remaining'), '0');
    assert.ok(blockedRes.headers.get('ratelimit-reset'));
    assert.ok(blockedRes.headers.get('retry-after'), 'Retry-After must be present on 429 response');
    assert.ok(Number(blockedRes.headers.get('retry-after')) >= 0);

    const errorPayload = await blockedRes.json();
    assert.equal(errorPayload.success, false);
    assert.equal(errorPayload.message, 'Rate limit exceeded for testing.');
    assert.equal(errorPayload.error.code, 'RATE_LIMITED');
  } finally {
    server.close();
  }
});

test('rateLimit quota recovers cleanly after window expiry', async () => {
  const shortLimiter = rateLimit({
    windowMs: 150, // Short 150ms window
    max: 2,
    message: 'Too many requests.',
    keyPrefix: 'test-recovery',
  });

  const server = http.createServer((req, res) => {
    res.set = (name, value) => res.setHeader(name, value);
    shortLimiter(req, res, (err) => {
      if (err) {
        res.statusCode = err.statusCode || 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(errorBody(res.statusCode, err.message, 'test-trace-id')));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1st request -> 200, remaining 1
    const r1 = await fetch(`${baseUrl}/short-endpoint`);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('ratelimit-remaining'), '1');

    // 2nd request -> 200, remaining 0
    const r2 = await fetch(`${baseUrl}/short-endpoint`);
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('ratelimit-remaining'), '0');

    // 3rd request -> 429 blocked
    const r3 = await fetch(`${baseUrl}/short-endpoint`);
    assert.equal(r3.status, 429);

    // Wait for the 150ms window to expire
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 4th request after reset -> 200, quota recovered
    const r4 = await fetch(`${baseUrl}/short-endpoint`);
    assert.equal(r4.status, 200);
    assert.equal(r4.headers.get('ratelimit-remaining'), '1');
  } finally {
    server.close();
  }
});

test('concurrent requests isolate quotas per client identifier / IP', async () => {
  const limiter = rateLimit({
    windowMs: 1000,
    max: 3,
    keyPrefix: 'test-concurrency-isolation',
    keyGenerator: (req) => req.headers['x-client-sim-ip'] || req.socket.remoteAddress,
  });

  const server = http.createServer((req, res) => {
    res.set = (name, value) => res.setHeader(name, value);
    limiter(req, res, (err) => {
      if (err) {
        res.statusCode = err.statusCode || 500;
        res.end(JSON.stringify({ success: false, status: 429 }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, client: req.headers['x-client-sim-ip'] }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Client A sends 3 requests (exhausts its quota)
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/isolated-quota`, { headers: { 'x-client-sim-ip': '198.51.100.1' } });
      assert.equal(res.status, 200);
    }
    const resA = await fetch(`${baseUrl}/isolated-quota`, { headers: { 'x-client-sim-ip': '198.51.100.1' } });
    assert.equal(resA.status, 429, 'Client A must be rate-limited');

    // Client B sends request and still has full quota
    const resB = await fetch(`${baseUrl}/isolated-quota`, { headers: { 'x-client-sim-ip': '198.51.100.2' } });
    assert.equal(resB.status, 200, 'Client B quota must remain independent');
    assert.equal(resB.headers.get('ratelimit-remaining'), '2');
  } finally {
    server.close();
  }
});

test('sanitizeProxyRequest strips client-forged identity headers and enforces socket IP', () => {
  const removedHeaders = [];
  const forwardedHeaders = new Map();

  const fakeProxyReq = {
    removeHeader: (header) => removedHeaders.push(header.toLowerCase()),
    setHeader: (header, value) => forwardedHeaders.set(header.toLowerCase(), value),
  };

  const incomingRequest = {
    headers: {
      'x-user-id': 'attacker-spoofed-id',
      'x-user-role': 'admin',
      'x-auth-claims': '{"admin":true}',
      'x-admin-token': 'privilege-escalation',
      'x-internal-key': 'secret-internal',
      'x-service-auth': 'trusted-microservice',
      'x-role': 'super_admin',
      'x-roles': 'admin,auditor',
      'x-permissions': '*',
      'x-forwarded-user': 'ceo@quizfocus.internal',
      'x-forwarded-email': 'ceo@quizfocus.internal',
      'x-forwarded-for': '203.0.113.195, 10.0.0.1', // Attacker attempting to spoof source IP
      'content-type': 'application/json',
      'authorization': 'Bearer valid.user.token',
      'accept': 'application/json',
    },
    requestId: 'req-uuid-987654',
    ip: '127.0.0.1', // Gateway verified socket IP
  };

  sanitizeProxyRequest(fakeProxyReq, incomingRequest);

  // All spoofed identity headers must be explicitly removed
  const requiredStripped = [
    'x-user-id', 'x-user-role', 'x-auth-claims', 'x-admin-token',
    'x-internal-key', 'x-service-auth', 'x-role', 'x-roles',
    'x-permissions', 'x-forwarded-user', 'x-forwarded-email',
  ];
  for (const header of requiredStripped) {
    assert.ok(removedHeaders.includes(header), `Header ${header} must be stripped`);
  }

  // Trusted x-forwarded-for must be overridden to the verified socket IP, not client payload
  assert.equal(forwardedHeaders.get('x-forwarded-for'), '127.0.0.1');
  assert.equal(forwardedHeaders.get('x-request-id'), 'req-uuid-987654');
});

test('trusted proxy hop resolution algorithm resolves client IP accurately', () => {
  // Model of Express trust proxy hop resolution:
  // When trust proxy is 0 (untrusted): client IP is always socket remote address.
  // When trust proxy is N >= 1: client IP is the address N hops from the right in X-Forwarded-For.
  const resolveClientIp = (socketIp, xForwardedForHeader, trustProxyHops = 0) => {
    if (!trustProxyHops || trustProxyHops <= 0 || !xForwardedForHeader) {
      return socketIp;
    }
    const hops = xForwardedForHeader.split(',').map((h) => h.trim()).filter(Boolean);
    if (!hops.length) return socketIp;
    const targetIndex = hops.length - trustProxyHops;
    return targetIndex >= 0 ? hops[targetIndex] : hops[0];
  };

  const socketIp = '127.0.0.1';
  const spoofedChain = '203.0.113.100, 198.51.100.50';

  // 1. Untrusted gateway (trustProxyHops = 0): ignores client header
  assert.equal(resolveClientIp(socketIp, spoofedChain, 0), '127.0.0.1');

  // 2. Behind 1 trusted proxy hop (e.g. Gateway forwarding to Auth):
  // Takes the last hop before the trusted proxy
  assert.equal(resolveClientIp(socketIp, spoofedChain, 1), '198.51.100.50');

  // 3. Behind 2 trusted proxy hops (e.g. Cloudflare -> Gateway -> Service):
  assert.equal(resolveClientIp(socketIp, spoofedChain, 2), '203.0.113.100');
});
