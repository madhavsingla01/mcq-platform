import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { ApiClient } from '../e2e/helpers/api-client.js';
import { uploadFixture } from '../fixtures/media/samples.mjs';
import { QuizFocusClient } from '../../packages/sdk/dist/index.js';

const expect = (response, status) => assert.equal(response.status, status, JSON.stringify(response.data));

test('desktop update APIs through the isolated Gateway', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const author = new ApiClient(), recipient = new ApiClient(), outsider = new ApiClient();
  const [writer, reader, other] = await Promise.all([
    author.registerTestUser('desktop_author'), recipient.registerTestUser('desktop_recipient'),
    outsider.registerTestUser('desktop_outsider'),
  ]);

  await t.test('service root explains how to reach its health endpoint', async () => {
    const response = await new ApiClient(process.env.MEDIA_SERVICE_URL).get('/');
    expect(response, 200);
    assert.equal(response.data.service, 'media-service');
    assert.equal(response.data.health, '/api/v1/health');
    expect(await author.get('/'), 200);
  });

  await t.test('search matches rows beyond the preview and stays owner scoped', async () => {
    const rows = Array.from({ length: 13 }, (_, index) =>
      `${index === 12 ? 'Hidden target' : 'Example ' + index},0,1,A`).join('\n');
    const uploaded = await uploadFixture(author, 'desktop-rows.csv', {
      endpoint: '/api/v1/upload', bytes: Buffer.from('Question,Option A,Option B,Correct Answer\n' + rows),
    });
    expect(uploaded, 201);
    const id = uploaded.data.data.upload.id;
    expect(await author.post(`/api/v1/parser/parse/${id}`, {}), 200);
    const path = `/api/v1/parser/preview/${id}/search?q=hidden%20target`;
    const found = await author.get(path);
    expect(found, 200);
    assert.equal(found.data.data.total, 1);
    assert.equal(found.data.data.matches[0].index, 12);
    expect(await outsider.get(path), 403);
  });

  await t.test('public profile list and private owner view stay separate', async () => {
    const questions = [{ questionText: 'Which number is smaller?', questionType: 'multiple_choice', correctAnswer: 'A',
      options: [{ text: '1', isCorrect: true }, { text: '2' }] }];
    for (const visibility of ['public', 'private', 'unlisted']) {
      expect(await author.post('/api/v1/quiz/manual', {
        visibility, title: visibility + ' profile fixture', questions, tags: [visibility + '-profile-fixture'],
      }), 201);
    }
    const route = '/api/v1/users/' + writer.username + '/quizzes';
    for (const actor of [author, outsider]) {
      const result = await actor.get(route);
      expect(result, 200);
      assert.deepEqual(result.data.data.quizzes.map(quiz => quiz.visibility), ['public']);
    }
    const ownerView = await author.get(route + '?visibility=private');
    expect(ownerView, 200);
    assert.deepEqual(ownerView.data.data.quizzes.map(quiz => quiz.visibility), ['private']);
    expect(await outsider.get(route + '?visibility=private'), 403);
    const tags = await outsider.get('/api/v1/search/trending-tags?order=recent&limit=30');
    expect(tags, 200);
    assert.ok(tags.data.data.tags.some(tag => tag.tag === 'public-profile-fixture'));
    assert.ok(tags.data.data.tags.every(tag => Object.keys(tag).length === 1 && !['private-profile-fixture', 'unlisted-profile-fixture'].includes(tag.tag)));
  });

  await t.test('clearing and removing a chat only affect the requesting participant', async () => {
    const started = await author.post('/api/v1/messages/start', { recipientId: other.userId, initialMessage: 'Only the author will clear this' });
    expect(started, 200);
    const { conversation, message } = started.data.data;
    const root = '/api/v1/messages/conversations/' + conversation._id;
    const inbox = '/api/v1/messages/conversations';
    const contains = response => response.data.data.conversations.some(item => item._id === conversation._id);
    expect(await recipient.post(root + '/clear', {}), 404);
    expect(await recipient.delete(root), 404);

    expect(await author.post(root + '/clear', {}), 200);
    const cleared = await author.get(root);
    expect(cleared, 200);
    assert.deepEqual(cleared.data.data.messages, []);
    assert.deepEqual((await author.get(root + '?match=closest&q=clear')).data.data.messages, []);
    expect(await author.get(root + '?before=' + message._id), 400);
    assert.equal((await outsider.get(root)).data.data.messages[0]._id, message._id);
    assert.ok(contains(await author.get(inbox)));

    expect(await author.delete(root), 200);
    assert.equal(contains(await author.get(inbox)), false);
    assert.ok(contains(await outsider.get(inbox)));
    expect(await outsider.post(root + '/messages', { text: 'New message after removal' }), 201);
    assert.ok(contains(await author.get(inbox)));
    assert.deepEqual((await author.get(root)).data.data.messages.map(item => item.text), ['New message after removal']);
  });

  await t.test('SDK creates and edits private drafts through the live API', async () => {
    const client = new QuizFocusClient({ baseUrl: author.baseUrl, accessToken: () => author.token });
    const draft = await client.challenges.createDraft({ title: 'SDK live challenge' }, { idempotencyKey: randomUUID() });
    assert.equal(draft.visibility, 'private');
    assert.equal(draft.kind, 'challenge');
    await client.drafts.update(draft.id, { title: 'SDK challenge revised' }, { idempotencyKey: randomUUID() });
    assert.equal((await client.drafts.get(draft.id)).title, 'SDK challenge revised');
    assert.equal((await client.challenges.listDrafts({ search: 'SDK challenge revised' })).drafts[0].id, draft.id);
  });

  await t.test('written answers autosave, clear and submit without locking a ranked attempt early', async () => {
    const challenge = await author.post('/api/v1/challenges', {
      title: 'Written answer fixture', durationMinutes: 10, deadlineAt: new Date(Date.now() + 600_000).toISOString(),
      questions: [{ questionType: 'short_answer', questionText: 'Type the word orange.', correctAnswer: 'orange' }],
    });
    expect(challenge, 201);
    const id = challenge.data.data.challengeId;
    const started = await recipient.post(`/api/v1/quiz/${id}/attempt`, {});
    expect(started, 201);
    const attempt = started.data.data.attempt;
    const route = `/api/v1/quiz/${id}/attempt/${attempt._id}`;
    const now = Date.now() - 2000;
    const sync = (selectedAnswer, seconds) => {
      const submittedAt = new Date(now + seconds * 1000).toISOString();
      return recipient.put(route + '/sync-progress', { questionStates: [{
        questionId: attempt.answers[0].questionId, selectedAnswer, submittedAt, lastClientUpdatedAt: submittedAt,
      }] });
    };
    const typed = await sync('or', 0);
    expect(typed, 200);
    assert.equal(typed.data.data.attempt.answers[0].selectedAnswer, 'or');
    assert.equal(typed.data.data.attempt.answers[0].isLocked, false);
    const cleared = await sync(null, 1);
    expect(cleared, 200);
    assert.equal(cleared.data.data.attempt.answers[0].selectedAnswer, null);
    const stale = await sync('or', 0);
    expect(stale, 200);
    assert.equal(stale.data.data.attempt.answers[0].selectedAnswer, null);
    const final = await recipient.put(route, { questionStates: [{
      questionId: attempt.answers[0].questionId, selectedAnswer: 'orange', submittedAt: new Date().toISOString(),
    }] });
    expect(final, 200);
    assert.equal(final.data.data.attempt.answers[0].selectedAnswer, 'orange');
    assert.equal(final.data.data.score, null);
  });

  await t.test('chat uploads require a visible message and its conversation membership', async () => {
    const started = await author.post('/api/v1/messages/start', { recipientId: reader.userId, initialMessage: 'Attachment fixture' });
    assert.ok([200, 201].includes(started.status), JSON.stringify(started.data));
    const conversationId = started.data.data.conversation._id;
    const root = `/api/v1/media/chat/${conversationId}`;
    const form = new FormData();
    form.set('kind', 'document');
    form.set('file', new Blob(['Private text attachment'], { type: 'text/plain' }), 'private.txt');
    const response = await fetch(author.baseUrl + root + '/attachments', {
      method: 'POST', body: form, headers: { Authorization: 'Bearer ' + author.token },
    });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const asset = (await response.json()).data;
    expect(await recipient.get(root + '/attachments/' + asset.id), 404);
    const metadata = await author.get(root + '/attachments/' + asset.id);
    expect(metadata, 200);
    const proof = metadata.data.data.proof;
    const send = `/api/v1/messages/conversations/${conversationId}/messages`;
    expect(await recipient.post(send, { attachmentProof: proof }), 400);
    const second = await author.post('/api/v1/messages/start', { recipientId: other.userId, initialMessage: 'Second conversation' });
    expect(await author.post(`/api/v1/messages/conversations/${second.data.data.conversation._id}/messages`, { attachmentProof: proof }), 400);
    const sent = await author.post(send, { attachmentProof: proof, text: 'Review this attachment', clientMessageId: randomUUID() });
    expect(sent, 201);
    const message = sent.data.data.message;
    assert.equal(message.media.assetId, asset.id);
    assert.equal(message.text, 'Review this attachment');
    assert.equal(message.attachmentProof, undefined);
    const content = root + '/messages/' + message._id + '/attachments/' + asset.id;
    expect(await outsider.get(content), 404);
    expect(await recipient.get('/api/v1/media/assets/' + asset.id + '/access'), 404);
    const accessible = await fetch(recipient.baseUrl + content, {
      headers: { Authorization: 'Bearer ' + recipient.token, Range: 'bytes=0-6' },
    });
    assert.equal(accessible.status, 206);
    assert.equal(accessible.headers.get('content-disposition'), 'attachment; filename="private.txt"');
    assert.equal(await accessible.text(), 'Private');
    const videoUpload = await uploadFixture(author, 'gesture-a.mp4', {
      kind: 'video', endpoint: root + '/attachments', key: null,
    });
    expect(videoUpload, 202);
    const videoId = videoUpload.data.data.id;
    let video;
    for (let tries = 0; tries < 30; tries++) {
      const status = await author.get(root + '/attachments/' + videoId);
      expect(status, 200);
      video = status.data.data;
      if (video.status === 'ready' || video.status === 'failed') break;
      await delay(500);
    }
    assert.equal(video?.status, 'ready');
    const videoMessage = await author.post(send, { attachmentProof: video.proof });
    expect(videoMessage, 201);
    assert.equal(videoMessage.data.data.message.type, 'video');
    const videoUrl = root + '/messages/' + videoMessage.data.data.message._id + '/attachments/' + videoId;
    const playback = await fetch(recipient.baseUrl + videoUrl, {
      headers: { Authorization: 'Bearer ' + recipient.token, Range: 'bytes=0-63' },
    });
    assert.equal(playback.status, 206);
    assert.equal(playback.headers.get('content-type'), 'video/mp4');
    assert.equal((await playback.arrayBuffer()).byteLength, 64);
    expect(await author.delete(`/api/v1/messages/${message._id}`), 200);
    expect(await recipient.get(content), 404);
  });

  await t.test('CSV and Excel attachments download to authorized recipients', async () => {
    const requireFromParser = createRequire(new URL('../../services/parser-service/package.json', import.meta.url));
    const xlsx = requireFromParser('xlsx');
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['Question', 'Answer'], ['2 + 2', 4]]), 'Questions');
    const started = await author.post('/api/v1/messages/start', { recipientId: reader.userId, initialMessage: 'Spreadsheet fixture' });
    assert.ok([200, 201].includes(started.status), JSON.stringify(started.data));
    const conversationId = started.data.data.conversation._id;
    const root = `/api/v1/media/chat/${conversationId}`;
    for (const [name, bytes] of [
      ['questions.csv', Buffer.from('Question,Answer\n2 + 2,4\n')],
      ['questions.xlsx', xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })],
    ]) {
      const form = new FormData();
      form.set('kind', 'document');
      form.set('file', new Blob([bytes]), name);
      const uploaded = await fetch(author.baseUrl + root + '/attachments', {
        method: 'POST', body: form, headers: { Authorization: 'Bearer ' + author.token },
      });
      const body = await uploaded.json();
      assert.equal(uploaded.status, 201, JSON.stringify(body));
      const asset = body.data;
      const metadata = await author.get(root + '/attachments/' + asset.id);
      expect(metadata, 200);
      const sent = await author.post(`/api/v1/messages/conversations/${conversationId}/messages`, {
        attachmentProof: metadata.data.data.proof, clientMessageId: randomUUID(),
      });
      expect(sent, 201);
      const content = root + '/messages/' + sent.data.data.message._id + '/attachments/' + asset.id;
      expect(await outsider.get(content), 404);
      const download = await fetch(recipient.baseUrl + content, { headers: { Authorization: 'Bearer ' + recipient.token } });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get('content-disposition'), `attachment; filename="${name}"`);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    }
  });
});
