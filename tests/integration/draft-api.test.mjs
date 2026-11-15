import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import { ApiClient } from '../e2e/helpers/api-client.js';
import { uploadFixture } from '../fixtures/media/samples.mjs';
import { Webhooks } from '../../services/ai-integration-service/dist/infrastructure/storage/webhooks.js';

const url = process.env.GATEWAY_URL;
const base = '/api/v1/ai/drafts';
const question = {
  questionText: 'Which is a primary color?', questionType: 'multiple_choice',
  options: [{ text: 'Red', optionId: 'red-option', isCorrect: true }, { text: 'Green', optionId: 'green-option' }],
  correctAnswer: 'A',
};

async function call(token, method, path, body, key) {
  const response = await fetch(url + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'X-Request-ID': 'draft-test-' + randomUUID(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function status(result, expected, code) {
  assert.equal(result.status, expected, JSON.stringify(result.body));
  if (code) assert.equal(result.body.error?.code, code);
  return result.body.data;
}

test('versioned integration draft API through Gateway, Auth, Quiz, Challenge and MongoDB', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const creator = new ApiClient(url);
  const other = new ApiClient(url);
  await Promise.all([creator.registerTestUser('integration_creator'), other.registerTestUser('integration_other')]);
  const token = creator.token;
  const input = { kind: 'quiz', title: 'Integration quiz fixture', questions: [question] };
  let quiz;
  let challenge;

  await t.test('authenticates, validates input and rejects publication fields', async () => {
    status(await call(null, 'GET', base), 401, 'UNAUTHENTICATED');
    status(await call(token, 'POST', base, input), 400, 'VALIDATION_ERROR');
    status(await call(token, 'POST', base, { ...input, visibility: 'public' }, randomUUID()), 400, 'VALIDATION_ERROR');
    status(await call(token, 'POST', base, { ...input, uploader: 'someone-else' }, randomUUID()), 400, 'VALIDATION_ERROR');
    status(await call(token, 'GET', base + '?page=0'), 400, 'VALIDATION_ERROR');
    status(await call(token, 'GET', base + '/bad-id'), 400, 'VALIDATION_ERROR');
  });

  await t.test('creates one private quiz, replays retries and scopes keys by user', async () => {
    const key = randomUUID();
    const replies = await Promise.all([call(token, 'POST', base, input, key), call(token, 'POST', base, input, key)]);
    assert.ok(replies.every(reply => [201, 409].includes(reply.status)));
    const created = replies.find(reply => reply.status === 201);
    assert.ok(created);
    quiz = created.body.data;
    assert.equal(quiz.visibility, 'private');
    assert.equal(quiz.status, 'draft');
    assert.equal(quiz.questionCount, 1);
    assert.match(created.headers.get('cache-control'), /no-store/);
    assert.equal(created.body.requestId, created.headers.get('x-request-id'));
    const replay = status(await call(token, 'POST', base, { questions: input.questions, title: input.title, kind: 'quiz' }, key), 201);
    assert.deepEqual(replay, quiz);
    status(await call(token, 'POST', base, { ...input, title: 'Changed body' }, key), 409, 'IDEMPOTENCY_KEY_REUSED');
    const createdForOther = status(await call(other.token, 'POST', base, input, key), 201);
    assert.notEqual(createdForOther.id, quiz.id);
    const list = status(await call(token, 'GET', base + '?limit=1&kind=quiz'), 200);
    assert.deepEqual(list.drafts.map(row => row.id), [quiz.id]);
    assert.equal(list.pagination.total, 1);
    status(await call(other.token, 'GET', base + '/' + quiz.id), 404, 'DRAFT_NOT_FOUND');
    status(await call(other.token, 'PATCH', base + '/' + quiz.id, { title: 'Unauthorized title' }, randomUUID()), 404, 'DRAFT_NOT_FOUND');
  });

  await t.test('edits draft questions, preserves option IDs, and excludes a published quiz', async () => {
    const path = base + '/' + quiz.id;
    const key = randomUUID();
    const patch = { title: 'Revised integration quiz', questions: [{ ...question, questionText: 'Pick a primary color.' }] };
    const updated = status(await call(token, 'PATCH', path, patch, key), 200);
    assert.equal(updated.title, patch.title);
    const detail = status(await call(token, 'GET', path), 200);
    assert.equal(detail.questions[0].questionText, patch.questions[0].questionText);
    assert.equal(detail.questions[0].options[0].optionId, 'red-option');
    assert.equal(detail.questions[0].correctAnswer, 'A');
    assert.equal(detail.uploader, undefined);
    assert.deepEqual(status(await call(token, 'PATCH', path, patch, key), 200), updated);
    status(await call(token, 'PATCH', path, { durationMinutes: 5 }, randomUUID()), 400, 'DRAFT_INVALID');

    const published = await creator.post('/api/v1/quiz/drafts/' + quiz.id + '/publish', { visibility: 'public' });
    assert.equal(published.status, 200, JSON.stringify(published.data));
    status(await call(token, 'GET', path), 404, 'DRAFT_NOT_FOUND');
    status(await call(token, 'PATCH', path, { title: 'Edit after publishing' }, randomUUID()), 404, 'DRAFT_NOT_FOUND');
    const list = status(await call(token, 'GET', base + '?kind=quiz'), 200);
    assert.equal(list.pagination.total, 0);
  });

  await t.test('creates and updates challenge drafts through native contest authoring', async () => {
    const deadlineAt = new Date(Date.now() + 3600000).toISOString();
    const payload = { kind: 'challenge', title: 'Integration challenge fixture', questions: [question], durationMinutes: 20, deadlineAt };
    challenge = status(await call(token, 'POST', base, payload, randomUUID()), 201);
    assert.equal(challenge.visibility, 'private');
    assert.equal(challenge.kind, 'challenge');
    const path = base + '/' + challenge.id;
    const patch = { title: 'Revised integration challenge', durationMinutes: 8 };
    const updated = status(await call(token, 'PATCH', path, patch, randomUUID()), 200);
    assert.equal(updated.durationMinutes, 8);
    const detail = status(await call(token, 'GET', path), 200);
    assert.equal(detail.title, patch.title);
    assert.equal(detail.deadlineAt, deadlineAt);
    assert.equal(detail.questions[0].options[0].optionId, 'red-option');
    const list = status(await call(token, 'GET', base + '?kind=challenge&search=Revised'), 200);
    assert.deepEqual(list.drafts.map(row => row.id), [challenge.id]);
    status(await call(other.token, 'GET', path), 404, 'DRAFT_NOT_FOUND');
    status(await call(token, 'PATCH', path, { questions: Array(11).fill(question) }, randomUUID()), 400, 'DRAFT_INVALID');
    const published = await creator.post('/api/v1/challenges', { draftId: challenge.id });
    assert.equal(published.status, 201, JSON.stringify(published.data));
    status(await call(token, 'PATCH', path, patch, randomUUID()), 404, 'DRAFT_NOT_FOUND');
  });

  await t.test('a concurrent publish cannot leave a published quiz with an overwritten draft', async () => {
    const created = status(await call(token, 'POST', base, {
      ...input, title: 'Publish race fixture',
    }, randomUUID()), 201);
    const patch = { title: 'Race edit title', questions: [] };
    const path = base + '/' + created.id;
    const publish = () => creator.post('/api/v1/quiz/drafts/' + created.id + '/publish', { visibility: 'public' });
    const [updated, published] = await Promise.all([call(token, 'PATCH', path, patch, randomUUID()), publish()]);
    if (published.status === 200) {
      assert.ok([404, 409].includes(updated.status), JSON.stringify(updated.body));
      assert.equal(published.data.data.quiz.title, 'Publish race fixture');
      status(await call(token, 'GET', path), 404, 'DRAFT_NOT_FOUND');
    } else {
      assert.ok([400, 409].includes(published.status), JSON.stringify(published.data));
      assert.ok([200, 409].includes(updated.status), JSON.stringify(updated.body));
      if (updated.status === 200) {
        const detail = status(await call(token, 'GET', path), 200);
        assert.equal(detail.title, patch.title);
        assert.deepEqual(detail.questions, []);
        assert.equal((await publish()).status, 400);
      } else {
        assert.equal((await publish()).status, 200);
      }
    }
  });

  await t.test('saves an empty private draft', async () => {
    const result = status(await call(token, 'POST', base, { kind: 'quiz', title: 'Empty draft' }, randomUUID()), 201);
    assert.equal(result.questionCount, 0);
    assert.deepEqual(status(await call(token, 'GET', base + '/' + result.id), 200).questions, []);
  });

  await t.test('imports canonical JSON and mapped CSV into private drafts', async () => {
    const key = randomUUID();
    const path = '/api/v1/ai/imports';
    const payload = { format: 'quizfocus.quiz.v1', draft: { kind: 'quiz', title: 'Canonical JSON fixture', questions: [question] } };
    const draft = status(await call(token, 'POST', path, payload, key), 201);
    assert.equal(draft.visibility, 'private');
    assert.deepEqual(status(await call(token, 'POST', path, payload, key), 201), draft);
    status(await call(token, 'POST', path, { ...payload, draft: { ...payload.draft, questions: [question, question] } }, randomUUID()), 422);
    const uploaded = await uploadFixture(creator, 'integration-import.csv', { endpoint: '/api/v1/upload',
      bytes: Buffer.from('Question,Option A,Option B,Correct Answer\nWhich size is bigger?,Large,Small,A\n') });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
    const uploadId = uploaded.data.data.upload.id;
    assert.equal((await creator.post('/api/v1/parser/parse/' + uploadId, {})).status, 200);
    const mapped = await creator.post('/api/v1/parser/map/' + uploadId, {
      question: 'Question', options: ['Option A', 'Option B'], answer: 'Correct Answer',
    });
    assert.equal(mapped.status, 200, JSON.stringify(mapped.data));
    const result = status(await call(token, 'POST', path, {
      format: 'mapped-upload', uploadId, title: 'Mapped CSV fixture',
    }, randomUUID()), 201);
    assert.equal(result.visibility, 'private');
    assert.equal(result.questionCount, 1);
    assert.equal(status(await call(token, 'GET', base + '/' + result.id), 200).questions[0].correctAnswer, 'A');
  });

  await t.test('Core accepts only signed internal delegation for the bound private authoring request', async () => {
    const existing = status(await call(token, 'POST', base, { kind: 'quiz', title: 'Delegated fixture' }, randomUUID()), 201);
    const actor = (await creator.get('/api/v1/auth/me')).data.data.user._id;
    const path = '/api/v1/quiz/drafts/' + existing.id + '?scope=integration';
    const signature = (target, method) => {
      const payload = Buffer.from(JSON.stringify({
        userId: actor, method, target, expires: Math.floor(Date.now() / 1000) + 20,
      })).toString('base64url');
      return payload + '.' + createHmac('sha256', process.env.INTEGRATION_DELEGATION_SECRET).update(payload).digest('base64url');
    };
    const delegate = signature(path, 'GET');
    const header = { 'x-internal-quizfocus-delegation': delegate };
    const direct = await fetch(process.env.QUIZ_SERVICE_URL + path, { headers: header });
    assert.equal(direct.status, 200);
    assert.equal((await direct.json()).data.draft._id, existing.id);
    assert.equal((await fetch(url + path, { headers: header })).status, 401);
    const publish = '/api/v1/quiz/drafts/' + existing.id + '/publish';
    assert.equal((await fetch(process.env.QUIZ_SERVICE_URL + publish, { method: 'POST',
      headers: { 'x-internal-quizfocus-delegation': signature(publish, 'POST') },
    })).status, 401);
  });

  await t.test('webhook outbox retries once with the same delivery ID and keeps owner-scoped audit history', async () => {
    const require = createRequire(new URL('../../services/auth-service/package.json', import.meta.url));
    const { MongoClient } = require('mongoose').mongo;
    const connection = new MongoClient(process.env.MONGO_URI);
    await connection.connect();
    try {
      const db = connection.db();
      const requests = [];
      const webhooks = new Webhooks(db, db.collection('integration_draft_operations'),
        'fixture-secret', ['https://receiver.example.test'], async (_url, body, id) => {
          requests.push({ id, body });
          return requests.length === 1 ? 503 : 204;
        });
      await webhooks.initialize();
      const owner = (await creator.get('/api/v1/auth/me')).data.data.user._id;
      const created = await webhooks.create(owner, 'https://receiver.example.test/events?key=receiver-secret', ['draft.created']);
      assert.doesNotMatch(JSON.stringify(await db.collection('integration_webhook_subscriptions').findOne({ _id: created.id })), /receiver-secret/);
      await assert.rejects(webhooks.history('000000000000000000000001', created.id), { code: 'SUBSCRIPTION_NOT_FOUND' });
      const key = randomUUID();
      const input = { kind: 'quiz', title: 'Webhook draft fixture' };
      const draft = status(await call(token, 'POST', base, input, key), 201);
      status(await call(token, 'POST', base, input, key), 201);
      await webhooks.tick();
      assert.equal(requests.length, 1);
      const history = await webhooks.history(owner, created.id);
      assert.equal(history[0].status, 'pending');
      assert.equal(JSON.parse(requests[0].body).data.id, draft.id);
      await db.collection('integration_webhook_deliveries').updateOne({ _id: history[0].id },
        { $set: { nextAt: new Date(0), lease: 'interrupted-worker' } });
      await Promise.all([webhooks.tick(), webhooks.tick()]);
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1], requests[0]);
      const [outcome] = await webhooks.history(owner, created.id);
      assert.equal(outcome.status, 'sent');
      assert.deepEqual(outcome.audit.map(item => item.status), [503, 204]);
    } finally {
      await connection.close();
    }
  });
});
