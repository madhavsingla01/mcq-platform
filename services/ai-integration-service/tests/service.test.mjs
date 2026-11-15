import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../dist/app.js';
import { AuthServiceIdentityProvider } from '../dist/infrastructure/auth/auth-service-identity-provider.js';
import { InternalApiClient } from '../dist/infrastructure/http/internal-api-client.js';
import { ManageDrafts } from '../dist/application/use-cases/manage-drafts.js';
import { AppError, InternalApiError } from '../dist/shared/errors/app-error.js';
import { ImportDrafts, importRequest } from '../dist/application/authoring-import.js';
import { signWebhook, webhookDestination } from '../dist/infrastructure/http/webhook-delivery.js';
import { HttpQuizGenerator } from '../dist/infrastructure/http/quiz-generator.js';
import { createHmac } from 'node:crypto';

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

test('MCP OAuth discovery, scopes and live revocation use one resource and keep external credentials out of Core', async t => {
  const id = '0123456789abcdef01234567';
  const issuer = 'https://identity.example.test';
  const publicOrigin = 'https://quizfocus.example.test';
  const resource = publicOrigin + '/api/v1/ai/mcp';
  let active = true;
  let scope = 'quizfocus:read';
  let audience = resource;
  let oversized = false;
  const introspection = await serve(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(new URLSearchParams(Buffer.concat(chunks).toString()).get('token'), 'fixture-bearer');
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('resource-client:fixture-secret').toString('base64'));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ active, iss: issuer, aud: [audience], exp: Math.floor(Date.now() / 1000) + 30,
      scope, quizfocus_user_id: id, extra: oversized ? 'x'.repeat(33 * 1024) : undefined }));
  });
  t.after(() => introspection.close());
  const draft = {
    id, kind: 'quiz', title: 'OAuth fixture', description: '', category: 'General', difficulty: 'All Levels', tags: [],
    questionCount: 0, visibility: 'private', status: 'draft', durationMinutes: null, deadlineAt: null, updatedAt: new Date().toISOString(),
  };
  const core = {
    async list(context) {
      assert.equal(context.userId, id);
      assert.equal(context.headers.authorization, undefined);
      assert.ok(context.delegate('GET', '/api/v1/quiz/drafts?scope=integration'));
      return { drafts: [draft], pagination: { total: 1, pages: 1, page: 1, limit: 20 } };
    },
    async create() { return draft; },
  };
  const identity = { getCurrentUser() { throw new Error('OAuth must not use browser session auth'); } };
  const drafts = new ManageDrafts(core, { run: (_user, _key, _fingerprint, write) => write() });
  const service = await serve(createApp({ ...config, draftRate: { reads: 20, writes: 20 }, oauth: {
    issuer, publicOrigin, introspectionUrl: introspection.url, clientId: 'resource-client',
    clientSecret: 'fixture-secret', delegationSecret: 'independent-test-delegation-secret',
  } }, identity, logger, drafts));
  t.after(() => service.close());
  const mcp = service.url + '/api/v1/ai/mcp';
  const noToken = await fetch(mcp, { method: 'POST' });
  assert.equal(noToken.status, 401);
  assert.match(noToken.headers.get('WWW-Authenticate'), /resource_metadata=/);
  const metadata = await fetch(service.url + '/.well-known/oauth-protected-resource/api/v1/ai/mcp').then(r => r.json());
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  assert.equal(metadata.resource, resource);
  const client = new Client({ name: 'oauth-fixture', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(mcp), {
    requestInit: { headers: { Authorization: 'Bearer fixture-bearer' } },
  }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.find(tool => tool.name === 'add_questions')._meta.securitySchemes[0].scopes, ['quizfocus:write']);
  assert.equal((await client.callTool({ name: 'list_drafts', arguments: {} })).structuredContent.result.data.drafts.length, 1);
  const call = () => fetch(mcp, { method: 'POST', headers: { Authorization: 'Bearer fixture-bearer',
    Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_quiz_draft', arguments: {
      title: 'OAuth fixture', idempotencyKey: 'oauth-fixture-123',
    } },
  }) });
  const wrongScope = await call();
  assert.equal(wrongScope.status, 403);
  assert.match(wrongScope.headers.get('WWW-Authenticate'), /insufficient_scope.*quizfocus:write/);
  scope = 'quizfocus:write';
  assert.equal((await call()).status, 200);
  audience = 'https://other.example.test/api/v1/ai/mcp';
  assert.equal((await call()).status, 401);
  audience = resource;
  oversized = true;
  assert.equal((await call()).status, 503);
  oversized = false;
  active = false;
  assert.equal((await call()).status, 401);
});

