import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ApiClient } from '../../../tests/e2e/helpers/api-client.js';

const gateway = process.env.GATEWAY_URL;
const endpoint = gateway + '/api/v1/ai/mcp';
const accept = 'application/json, text/event-stream';
const question = (text) => ({
  questionText: text, questionType: 'multiple_choice',
  options: [{ text: 'Mercury', isCorrect: true }, { text: 'Venus' }], correctAnswer: 'A',
});

async function connect(api, t) {
  const client = new Client({ name: 'quizfocus-integration-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: 'Bearer ' + api.token } },
  }));
  return client;
}

async function tool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.ok(result.structuredContent);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.equal(result.structuredContent.result.ok, true);
  return result.structuredContent.result.data;
}

async function denied(client, name, args, code) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, JSON.stringify(result));
  if (code) {
    assert.equal(result.structuredContent?.result?.ok, false);
    assert.equal(result.structuredContent.result.error.code, code);
  }
}

test('MCP Streamable HTTP through Gateway, Auth and Core services', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const owner = new ApiClient(gateway);
  const stranger = new ApiClient(gateway);
  await Promise.all([owner.registerTestUser('mcp_owner'), stranger.registerTestUser('mcp_stranger')]);

  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'http-test', version: '1' },
  } };
  const request = (token, body, additionalHeaders = {}) => fetch(endpoint, {
    method: 'POST', headers: {
      Accept: accept, 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...additionalHeaders,
    },
    body: JSON.stringify(body),
  });

  await t.test('requires bearer authentication, rejects untrusted origins and negotiates the protocol', async () => {
    const missing = await request(null, initialize);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate'), /^Bearer /);
    const cookie = await request(null, initialize, { Cookie: 'accessToken=' + owner.token });
    assert.equal(cookie.status, 401);
    assert.equal((await request(owner.token, initialize, { Origin: 'https://outside.example' })).status, 403);
    const response = await request(owner.token, initialize);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('mcp-session-id'), null);
    assert.equal((await response.json()).result.protocolVersion, '2025-11-25');
    assert.equal((await request(owner.token, initialize, { Origin: 'http://localhost:5173' })).status, 200);
    assert.equal((await request(owner.token, initialize, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request(owner.token, [initialize])).status, 400);
    assert.equal((await request(owner.token, { ...initialize, padding: 'x'.repeat(66 * 1024) })).status, 413);
    assert.equal((await request(owner.token, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, {
      'MCP-Protocol-Version': 'unsupported-test-version',
    })).status, 400);
    for (const method of ['GET', 'DELETE']) {
      assert.equal((await fetch(endpoint, { method, headers: { Authorization: 'Bearer ' + owner.token, Accept: accept } })).status, 405);
    }
  });

  const client = await connect(owner, t);
  const outsider = await connect(stranger, t);
  let quiz;
  let challenge;

  await t.test('official SDK discovers the tools and their output schemas', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(entry => entry.name).sort(), [
      'add_questions', 'create_challenge_draft', 'create_quiz_draft', 'get_draft',
      'get_quiz', 'list_drafts', 'list_quizzes', 'validate_draft',
    ]);
    assert.ok(tools.every(entry => entry.outputSchema));
    assert.equal(tools.find(entry => entry.name === 'validate_draft').annotations.readOnlyHint, true);
    assert.equal(tools.find(entry => entry.name === 'add_questions').annotations.idempotentHint, true);
  });

  await t.test('reuses private draft creation and idempotency across REST and MCP', async () => {
    const idempotencyKey = randomUUID();
    const title = 'MCP science quiz fixture';
    const args = { idempotencyKey, title };
    quiz = await tool(client, 'create_quiz_draft', args);
    assert.equal(quiz.visibility, 'private');
    assert.equal(quiz.status, 'draft');
    assert.deepEqual(await tool(client, 'create_quiz_draft', args), quiz);
    await denied(client, 'create_quiz_draft', { ...args, title: 'Different title' }, 'IDEMPOTENCY_KEY_REUSED');
    await denied(client, 'create_quiz_draft', { ...args, visibility: 'public' });
    const rest = await fetch(gateway + '/api/v1/ai/drafts', {
      method: 'POST', headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ kind: 'quiz', title }),
    });
    assert.equal(rest.status, 201);
    assert.deepEqual((await rest.json()).data, quiz);
    const listing = await tool(client, 'list_drafts', { kind: 'quiz', limit: 1 });
    assert.deepEqual(listing.drafts.map(entry => entry.id), [quiz.id]);
    assert.equal(listing.pagination.total, 1);
  });

  await t.test('appends questions with safe replay and validates without publication', async () => {
    const id = quiz.id;
    const empty = await tool(client, 'validate_draft', { id });
    assert.equal(empty.valid, false);
    assert.match(empty.issues[0], /empty/);
    const idempotencyKey = randomUUID();
    const first = question('Which planet orbits closest to the Sun?');
    first.options[0].optionId = 'mercury-choice';
    const args = { id, idempotencyKey, questions: [first] };
    const appended = await tool(client, 'add_questions', args);
    assert.equal(appended.questionCount, 1);
    assert.deepEqual(await tool(client, 'add_questions', args), appended);
    const second = question('Which planet is smaller?');
    await tool(client, 'add_questions', { id, idempotencyKey: randomUUID(), questions: [second] });
    const detail = await tool(client, 'get_draft', { id });
    assert.deepEqual(detail.questions.map(entry => entry.questionText), [first.questionText, second.questionText]);
    assert.equal(detail.questions[0].options[0].optionId, 'mercury-choice');
    assert.equal(detail.questions[0].correctAnswer, 'A');
    assert.deepEqual(await tool(client, 'validate_draft', { id }), { valid: true });
    assert.equal((await tool(client, 'get_draft', { id })).status, 'draft');
  });

  await t.test('creates and validates challenge drafts using competition publication rules', async () => {
    challenge = await tool(client, 'create_challenge_draft', {
      title: 'MCP challenge fixture', idempotencyKey: randomUUID(), durationMinutes: 10,
      deadlineAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    assert.equal(challenge.kind, 'challenge');
    assert.equal(challenge.visibility, 'private');
    const id = challenge.id;
    assert.equal((await tool(client, 'validate_draft', { id })).valid, false);
    const addition = { id, idempotencyKey: randomUUID(), questions: [question('Closest planet?')] };
    assert.equal((await tool(client, 'add_questions', addition)).questionCount, 1);
    assert.deepEqual(await tool(client, 'validate_draft', { id }), { valid: true });
    assert.equal((await tool(client, 'get_draft', { id })).questions.length, 1);
    await denied(client, 'add_questions', { id, idempotencyKey: randomUUID(), questions: Array(10).fill(addition.questions[0]) }, 'DRAFT_INVALID');
    assert.equal((await tool(client, 'get_draft', { id })).questions.length, 1);
  });

  await t.test('flags an invalid answer without changing the draft or permitting publication', async () => {
    const invalid = await tool(client, 'create_quiz_draft', {
      title: 'Invalid answer fixture', idempotencyKey: randomUUID(),
      questions: [{ ...question('Invalid answer example?'), correctAnswer: 'H' }],
    });
    const status = await tool(client, 'validate_draft', { id: invalid.id });
    assert.equal(status.valid, false);
    assert.match(status.issues[0], /Question 1.*does not match an option/);
    const publication = await owner.post('/api/v1/quiz/drafts/' + invalid.id + '/publish', { visibility: 'public' });
    assert.equal(publication.status, 400);
    assert.equal((await tool(client, 'get_draft', { id: invalid.id })).status, 'draft');
  });

  await t.test('enforces ownership per tool and restricts the quiz catalog to metadata', async () => {
    for (const resource of [quiz, challenge]) {
      const id = resource.id;
      await denied(outsider, 'get_draft', { id }, 'DRAFT_NOT_FOUND');
      await denied(outsider, 'validate_draft', { id }, 'DRAFT_NOT_FOUND');
      await denied(outsider, 'add_questions', { id, idempotencyKey: randomUUID(), questions: [question('Outsider fixture')] }, 'DRAFT_NOT_FOUND');
    }
    assert.deepEqual((await tool(outsider, 'list_drafts', {})).drafts, []);
    assert.deepEqual((await tool(client, 'list_quizzes', {})).quizzes, []);
    const publish = await owner.post('/api/v1/quiz/drafts/' + quiz.id + '/publish', { visibility: 'public' });
    assert.equal(publish.status, 200, JSON.stringify(publish.data));
    const metadata = await tool(client, 'get_quiz', { id: quiz.id });
    assert.equal(metadata.status, 'published');
    assert.equal(metadata.questionCount, 2);
    assert.equal(metadata.questions, undefined);
    assert.deepEqual((await tool(client, 'list_quizzes', { limit: 1 })).quizzes, [metadata]);
    assert.deepEqual((await tool(outsider, 'list_quizzes', {})).quizzes, []);
    await denied(outsider, 'get_quiz', { id: quiz.id }, 'QUIZ_NOT_FOUND');
    await denied(client, 'get_draft', { id: quiz.id }, 'DRAFT_NOT_FOUND');
    await denied(client, 'add_questions', { id: quiz.id, idempotencyKey: randomUUID(), questions: [question('Published fixture')] }, 'DRAFT_NOT_FOUND');
  });

  await t.test('a revoked account token cannot send another tool request', async () => {
    const oldToken = owner.token;
    const signedOut = await owner.post('/api/v1/auth/logout', {});
    assert.equal(signedOut.status, 200, JSON.stringify(signedOut.data));
    const response = await request(oldToken, { jsonrpc: '2.0', id: 5, method: 'tools/list' });
    assert.equal(response.status, 401);
  });
});
