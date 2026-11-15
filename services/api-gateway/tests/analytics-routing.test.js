import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';

async function availablePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

test('Analytics routes proxy through the gateway with authorization, cookies, and request context', async () => {
  let upstreamRequest;
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    upstreamRequest = {
      url: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      requestId: req.headers['x-request-id'],
      forwardedFor: req.headers['x-forwarded-for'],
      spoofedUser: req.headers['x-user-id'],
      spoofedRole: req.headers['x-role'],
      body,
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'analytics-service', success: true }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== 'string');

  const previousEnvironment = new Map(
    [
      'NODE_ENV',
      'PORT',
      'CLIENT_URL',
      'AUTH_SERVICE_URL',
      'QUIZ_SERVICE_URL',
      'PARSER_SERVICE_URL',
      'ATTEMPT_SERVICE_URL',
      'SOCIAL_SERVICE_URL',
      'SOCIAL_FEED_SERVICE_URL',
      'SOCIAL_INTERACTIONS_SERVICE_URL',
      'SOCIAL_COMMENTS_SERVICE_URL',
      'MESSAGE_SERVICE_URL',
      'MEDIA_SERVICE_URL',
      'ADMIN_SERVICE_URL',
      'CHALLENGE_SERVICE_URL',
      'MARKETPLACE_SERVICE_URL',
      'AI_INTEGRATION_SERVICE_URL',
      'ANALYTICS_SERVICE_URL',
    ].map((key) => [key, process.env[key]])
  );
  const gatewayPort = await availablePort();
  const target = `http://127.0.0.1:${upstreamAddress.port}`;
  for (const key of previousEnvironment.keys()) {
    if (key.endsWith('_SERVICE_URL')) process.env[key] = target;
  }
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(gatewayPort);
  process.env.CLIENT_URL = 'http://localhost:5173';

  let gateway;
  try {
    ({ server: gateway } = await import('../dist/server.js?analytics-routing-test'));
    if (!gateway.listening) await once(gateway, 'listening');

    // 1. Test GET /api/v1/analytics/health
    const healthResponse = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/analytics/health`, {
      headers: {
        authorization: 'Bearer gateway-test-analytics-token',
        cookie: 'accessToken=jwt-test-cookie',
        'x-user-id': 'spoofed-attacker-id',
        'x-role': 'admin',
      },
    });
    assert.equal(healthResponse.status, 200);
    const healthJson = await healthResponse.json();
    assert.equal(healthJson.service, 'analytics-service');
    assert.equal(healthJson.status, 'healthy');

    assert.equal(upstreamRequest.url, '/api/v1/analytics/health');
    assert.equal(upstreamRequest.authorization, 'Bearer gateway-test-analytics-token');
    assert.equal(upstreamRequest.cookie, 'accessToken=jwt-test-cookie');
    assert.match(upstreamRequest.requestId, /^[a-f\d-]{36}$/i);
    assert.equal(upstreamRequest.spoofedUser, undefined);
    assert.equal(upstreamRequest.spoofedRole, undefined);

    // 2. Test POST /api/v1/analytics/events/ingest passes body and preserves headers
    const postResponse = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        authorization: 'Bearer token-ingest',
      },
      body: JSON.stringify({ eventId: '1234', eventType: 'quiz.completed.v1' }),
    });
    assert.equal(postResponse.status, 200);
    assert.equal(upstreamRequest.url, '/api/v1/analytics/events/ingest');
    assert.equal(upstreamRequest.method, 'POST');
    assert.equal(upstreamRequest.authorization, 'Bearer token-ingest');
    assert.equal(upstreamRequest.body, JSON.stringify({ eventId: '1234', eventType: 'quiz.completed.v1' }));
  } finally {
    if (gateway?.listening) await new Promise((resolve, reject) => gateway.close((error) => (error ? reject(error) : resolve())));
    await new Promise((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
