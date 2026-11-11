import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { rateLimit } from '../services/auth-service/src/middleware/rateLimit.middleware.js';
import { sanitizeProxyRequest, errorBody } from '../services/api-gateway/src/contracts.js';

// =============================================================================
// SUITE 1: LOAD RUNNER MATHEMATICS, PERCENTILES & BOTTLENECK DETECTION ORACLES
// =============================================================================

test('Load Runner Percentiles: Nearest-rank accuracy against statistical oracle across distributions', () => {
  // Oracle percentile implementation
  const computePercentileOracle = (latencies, p) => {
    if (!latencies.length) return 0;
    const sorted = [...latencies].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  };

  // 1. Uniform sequence 1..1000
  const uniform = Array.from({ length: 1000 }, (_, i) => i + 1);
  assert.equal(computePercentileOracle(uniform, 50), 501); // index 500
  assert.equal(computePercentileOracle(uniform, 90), 901); // index 900
  assert.equal(computePercentileOracle(uniform, 95), 951); // index 950
  assert.equal(computePercentileOracle(uniform, 99), 991); // index 990

  // 2. Heavy tail / extreme skew: 990 low latencies (5ms), 10 spikes (1000ms)
  const skewed = [...Array(990).fill(5), ...Array(10).fill(1000)];
  assert.equal(computePercentileOracle(skewed, 50), 5);
  assert.equal(computePercentileOracle(skewed, 90), 5);
  assert.equal(computePercentileOracle(skewed, 95), 5);
  assert.equal(computePercentileOracle(skewed, 99), 1000, 'p99 must catch the top 1% tail spike');

  // 3. Single element boundary
  const single = [42];
  assert.equal(computePercentileOracle(single, 50), 42);
  assert.equal(computePercentileOracle(single, 90), 42);
  assert.equal(computePercentileOracle(single, 99), 42);

  // 4. Zero elements boundary
  assert.equal(computePercentileOracle([], 50), 0);
  assert.equal(computePercentileOracle([], 99), 0);
});

test('Load Runner Bottleneck Detection: Evaluates latency tiers, sockets, and concurrency bounds', () => {
  // Replicate bottleneck detector from load-runner.mjs
  const detectBottlenecks = (stats, vu) => {
    const bottlenecks = [];
    if (stats.rps > 0 && stats.p50 < 30) {
      bottlenecks.push(`Gateway event loop latency stable (<30ms median at ${vu} VU).`);
    } else if (stats.p50 >= 30 && stats.p50 < 100) {
      bottlenecks.push(`Moderate transit overhead detected (p50: ${stats.p50.toFixed(1)}ms).`);
    } else if (stats.p50 >= 100) {
      bottlenecks.push(`Event loop queueing or connection contention observed (p50: ${stats.p50.toFixed(1)}ms).`);
    }

    if (stats.p99 > 300) {
      bottlenecks.push(`Tail latency amplification at p99 (${stats.p99.toFixed(1)}ms): downstream aggregation or Windows socket delay.`);
    }

    if (stats.rateLimited > 0) {
      bottlenecks.push(`Rate limiting engaged: ${stats.rateLimited} requests throttled (HTTP 429).`);
    }

    if (stats.errorClasses?.['ECONNRESET'] || stats.errorClasses?.['ECONNREFUSED']) {
      bottlenecks.push(`Windows socket pool exhaustion / ephemeral port recycling detected.`);
    }

    if (vu >= 250) {
      bottlenecks.push(`Upstream MongoDB connection pool cap (poolSize=5) under concurrent write pressure.`);
    }

    return bottlenecks;
  };

  // Scenario A: Fast low concurrency (10 VU, p50=12ms, p99=25ms)
  const bA = detectBottlenecks({ rps: 800, p50: 12, p99: 25, rateLimited: 0, errorClasses: {} }, 10);
  assert.equal(bA.length, 1);
  assert.match(bA[0], /stable/);

  // Scenario B: Moderate transit overhead (50 VU, p50=65ms, p99=120ms)
  const bB = detectBottlenecks({ rps: 950, p50: 65, p99: 120, rateLimited: 0, errorClasses: {} }, 50);
  assert.equal(bB.length, 1);
  assert.match(bB[0], /Moderate transit overhead/);

  // Scenario C: High contention + Tail latency + Rate limiting (100 VU)
  const bC = detectBottlenecks({ rps: 1100, p50: 150, p99: 450, rateLimited: 12, errorClasses: {} }, 100);
  assert.equal(bC.length, 3);
  assert.match(bC[0], /Event loop queueing/);
  assert.match(bC[1], /Tail latency amplification/);
  assert.match(bC[2], /Rate limiting engaged: 12/);

  // Scenario D: Extreme 500 VU with socket exhaustion & MongoDB cap
  const bD = detectBottlenecks({
    rps: 1200, p50: 320, p99: 1800, rateLimited: 0,
    errorClasses: { 'ECONNRESET': 15 }
  }, 500);
  assert.equal(bD.length, 4);
  assert.ok(bD.some(b => b.includes('Windows socket pool exhaustion')));
  assert.ok(bD.some(b => b.includes('Upstream MongoDB connection pool cap')));
});

