import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import { AuthServiceIdentityProvider } from '../dist/infrastructure/auth/auth-service-identity-provider.js';
import { InternalApiClient } from '../dist/infrastructure/http/internal-api-client.js';
import { InternalApiError } from '../dist/shared/errors/app-error.js';

const config = {
  port: 5014,
  nodeEnv: 'test',
  clientOrigins: ['http://localhost:5173'],
  authServiceUrl: 'http://auth-service.test',
  internalApiTimeoutMs: 100,
};
const logger = { info() {}, warn() {}, error() {} };

async function serve(app) {
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('health endpoint is public and emits a request ID', async () => {
  const identityProvider = { async getCurrentUser() { throw new Error('must not authenticate health'); } };
  const app = createApp(config, identityProvider, logger);
  const service = await serve(app);
  try {
    const response = await fetch(`${service.url}/api/v1/health`, { headers: { 'x-request-id': 'invalid id' } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.service, 'ai-integration-service');
    assert.equal(body.status, 'healthy');
    assert.match(response.headers.get('x-request-id'), /^[a-f\d-]{36}$/i);
  } finally {
    await service.close();
  }
});

test('AI status requires authentication and exposes no connector implementation', async () => {
  let identityRequests = 0;
  const identityProvider = {
    async getCurrentUser() {
      identityRequests += 1;
      return { id: '0123456789abcdef01234567', role: 'user' };
    },
  };
  const app = createApp(config, identityProvider, logger);
  const service = await serve(app);
  try {
    const denied = await fetch(`${service.url}/api/v1/ai/status`);
    assert.equal(denied.status, 401);
    assert.equal(identityRequests, 0);

    const allowed = await fetch(`${service.url}/api/v1/ai/status`, {
      headers: { authorization: 'Bearer test-token', 'x-request-id': 'ai-request-1234' },
    });
    const body = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(body.data.enabled, false);
    assert.deepEqual(body.data.connectors, []);
    assert.equal(body.data.requestedBy, '0123456789abcdef01234567');
    assert.equal(allowed.headers.get('x-request-id'), 'ai-request-1234');
  } finally {
    await service.close();
  }
});

test('authentication failures are preserved and identity dependency failures are controlled', async () => {
  const app = createApp(config, {
    async getCurrentUser() {
      throw new InternalApiError(401, 'AUTHENTICATION_REJECTED', 'private upstream response');
    },
  }, logger);
  const service = await serve(app);
  try {
    const denied = await fetch(`${service.url}/api/v1/ai/status`, {
      headers: { authorization: 'Bearer expired-token' },
    });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).message, 'Authentication required');
  } finally {
    await service.close();
  }

  const unavailableApp = createApp(config, {
    async getCurrentUser() {
      throw new InternalApiError(503, 'DEPENDENCY_UNAVAILABLE', 'upstream detail');
    },
  }, logger);
  const unavailableService = await serve(unavailableApp);
  try {
    const response = await fetch(`${unavailableService.url}/api/v1/ai/status`, {
      headers: { authorization: 'Bearer valid-token' },
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.message, 'Authentication service is temporarily unavailable');
    assert.doesNotMatch(JSON.stringify(body), /upstream detail|private upstream/);
  } finally {
    await unavailableService.close();
  }
});

test('internal API client forwards only approved session headers', async () => {
  let received;
  const client = new InternalApiClient(100, async (url, init) => {
    received = { url: String(url), headers: init?.headers };
    return new Response(JSON.stringify({ data: { user: { _id: '0123456789abcdef01234567', role: 'user' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const provider = new AuthServiceIdentityProvider(client, 'http://auth-service.test');
  const user = await provider.getCurrentUser({
    cookie: 'accessToken=secret; refreshToken=must-not-forward; theme=dark',
    authorization: 'Bearer secret',
    'x-csrf-token': 'csrf-value',
    'x-client-session-id': 'session-id',
    'x-request-id': 'untrusted-incoming-id',
    'x-user-id': 'spoofed',
  }, 'trusted-request-1234');

  assert.equal(user.id, '0123456789abcdef01234567');
  assert.equal(user.role, 'user');
  assert.equal(received.url, 'http://auth-service.test/api/v1/auth/me');
  const headers = new Headers(received.headers);
  assert.equal(headers.get('authorization'), 'Bearer secret');
  assert.equal(headers.get('cookie'), 'accessToken=secret');
  assert.equal(headers.get('x-csrf-token'), 'csrf-value');
  assert.equal(headers.get('x-client-session-id'), 'session-id');
  assert.equal(headers.get('x-request-id'), 'trusted-request-1234');
  assert.equal(headers.has('x-user-id'), false);
});

test('internal API client rejects unsuccessful and malformed upstream responses', async () => {
  const unauthorized = new InternalApiClient(100, async () => new Response('', { status: 401 }));
  await assert.rejects(
    unauthorized.getJson('http://auth-service.test', '/api/v1/auth/me', 'request-id-1234', {}),
    (error) => error instanceof InternalApiError && error.statusCode === 401,
  );

  const malformed = new InternalApiClient(100, async () => new Response('not json', { status: 200 }));
  await assert.rejects(
    malformed.getJson('http://auth-service.test', '/api/v1/auth/me', 'request-id-1234', {}),
    (error) => error instanceof InternalApiError && error.statusCode === 502,
  );

  const timedOut = new InternalApiClient(1, async () => {
    throw new DOMException('request timed out', 'TimeoutError');
  });
  await assert.rejects(
    timedOut.getJson('http://auth-service.test', '/api/v1/auth/me', 'request-id-1234', {}),
    (error) => error instanceof InternalApiError && error.statusCode === 503 && error.code === 'DEPENDENCY_TIMEOUT',
  );
});