test('authoring rejects duplicate questions and invalid generated answer indexes before creating content', async () => {
  let writes = 0;
  let claims = 0;
  const replay = { run: (_owner, _key, _hash, write) => write() };
  const importer = new ImportDrafts({ async create() { writes++; } }, replay, {}, {
    usage: { async claim() { claims++; } },
    provider: { async generate() { return { questions: [{ prompt: 'Which answer?', choices: ['One', 'Two'], correctIndex: 8 }] }; } },
  });
  const context = { userId: '0123456789abcdef01234567', requestId: 'authoring-test', headers: {} };
  const question = { questionType: 'multiple_choice', questionText: 'Question F?', options: [{ text: 'One' }, { text: 'Two' }], correctAnswer: 'A' };
  const duplicate = { ...question, questionText: ' question F? ' };
  await assert.rejects(importer.import(context, 'duplicate-1', importRequest.parse({
    format: 'quizfocus.quiz.v1', draft: { kind: 'quiz', title: 'Import example', questions: [question, duplicate] },
  })), { code: 'DUPLICATE_QUESTION' });
  await assert.rejects(importer.generate(context, 'provider-bad-1', {
    title: 'Provider fixture', topic: 'Science', count: 1,
  }), { code: 'INVALID_GENERATION_OUTPUT' });
  assert.equal(writes, 0);
  assert.equal(claims, 1);
});

test('generation maps provider output into the draft contract and blocks calls over quota', async t => {
  const userId = '0123456789abcdef01234567';
  const request = { title: 'Prime practice', topic: 'Prime numbers', count: 1 };
  let calls = 0;
  const provider = await serve(async (req, res) => {
    calls++;
    assert.equal(req.headers.authorization, 'Bearer fixture-credential');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), { schema: 'quizfocus.mcq-generation.v1', ...request });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ questions: [{ prompt: 'Which number is prime?', choices: ['9', '11'], correctIndex: 1 }] }));
  });
  t.after(() => provider.close());
  let stored;
  const replay = { async run(owner, key, _fingerprint, write, event) {
    assert.equal(owner, userId);
    assert.equal(event, 'draft.created');
    if (stored?.key === key) return stored.result;
    const result = await write();
    stored = { key, result };
    return result;
  } };
  const core = { async create(context, draft) {
    assert.equal(context.userId, userId);
    assert.equal(draft.kind, 'quiz');
    assert.equal(draft.questions[0].correctAnswer, 'B');
    assert.deepEqual(draft.questions[0].options.map(option => option.isCorrect), [false, true]);
    return { id: userId, title: draft.title, status: 'draft', visibility: 'private' };
  } };
  let used = false;
  const imports = new ImportDrafts(core, replay, {}, {
    provider: new HttpQuizGenerator(provider.url, 'fixture-credential'),
    usage: { async claim(owner) {
      assert.equal(owner, userId);
      if (used) throw new AppError('Daily generation limit reached', 429, 'GENERATION_LIMIT');
      used = true;
    } },
  });
  const context = { userId, requestId: 'generation-fixture', headers: {} };
  const result = await imports.generate(context, 'generation-first', request);
  assert.deepEqual(await imports.generate(context, 'generation-first', request), result);
  await assert.rejects(imports.generate(context, 'generation-second', request), { code: 'GENERATION_LIMIT' });
  assert.equal(calls, 1);
});

