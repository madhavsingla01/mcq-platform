import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizFocusClient, QuizFocusError } from '@quizfocus/sdk';

const id = '0123456789abcdef01234567';
const draft = {
  id, kind: 'quiz', title: 'SDK draft', description: '', category: 'General', difficulty: 'All Levels',
  tags: [], questionCount: 0, visibility: 'private', status: 'draft',
  durationMinutes: null, deadlineAt: null, updatedAt: '2026-11-14T12:00:00.000Z',
};
const ok = data => Response.json({ success: true, requestId: 'req-01', data });
const makeClient = (fetch, options = {}) => new QuizFocusClient({
  baseUrl: 'https://gateway.example.test', accessToken: 'fixture-token', fetch, ...options,
});

test('validates responses and walks pages scoped to the selected draft kind', async () => {
  const seen = [];
  const client = makeClient(async (url, init) => {
    const address = new URL(url);
    assert.equal(address.pathname, '/api/v1/ai/drafts');
    assert.equal(init.headers.get('Authorization'), 'Bearer fixture-token');
    assert.equal(init.credentials, 'omit');
    const page = Number(address.searchParams.get('page') || 1);
    seen.push(page);
    assert.equal(address.searchParams.get('kind'), 'quiz');
    return ok({ drafts: [draft], pagination: { page, pages: 2, limit: 1, total: 2 } });
  });
  assert.equal((await client.quizzes.listDrafts({ limit: 1 })).drafts[0].id, id);
  for await (const page of client.drafts.pages({ kind: 'quiz', limit: 1 })) {
    assert.equal(page.drafts[0].kind, 'quiz');
  }
  assert.deepEqual(seen, [1, 1, 2]);
});

test('a transient write failure replays the same body and idempotency key', async () => {
  const writes = [];
  const client = makeClient(async (_url, init) => {
    writes.push([init.method, init.headers.get('Idempotency-Key'), init.body]);
    return writes.length === 1 ? new Response(null, { status: 503 }) : ok(draft);
  });
  await client.quizzes.createDraft({ title: draft.title }, { idempotencyKey: 'same-write-identifier' });
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(JSON.parse(writes[0][2]), { kind: 'quiz', title: draft.title });
});

test('does not retry a conflict and preserves the API error details', async () => {
  let calls = 0;
  const client = makeClient(async () => {
    calls++;
    return Response.json({ success: false, message: 'Pending write', requestId: 'req-02',
      error: { code: 'IDEMPOTENCY_PENDING' } }, { status: 409 });
  });
  await assert.rejects(client.drafts.update(id, { title: 'Updated' }, { idempotencyKey: 'update-key' }),
    error => error instanceof QuizFocusError && error.code === 'IDEMPOTENCY_PENDING' && error.requestId === 'req-02');
  assert.equal(calls, 1);
});

test('rejects unsafe origins, redirects, malformed responses and invalid inputs', async () => {
  assert.throws(() => makeClient(fetch, { baseUrl: 'http://example.test' }), { code: 'INVALID_BASE_URL' });
  assert.throws(() => makeClient(fetch, { baseUrl: 'https://user:pass@example.test' }), { code: 'INVALID_BASE_URL' });
  const redirecting = makeClient(async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    return Response.redirect('https://other.example.test', 302);
  });
  await assert.rejects(redirecting.drafts.get(id), { code: 'REDIRECT_REJECTED' });
  await assert.rejects(makeClient(async () => ok({ id })).drafts.get(id), { code: 'INVALID_RESPONSE' });
  await assert.rejects(makeClient(async () => assert.fail('invalid input sent over network')).drafts.get('..'), { code: 'INVALID_INPUT' });
});

test('supports caller cancellation and times out even if a token provider stalls', async () => {
  const controller = new AbortController();
  const stalled = () => new Promise(() => {});
  const client = makeClient(stalled, { accessToken: stalled, timeoutMs: 40 });
  await assert.rejects(client.drafts.get(id), { code: 'TIMEOUT' });
  const request = makeClient(stalled).drafts.get(id, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: 'ABORTED' });
});
