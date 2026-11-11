/**
 * Adversarial Challenger Test Suite: API Gateway Integration & Isolation
 * Probes route isolation, proxying, error envelopes, and path traversal under /api/v1/marketplace.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('Empirical Adversarial Challenge: Gateway /api/v1/marketplace Routing & Isolation', async (t) => {
  let marketplaceHealthy = true;
  const upstreamRequests = [];

  // Mock upstream simulating microservices
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;

    upstreamRequests.push({
      url: req.url,
      method: req.method,
      headers: { ...req.headers },
      body,
    });

    res.setHeader('content-type', 'application/json');

    // Health aggregator probe check for all services
    if (req.url === '/api/v1/health') {
      res.statusCode = marketplaceHealthy ? 200 : 503;
      return res.end(JSON.stringify({ status: marketplaceHealthy ? 'healthy' : 'degraded' }));
    }

    // Echo back details for inspection
    res.statusCode = 200;
    res.end(JSON.stringify({
      service: 'mock-upstream',
      url: req.url,
      method: req.method,
      body,
      requestId: req.headers['x-request-id'],
      forwardedFor: req.headers['x-forwarded-for'],
      spoofedUser: req.headers['x-user-id'],
      spoofedRole: req.headers['x-role'],
      spoofedInternal: req.headers['x-internal-token'],
    }));
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });

  const upstreamPort = upstream.address().port;
  const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

  // Reserve a free port for the gateway
  const reserve = http.createServer().listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const gatewayPort = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));

  // Configure all service URLs to point to mock upstream
  const serviceNames = [
    'AUTH', 'QUIZ', 'PARSER', 'ATTEMPT', 'SOCIAL', 'SOCIAL_FEED',
    'SOCIAL_INTERACTIONS', 'SOCIAL_COMMENTS', 'MESSAGE', 'MEDIA',
    'ADMIN', 'CHALLENGE', 'MARKETPLACE'
  ];
  const serviceEnv = Object.fromEntries(
    serviceNames.map((name) => [`${name}_SERVICE_URL`, upstreamUrl])
  );

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: fileURLToPath(new URL('../services/api-gateway/', import.meta.url)),
    env: {
      ...process.env,
      ...serviceEnv,
      PORT: String(gatewayPort),
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
      HEALTH_CACHE_TTL_MS: '1',
      PROXY_TIMEOUT_MS: '500',
    },
    stdio: 'pipe',
    windowsHide: true,
  });

  let logs = '';
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  });

  const base = `http://127.0.0.1:${gatewayPort}`;

  // Wait for gateway startup
  let started = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const res = await fetch(`${base}/api/v1/livez`);
      if (res.ok) {
        started = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(started, true, `Gateway failed to start. Logs: ${logs}`);

  // =========================================================================
  // PROBE 1: Health & Readiness Probes Proxying
  // =========================================================================
  await t.test('Probe 1: GET /api/v1/marketplace/health proxies to upstream', async () => {
    const initialUpstreamCount = upstreamRequests.length;
    const res = await fetch(`${base}/api/v1/marketplace/health`, {
      headers: {
        'x-request-id': 'req-health-probe-1',
        'x-user-id': 'attacker',
        'x-role': 'admin',
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, '/api/v1/marketplace/health');
    assert.equal(body.requestId, 'req-health-probe-1');
    assert.match(body.forwardedFor, /127\.0\.0\.1/);
    // Ensure security headers were sanitized
    assert.equal(body.spoofedUser, undefined);
    assert.equal(body.spoofedRole, undefined);
    assert.ok(upstreamRequests.length > initialUpstreamCount);
  });

  await t.test('Probe 2: GET /api/v1/marketplace/ready proxies to upstream', async () => {
    const res = await fetch(`${base}/api/v1/marketplace/ready`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, '/api/v1/marketplace/ready');
  });

  await t.test('Probe 3: GET /api/v1/marketplace/health preserves query parameters', async () => {
    const res = await fetch(`${base}/api/v1/marketplace/health?verbose=1&filter=all`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, '/api/v1/marketplace/health?verbose=1&filter=all');
  });

  // =========================================================================
  // PROBE 2: Business Route Blocking (404 with Standard Error Envelope)
  // =========================================================================
  const businessRoutes = [
    '/api/v1/marketplace',
    '/api/v1/marketplace/',
    '/api/v1/marketplace/listings',
    '/api/v1/marketplace/orders',
    '/api/v1/marketplace/checkout',
    '/api/v1/marketplace/cart',
    '/api/v1/marketplace/random',
    '/api/v1/marketplace/categories',
    '/api/v1/marketplace/products/12345',
    '/api/v1/marketplace/licenses',
    '/api/v1/marketplace/entitlements',
    '/api/v1/marketplace/items/item_01/buy',
  ];

  for (const route of businessRoutes) {
    await t.test(`Probe Business Route: GET ${route} returns HTTP 404 error envelope`, async () => {
      const prevUpstreamReqs = upstreamRequests.length;
      const res = await fetch(`${base}${route}`, {
        headers: { 'x-request-id': `req-biz-${Math.random().toString(36).slice(2, 8)}` },
      });

      assert.equal(res.status, 404, `Route ${route} did not return 404`);
      assert.equal(res.headers.get('content-type')?.includes('application/json'), true);

      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.message, 'Marketplace business routes are not yet implemented in Phase 1');
      assert.equal(json.data, null);
      assert.ok(json.error, 'json.error must exist');
      assert.equal(json.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal(json.error.message, 'Marketplace business routes are not yet implemented in Phase 1');
      assert.match(json.requestId, /^[\w-]{8,64}$/);

      // Verify that this request NEVER touched the upstream proxy
      const newUpstreamReqs = upstreamRequests.slice(prevUpstreamReqs);
      const leakedToUpstream = newUpstreamReqs.some((r) => r.url.includes(route));
      assert.equal(leakedToUpstream, false, `Route ${route} leaked to upstream!`);
    });
  }

  // =========================================================================
  // PROBE 3: HTTP Method Variations on Business Routes
  // =========================================================================
  await t.test('Probe HTTP Methods: POST/PUT/DELETE/PATCH on business routes return 404', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const prevUpstreamCount = upstreamRequests.length;
      const res = await fetch(`${base}/api/v1/marketplace/checkout`, {
        method,
        headers: {
          'content-type': 'application/json',
          'origin': 'http://localhost:5173',
        },
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify({ item: 'test' }) : undefined,
      });

      assert.equal(res.status, 404);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.message, 'Marketplace business routes are not yet implemented in Phase 1');
      assert.equal(json.error.code, 'RESOURCE_NOT_FOUND');

      // Verify no upstream leak
      assert.equal(upstreamRequests.length, prevUpstreamCount);
    }
  });

  // =========================================================================
  // PROBE 4: Lookalike & Boundary Probe Paths
  // =========================================================================
  const lookalikePaths = [
    '/api/v1/marketplace/health/extra',
    '/api/v1/marketplace/ready/nested',
    '/api/v1/marketplace/health.json',
    '/api/v1/marketplace/healthy',
    '/api/v1/marketplace/readiness',
    '/api/v1/marketplace/healthz',
    '/api/v1/marketplace/readyz',
    '/api/v1/marketplace/HEALTH',
    '/api/v1/marketplace/READY',
  ];

  for (const path of lookalikePaths) {
    await t.test(`Probe Lookalike Path: GET ${path} returns HTTP 404 (does NOT proxy)`, async () => {
      const prevUpstreamCount = upstreamRequests.length;
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404);
      const json = await res.json();
      assert.equal(json.message, 'Marketplace business routes are not yet implemented in Phase 1');

      // Must not have proxied to upstream
      const newReqs = upstreamRequests.slice(prevUpstreamCount);
      const proxied = newReqs.some((r) => r.url.includes(path));
      assert.equal(proxied, false, `${path} should not proxy to upstream`);
    });
  }

  // Trailing slash behavior on probes
  await t.test('Probe Trailing Slash: /api/v1/marketplace/health/ vs /health', async () => {
    const res = await fetch(`${base}/api/v1/marketplace/health/`);
    // In Express with strict routing false, req.path is '/health/'
    // Since req.path === '/health' is checked, /health/ returns 404 (route isolation is strict)
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.message, 'Marketplace business routes are not yet implemented in Phase 1');
  });

  // =========================================================================
  // PROBE 5: Path Traversal Probing
  // =========================================================================
  await t.test('Probe Traversal: /api/v1/marketplace/../auth/login resolves via standard routing', async () => {
    const res = await fetch(`${base}/api/v1/marketplace/../auth/login`);
    // Express normalizes path before routing -> /api/v1/auth/login -> routed to AUTH proxy
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, '/api/v1/auth/login');
  });

  await t.test('Probe Traversal: /api/v1/marketplace/%2e%2e/quiz resolves or rejects safely', async () => {
    const res = await fetch(`${base}/api/v1/marketplace/%2e%2e/quiz`);
    // Node/Express decodes %2e%2e to .. and normalizes to /api/v1/quiz/
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.url, /^\/api\/v1\/quiz\/?$/);
  });

  await t.test('Probe Traversal Attempt on /health: /api/v1/marketplace/health/../listings is blocked', async () => {
    // Attempting to use traversal from /health to reach /listings
    const prevUpstreamCount = upstreamRequests.length;
    const res = await fetch(`${base}/api/v1/marketplace/health/../listings`);
    // Express normalizes path to /api/v1/marketplace/listings -> req.path is '/listings'
    // Isolation intercepts it with 404!
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.message, 'Marketplace business routes are not yet implemented in Phase 1');
    assert.equal(upstreamRequests.length, prevUpstreamCount);
  });

  await t.test('Probe Traversal Attempt on /ready: /api/v1/marketplace/ready/../cart is blocked', async () => {
    const prevUpstreamCount = upstreamRequests.length;
    const res = await fetch(`${base}/api/v1/marketplace/ready/../cart`);
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.message, 'Marketplace business routes are not yet implemented in Phase 1');
    assert.equal(upstreamRequests.length, prevUpstreamCount);
  });

  await t.test('Probe Traversal on /ready to /health: /api/v1/marketplace/ready/../health proxies', async () => {
    const res = await fetch(`${base}/api/v1/marketplace/ready/../health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, '/api/v1/marketplace/health');
  });

  // =========================================================================
  // PROBE 6: Upstream Failure Resilience & Route Isolation Independence
  // =========================================================================
  await t.test('Probe Resilience: Business route returns 404 even when upstream is degraded/failing', async () => {
    marketplaceHealthy = false;
    // Health monitor cache TTL is 1ms in test env, wait 10ms for TTL expiry
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Gateway /api/v1/readyz should be 503
    const readyz = await fetch(`${base}/api/v1/readyz`);
    assert.equal(readyz.status, 503);
    const readyzBody = await readyz.json();
    assert.equal(readyzBody.status, 'degraded');
    assert.equal(readyzBody.services.marketplace.status, 'degraded');

    // Business routes still return 404 error envelope immediately without timing out or returning 502/503
    const bizRes = await fetch(`${base}/api/v1/marketplace/orders`);
    assert.equal(bizRes.status, 404);
    const bizBody = await bizRes.json();
    assert.equal(bizBody.message, 'Marketplace business routes are not yet implemented in Phase 1');
    assert.equal(bizBody.error.code, 'RESOURCE_NOT_FOUND');

    // Restore healthy
    marketplaceHealthy = true;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const readyzRestored = await fetch(`${base}/api/v1/readyz`);
    assert.equal(readyzRestored.status, 200);
  });

  // =========================================================================
  // PROBE 7: Downstream Connection Closed Failure
  // =========================================================================
  await t.test('Probe Failure: /health returns 502/504 when upstream closes connection', async () => {
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));

    const healthRes = await fetch(`${base}/api/v1/marketplace/health`);
    assert.equal(healthRes.status, 502);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.error.code, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(healthBody.message, 'Downstream service unavailable');

    // Business routes still return 404, never 502
    const bizRes = await fetch(`${base}/api/v1/marketplace/listings`);
    assert.equal(bizRes.status, 404);
    const bizBody = await bizRes.json();
    assert.equal(bizBody.message, 'Marketplace business routes are not yet implemented in Phase 1');
  });
});
