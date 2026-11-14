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
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test('AI routes proxy through the gateway with authorization and request context', async () => {
  let upstreamRequest;
  const upstream = createServer((req, res) => {
    upstreamRequest = { url: req.url, authorization: req.headers.authorization, requestId: req.headers['x-request-id'] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== 'string');

  const previousEnvironment = new Map(
    ['NODE_ENV', 'PORT', 'CLIENT_URL', 'AUTH_SERVICE_URL', 'QUIZ_SERVICE_URL', 'PARSER_SERVICE_URL',
      'ATTEMPT_SERVICE_URL', 'SOCIAL_SERVICE_URL', 'SOCIAL_FEED_SERVICE_URL',
      'SOCIAL_INTERACTIONS_SERVICE_URL', 'SOCIAL_COMMENTS_SERVICE_URL', 'MESSAGE_SERVICE_URL',
      'MEDIA_SERVICE_URL', 'ADMIN_SERVICE_URL', 'CHALLENGE_SERVICE_URL', 'MARKETPLACE_SERVICE_URL',
      'AI_INTEGRATION_SERVICE_URL'].map((key) => [key, process.env[key]]),
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
    ({ server: gateway } = await import('../dist/server.js?ai-integration-routing-test'));
    if (!gateway.listening) await once(gateway, 'listening');

    const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/ai/status`, {
      headers: { authorization: 'Bearer gateway-test-token' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(upstreamRequest.url, '/api/v1/ai/status');
    assert.equal(upstreamRequest.authorization, 'Bearer gateway-test-token');
    assert.match(upstreamRequest.requestId, /^[a-f\d-]{36}$/i);
  } finally {
    if (gateway?.listening) await new Promise((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
