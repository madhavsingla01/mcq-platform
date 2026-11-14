import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHealthMonitor, integerSetting, isSocketPath, requestContext } from '../services/api-gateway/dist/runtime.js';
import { SERVICE_PORTS, readServicePort } from '../scripts/service-launch-config.js';

test('health probes share in-flight work, expire, and redact downstream data', async () => {
  let calls = 0;
  let time = 0;
  let healthy = true;
  const check = createHealthMonitor({ auth: 'http://auth', quiz: 'http://quiz' }, {
    now: () => time, ttlMs: 100,
    fetchImpl: async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: healthy, status: healthy ? 200 : 503, json: async () => ({ status: 'healthy', database: 'private', secret: 'hidden' }) };
    },
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => check()));
  assert.equal(calls, 2);
  assert.equal(results[0].healthy, true);
  assert.equal(JSON.stringify(results).includes('private'), false);
  await check();
  assert.equal(calls, 2);
  time = 101;
  healthy = false;
  assert.equal((await check()).healthy, false);
  assert.equal(calls, 4);
});

test('slow dependencies are cancelled and invalid health bodies fail readiness', async () => {
  const check = createHealthMonitor({ slow: 'http://slow', invalid: 'http://invalid' }, {
    timeoutMs: 20,
    fetchImpl: (url, { signal }) => url.includes('slow')
      ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('private detail'))))
      : Promise.resolve({ ok: true, status: 200, json: async () => ({}) }),
  });
  const health = await check();
  assert.equal(health.healthy, false);
  assert.equal(health.services.slow.status, 'unreachable');
  assert.equal(health.services.invalid.status, 'degraded');
  assert.equal(JSON.stringify(health).includes('private detail'), false);
});

test('request IDs and configuration reject unsafe or unbounded values', () => {
  for (const input of ['short', 'contains spaces', 'x'.repeat(65)]) {
    const req = { headers: { 'x-request-id': input } };
    requestContext(req, { setHeader: (key, value) => assert.match(value, /^[\w-]{8,64}$/) }, () => {});
    assert.notEqual(req.requestId, input);
  }
  const req = { headers: { 'x-request-id': 'request-123' } };
  requestContext(req, { setHeader() {} }, () => {});
  assert.equal(req.requestId, 'request-123');
  assert.equal(integerSetting({}, 'TIMEOUT', 100), 100);
  for (const TIMEOUT of ['NaN', '0', '-1', '3.5', '999999']) assert.throws(() => integerSetting({ TIMEOUT }, 'TIMEOUT', 100));
  assert.equal(isSocketPath('/socket.io/?EIO=4'), true);
  assert.equal(isSocketPath('/socket.io-evil'), false);
});

test('gateway proxies bodies/cookies/correlation and distinguishes readiness from liveness', async t => {
  let healthy = true;
  const upstream = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/health') {
      res.statusCode = healthy ? 200 : 503;
      return res.end(JSON.stringify({ status: healthy ? 'healthy' : 'degraded' }));
    }
    if (req.url === '/api/v1/messages/slow') return;
    let body = '';
    for await (const chunk of req) body += chunk;
    res.end(JSON.stringify({ url: req.url, body, requestId: req.headers['x-request-id'], cookie: req.headers.cookie, forwardedFor: req.headers['x-forwarded-for'], spoofedUser: req.headers['x-user-id'] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const reserve = http.createServer().listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  const serviceEnv = Object.fromEntries(['AUTH','QUIZ','PARSER','ATTEMPT','SOCIAL','SOCIAL_FEED','SOCIAL_INTERACTIONS','SOCIAL_COMMENTS','MESSAGE','MEDIA','ADMIN','CHALLENGE','AI_INTEGRATION','MARKETPLACE'].map(name => [`${name}_SERVICE_URL`, upstreamUrl]));
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: fileURLToPath(new URL('../services/api-gateway/', import.meta.url)),
    env: { ...process.env, ...serviceEnv, PORT: String(port), NODE_ENV: 'test', CLIENT_URL: 'http://localhost:5173', HEALTH_CACHE_TTL_MS: '1', PROXY_TIMEOUT_MS: '100' },
    stdio: 'pipe', windowsHide: true,
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  });
  const base = `http://127.0.0.1:${port}`;
  let started = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    try { if ((await fetch(`${base}/api/v1/livez`)).ok) { started = true; break; } } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(started, true, logs);
  assert.equal((await fetch(`${base}/api/v1/readyz`)).status, 200);
  const response = await fetch(`${base}/api/v1/messages/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'trace-1234', cookie: 'session=test', 'x-forwarded-for': '203.0.113.9', 'x-user-id': 'spoofed-admin' }, body: '{"text":"hello"}',
  });
  assert.equal(response.headers.get('x-request-id'), 'trace-1234');
  const echoed = await response.json();
  assert.notEqual(echoed.forwardedFor, '203.0.113.9');
  assert.match(echoed.forwardedFor, /127\.0\.0\.1/);
  assert.equal(echoed.spoofedUser, undefined);
  delete echoed.forwardedFor;
  assert.deepEqual(echoed, { url: '/api/v1/messages/start', body: '{"text":"hello"}', requestId: 'trace-1234', cookie: 'session=test' });
  for (const [path, expectedUrl] of [
    ['/api/v1/social/feed', '/api/v1/social/feed'],
    ['/api/v1/social/quizzes/0123456789abcdef01234567/like', '/api/v1/social/quizzes/0123456789abcdef01234567/like'],
    ['/api/v1/social/quizzes/0123456789abcdef01234567/comments', '/api/v1/social/quizzes/0123456789abcdef01234567/comments'],
    ['/api/v1/notifications/unread-count', '/api/v1/social/notifications/unread-count'],
  ]) {
    const routed = await fetch(`${base}${path}`);
    assert.equal(routed.status, 200);
    assert.equal((await routed.json()).url, expectedUrl);
  }
  for (const probe of ['/api/v1/marketplace/health', '/api/v1/marketplace/ready']) {
    const probeRes = await fetch(`${base}${probe}`);
    assert.equal(probeRes.status, 200);
    assert.equal((await probeRes.json()).url, probe);
  }
  for (const bizPath of ['/api/v1/marketplace', '/api/v1/marketplace/listings', '/api/v1/marketplace/orders']) {
    const bizRes = await fetch(`${base}${bizPath}`);
    assert.equal(bizRes.status, 404);
    const bizBody = await bizRes.json();
    assert.equal(bizBody.success, false);
    assert.equal(bizBody.message, 'Marketplace business routes are not yet implemented in Phase 1');
    assert.equal(bizBody.error.code, 'RESOURCE_NOT_FOUND');
    assert.ok(bizBody.requestId);
  }
  healthy = false;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await fetch(`${base}/api/v1/readyz`)).status, 503);
  assert.equal((await fetch(`${base}/api/v1/livez`)).status, 200);
  const missing = await fetch(`${base}/missing?token=private`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.text()).includes('private'), false);
  const timedOut = await fetch(`${base}/api/v1/messages/slow`);
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).error.code, 'DEPENDENCY_TIMEOUT');
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
  const unavailable = await fetch(`${base}/api/v1/messages/conversations`);
  assert.equal(unavailable.status, 502);
  const failure = await unavailable.json();
  assert.equal(failure.error.code, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(failure.message.includes(upstreamUrl), false);
});

test('marketplace-service launch config registers port 5013 and is isolated at gateway', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert.equal(SERVICE_PORTS['marketplace-service'], 5013);
  const resolvedPort = readServicePort('marketplace-service', root);
  assert.equal(resolvedPort, 5013);
});