test('a burst of requests cannot exceed the account budget or block another owner', async t => {
  const identityProvider = { async getCurrentUser(headers) {
    return { id: headers.authorization.endsWith('busy') ? '0123456789abcdef01234567' : '0123456789abcdef01234568', role: 'user' };
  } };
  const drafts = new ManageDrafts({ async list() {
    return { drafts: [], pagination: { total: 0, pages: 1, page: 1, limit: 20 } };
  } }, {});
  const service = await serve(createApp({ ...config, draftRate: { reads: 5, writes: 2 } }, identityProvider, logger, drafts));
  t.after(() => service.close());
  const send = async token => {
    const response = await fetch(service.url + '/api/v1/ai/drafts', { headers: { Authorization: 'Bearer ' + token } });
    await response.json();
    return response.status;
  };
  const responses = await Promise.all(Array.from({ length: 40 }, () => send('busy')));
  assert.equal(responses.filter(status => status === 200).length, 5);
  assert.equal(responses.filter(status => status === 429).length, 35);
  assert.equal(await send('separate-user'), 200);
});

test('webhook signing authenticates delivery metadata and the exact body', () => {
  const expected = createHmac('sha256', 'fixture').update('event-1.200.{"hello":"test"}').digest('hex');
  assert.equal(signWebhook('fixture', 'event-1', '200', '{"hello":"test"}'), 'v1=' + expected);
  assert.notEqual(signWebhook('fixture', 'event-1', '201', '{"hello":"test"}'), 'v1=' + expected);
  for (const url of ['http://example.test', 'https://127.0.0.1/a', 'https://[::1]/a',
    'https://receiver.local/a', 'https://user@example.test/a', 'https://outside.test/a']) {
    assert.throws(() => webhookDestination(url, ['https://example.test', 'https://127.0.0.1', 'https://[::1]', 'https://receiver.local']),
      { code: 'INVALID_DESTINATION' });
  }
  assert.equal(webhookDestination('https://example.test/api?key=receiver-secret', ['https://example.test']).origin, 'https://example.test');
});

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

test('draft request limits apply by account and keep read and write budgets separate', async () => {
  const summary = {
    id: '0123456789abcdef01234567', kind: 'quiz', title: 'Draft rate test', description: '',
    category: 'General', difficulty: 'All Levels', tags: [], questionCount: 0, visibility: 'private',
    status: 'draft', durationMinutes: null, deadlineAt: null, updatedAt: new Date().toISOString(),
  };
  const drafts = new ManageDrafts({
    async list() { return { drafts: [], pagination: { total: 0, pages: 1, page: 1, limit: 20 } }; },
    async create() { return summary; },
  }, { async run(_user, _key, _hash, write) { return write(); } });
  const identityProvider = {
    async getCurrentUser(headers) {
      const id = headers.authorization === 'Bearer first' ? '0123456789abcdef01234567' : '123456789abcdef012345678';
      return { id, role: 'user' };
    },
  };
  const service = await serve(createApp({ ...config, draftRate: { reads: 1, writes: 1 } }, identityProvider, logger, drafts));
  const client = new Client({ name: 'budget-test', version: '1.0.0' });
  try {
    const path = service.url + '/api/v1/ai/drafts';
    const first = { authorization: 'Bearer first' };
    const next = await fetch(path, { headers: first });
    assert.equal(next.status, 200);
    await client.connect(new StreamableHTTPClientTransport(new URL(service.url + '/api/v1/ai/mcp'), {
      requestInit: { headers: first },
    }));
    const mcpLimited = await client.callTool({ name: 'list_drafts', arguments: {} });
    assert.equal(mcpLimited.isError, true);
    assert.equal(mcpLimited.structuredContent.result.error.code, 'RATE_LIMITED');
    assert.ok(mcpLimited.structuredContent.result.error.retryAfter > 0);
    const limited = await fetch(path, { headers: first });
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get('retry-after'), /^[1-9]\d*$/);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
    assert.equal((await fetch(path, { headers: { authorization: 'Bearer second' } })).status, 200);
    assert.equal((await fetch(path, { method: 'POST', headers: {
      ...first, 'idempotency-key': 'draft-rate-test', 'content-type': 'application/json',
    }, body: JSON.stringify({ kind: 'quiz', title: 'Draft rate test' }) })).status, 201);
  } finally {
    await client.close();
    await service.close();
  }
});