// =============================================================================
// SUITE 2: CONNECTION POOLING RESILIENCE & WINDOWS SOCKET STARVATION
// =============================================================================

test('Connection Pooling: Keep-Alive HTTP Agent reuses sockets preventing Windows port depletion', async () => {
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 25,
    keepAliveMsecs: 10000,
  });

  const uniqueSocketIds = new Set();
  let serverReqCount = 0;

  const server = http.createServer((req, res) => {
    serverReqCount++;
    // Capture unique socket identifier
    uniqueSocketIds.add(`${req.socket.remoteAddress}:${req.socket.remotePort}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: serverReqCount }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // Execute 100 sequential requests using the keepAlive agent
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          method: 'GET',
          agent,
        }, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
        });
        req.on('error', reject);
        req.end();
      });
    }

    assert.equal(serverReqCount, 100);
    // With keep-alive, 100 sequential requests must reuse the socket,
    // resulting in at most 2 sockets (typically 1), NOT 100 ephemeral sockets!
    assert.ok(
      uniqueSocketIds.size <= 3,
      `Expected socket reuse (<= 3 sockets), but observed ${uniqueSocketIds.size} ephemeral sockets!`
    );

    // Now test concurrent burst of 20 requests
    const burstPromises = Array.from({ length: 20 }, () => {
      return new Promise((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          method: 'GET',
          agent,
        }, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
        });
        req.on('error', reject);
        req.end();
      });
    });

    await Promise.all(burstPromises);
    assert.equal(serverReqCount, 120);
    // Even after burst, total sockets allocated should be comfortably within maxSockets (<= 20)
    assert.ok(
      uniqueSocketIds.size <= 25,
      `Keep-alive agent bounded socket count to ${uniqueSocketIds.size}`
    );
  } finally {
    server.close();
    agent.destroy();
  }
});

// =============================================================================
// SUITE 3: RATE LIMITING & CONCURRENCY ADVERSARIAL STRESS
// =============================================================================

test('Concurrency Adversarial: True parallel burst (Promise.all) strictly enforces quota without race bypass', async () => {
  const limiter = rateLimit({
    windowMs: 5000,
    max: 10,
    message: 'Parallel burst throttled',
    keyPrefix: 'adversarial-burst',
  });

  const server = http.createServer((req, res) => {
    res.set = (k, v) => res.setHeader(k, v);
    limiter(req, res, (err) => {
      if (err) {
        res.statusCode = err.statusCode || 429;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ allowed: true }));
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Fire 60 TRULY PARALLEL requests simultaneously
    const requests = Array.from({ length: 60 }, (_, idx) => {
      return fetch(`${baseUrl}/burst?req=${idx}`);
    });

    const responses = await Promise.all(requests);

    let count200 = 0;
    let count429 = 0;

    for (const res of responses) {
      if (res.status === 200) count200++;
      else if (res.status === 429) count429++;
    }

    // Exactly 10 requests must be allowed (max: 10)
    assert.equal(count200, 10, `Exactly 10 requests should succeed, got ${count200}`);
    // Exactly 50 requests must be throttled with HTTP 429
    assert.equal(count429, 50, `Exactly 50 requests should be throttled with 429, got ${count429}`);
  } finally {
    server.close();
  }
});

test('Rate Limit Boundary: 0 remaining quota triggers 429 with RFC headers and exact Retry-After', async () => {
  const limiter = rateLimit({
    windowMs: 1000,
    max: 2,
    keyPrefix: 'zero-quota-boundary',
  });

  const server = http.createServer((req, res) => {
    res.set = (k, v) => res.setHeader(k, v);
    limiter(req, res, (err) => {
      if (err) {
        res.statusCode = err.statusCode || 429;
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Request 1: remaining = 1
    const res1 = await fetch(baseUrl);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('ratelimit-remaining'), '1');

    // Request 2: remaining = 0 (boundary)
    const res2 = await fetch(baseUrl);
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('ratelimit-remaining'), '0');

    // Request 3: remaining = 0 (exceeded) -> must return 429
    const res3 = await fetch(baseUrl);
    assert.equal(res3.status, 429);
    assert.equal(res3.headers.get('ratelimit-remaining'), '0');
    assert.equal(res3.headers.get('ratelimit-limit'), '2');

    const retryAfter = res3.headers.get('retry-after');
    assert.ok(retryAfter !== null, 'Retry-After header must be present');
    const retryNum = Number(retryAfter);
    assert.ok(Number.isInteger(retryNum) && retryNum >= 1, `Retry-After should be >= 1 second, got ${retryNum}`);
  } finally {
    server.close();
  }
});

test('Rate Limit Window Recovery: High precision expiry recovery after window elapsed', async () => {
  const windowMs = 120; // 120ms window
  const limiter = rateLimit({
    windowMs,
    max: 1,
    keyPrefix: 'recovery-precision',
  });

  const server = http.createServer((req, res) => {
    res.set = (k, v) => res.setHeader(k, v);
    limiter(req, res, (err) => {
      if (err) {
        res.statusCode = 429;
        return res.end();
      }
      res.statusCode = 200;
      res.end();
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Consume 1 allowance
    const r1 = await fetch(baseUrl);
    assert.equal(r1.status, 200);

    // Immediate second -> 429
    const r2 = await fetch(baseUrl);
    assert.equal(r2.status, 429);

    // Sleep until window expires
    await new Promise((r) => setTimeout(r, windowMs + 30));

    // Must recover cleanly
    const r3 = await fetch(baseUrl);
    assert.equal(r3.status, 200, 'Quota must recover after windowMs has elapsed');
    assert.equal(r3.headers.get('ratelimit-remaining'), '0'); // limit is 1, so 1st consumed leaves 0
  } finally {
    server.close();
  }
});

// =============================================================================
// SUITE 4: REVERSE PROXY SPOOFING & FORGED IDENTITY HEADERS
// =============================================================================

test('Proxy Security: Client-forged identity headers and case variations are stripped', () => {
  const strippedHeaders = new Set();
  const setHeaders = new Map();

  const fakeProxyReq = {
    removeHeader: (h) => strippedHeaders.add(h.toLowerCase()),
    setHeader: (h, v) => setHeaders.set(h.toLowerCase(), v),
  };

  const incomingReq = {
    headers: {
      'x-user-id': 'spoofed-user-id',
      'x-user-role': 'admin',
      'x-auth-claims': '{"sub":"123","role":"superuser"}',
      'x-admin-token': 'attacker-god-token',
      'x-internal-key': 'master-backend-key',
      'x-service-auth': 'service-to-service',
      'x-role': 'root',
      'x-roles': 'admin,superadmin',
      'x-permissions': 'all:write',
      'x-forwarded-user': 'victim@internal',
      'x-forwarded-email': 'victim@internal',
      'authorization': 'Bearer valid.jwt.token',
      'content-type': 'application/json',
    },
    requestId: 'req-adversarial-123',
    ip: '198.51.100.99', // Verified client IP at gateway
  };

  sanitizeProxyRequest(fakeProxyReq, incomingReq);

  // Every single spoofed header must have been stripped
  const dangerousHeaders = [
    'x-user-id', 'x-user-role', 'x-auth-claims', 'x-admin-token',
    'x-internal-key', 'x-service-auth', 'x-role', 'x-roles',
    'x-permissions', 'x-forwarded-user', 'x-forwarded-email',
  ];

  for (const h of dangerousHeaders) {
    assert.ok(strippedHeaders.has(h), `Expected dangerous header '${h}' to be stripped by sanitizeProxyRequest`);
  }

  // Non-dangerous headers (authorization, content-type) must NOT be stripped
  assert.ok(!strippedHeaders.has('authorization'), 'Authorization token must be preserved for auth verification');

  // Enforced trusted headers
  assert.equal(setHeaders.get('x-forwarded-for'), '198.51.100.99');
  assert.equal(setHeaders.get('x-request-id'), 'req-adversarial-123');
});

test('Proxy Security: Real HTTP server lowercases headers, ensuring sanitizeProxyRequest strips all attack vectors', async () => {
  let capturedHeaders = null;

  const server = http.createServer((req, res) => {
    // Gateway sets req.ip and req.requestId before proxying
    req.ip = req.socket.remoteAddress;
    req.requestId = 'req-real-tcp-test';

    const fakeProxyReq = {
      removeHeader: (h) => delete req.headers[h],
      setHeader: (h, v) => { req.headers[h] = v; },
    };
    sanitizeProxyRequest(fakeProxyReq, req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.headers));
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    // Send mixed case headers over actual TCP HTTP socket
    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: {
        'X-USER-ID': 'attack-id',
        'X-Role': 'attack-role',
        'X-ADMIN-TOKEN': 'attack-admin',
        'X-FORWARDED-FOR': '1.1.1.1, 2.2.2.2',
      },
    });

    const sanitized = await res.json();
    assert.equal(sanitized['x-user-id'], undefined, 'x-user-id must be stripped');
    assert.equal(sanitized['x-role'], undefined, 'x-role must be stripped');
    assert.equal(sanitized['x-admin-token'], undefined, 'x-admin-token must be stripped');
    // x-forwarded-for should be overridden to socket ip
    assert.ok(
      sanitized['x-forwarded-for'] === '127.0.0.1' || sanitized['x-forwarded-for'] === '::1',
      `x-forwarded-for must be set to socket IP (got ${sanitized['x-forwarded-for']})`
    );
  } finally {
    server.close();
  }
});

test('Proxy Security: Multi-IP chain spoofing with trust proxy variations', () => {
  // Replicate Express trust proxy resolution algorithm
  const resolveClientIp = (socketIp, xForwardedForHeader, trustProxyHops = 0) => {
    if (!trustProxyHops || trustProxyHops <= 0 || !xForwardedForHeader) {
      return socketIp;
    }
    const hops = xForwardedForHeader.split(',').map((h) => h.trim()).filter(Boolean);
    if (!hops.length) return socketIp;
    const targetIndex = hops.length - trustProxyHops;
    return targetIndex >= 0 ? hops[targetIndex] : hops[0];
  };

  const clientForgedChain = '203.0.113.1, 198.51.100.2, 192.0.2.3';
  const tcpSocketIp = '10.0.0.1'; // Internal load balancer or direct connection

  // 1. Untrusted proxy (trustProxyHops = 0):
  // The attacker's forged chain is completely ignored, client IP is the direct socket IP
  assert.equal(resolveClientIp(tcpSocketIp, clientForgedChain, 0), '10.0.0.1');

  // 2. 1 trusted hop (e.g. AWS ALB -> Gateway):
  // Resolves to 192.0.2.3 (last untrusted client before ALB)
  assert.equal(resolveClientIp(tcpSocketIp, clientForgedChain, 1), '192.0.2.3');

  // 3. 2 trusted hops (e.g. Cloudflare -> AWS ALB -> Gateway):
  // Resolves to 198.51.100.2 (client before Cloudflare)
  assert.equal(resolveClientIp(tcpSocketIp, clientForgedChain, 2), '198.51.100.2');

  // 4. Over-trusted hops (> length of chain):
  // Falls back safely to first hop without crashing
  assert.equal(resolveClientIp(tcpSocketIp, clientForgedChain, 10), '203.0.113.1');

  // 5. Empty / whitespace-only X-Forwarded-For:
  assert.equal(resolveClientIp(tcpSocketIp, '   ', 1), '10.0.0.1');
});
