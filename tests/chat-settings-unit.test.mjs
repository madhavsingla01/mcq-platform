import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePreferences, preferenceUpdates } from '../services/auth-service/dist/utils/preferences.js';
import { assertEditable, cursorCondition, deletionFields, paginationOptions, safeUrl, publicMessage } from '../services/message-service/src/services/messagePolicy.js';
import { mergeMessages, deletedMessage, applyMessageDeletion, applyReadReceipt, canEditMessage, writeDraft, readDraft } from '../apps/desktop-web/src/pages/Messages/chatState.js';
import { MemoryCache } from '../services/quiz-service/src/services/cache/memory-cache.js';

test('cache bounds memory, expires at TTL and coalesces concurrent queries', async () => {
  let now = 0;
  const cache = new MemoryCache(10, 2, () => now);
  cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
  assert.equal(cache.get('b'), null); assert.equal(cache.size(), 2);
  now = 10; assert.equal(cache.get('a'), null);
  let calls = 0;
  const values = await Promise.all(Array.from({ length: 20 }, () => cache.getOrSet('query', async () => { calls++; return 42; })));
  assert.equal(calls, 1); assert.equal(values.every(value => value === 42), true);
});
test('cache invalidation prevents a slow old response from repopulating stale data', async () => {
  const cache = new MemoryCache();
  let resolve;
  const query = cache.getOrSet('quiz:1', () => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  cache.delPattern('quiz:');
  resolve('old'); await query;
  assert.equal(cache.get('quiz:1'), null);
  await assert.rejects(cache.getOrSet('error', () => Promise.reject(new Error('failed'))));
  assert.equal(await cache.getOrSet('error', () => 'recovered'), 'recovered');
});

test('preferences allow supported partial changes and reject malformed/nested unsafe values', () => {
  const value = { messagingSendOnEnter: false, notifications: { directMessages: false } };
  assert.deepEqual(validatePreferences(value), value);
  assert.deepEqual(preferenceUpdates(value), { 'preferences.messagingSendOnEnter': false, 'preferences.notifications.directMessages': false });
  for (const input of [[], null, { soundCues: 'true' }, { notifications: { unknown: true } }, JSON.parse('{"__proto__":{"admin":true}}'), { panelWidths: { ai: Infinity } }]) {
    assert.throws(() => validatePreferences(input), error => error.statusCode === 400);
  }
});
test('message policies reject executable URLs, invalid pagination and expired edits', () => {
  for (const url of ['javascript:alert(1)', '//evil.example/file', 'https://user:pass@example.com']) assert.throws(() => safeUrl(url));
  assert.equal(safeUrl('/media/assets/example/image'), '/media/assets/example/image');
  for (const query of [{ before: 'a', after: 'b' }, { limit: 101 }, { q: {} }]) assert.throws(() => paginationOptions(query));
  const message = { sender: 'sender', createdAt: new Date(0) };
  assert.throws(() => assertEditable(message, 'sender', 900001));
  assert.throws(() => assertEditable(message, 'other', 0));
  assert.doesNotThrow(() => assertEditable(message, 'sender', 900000));
});
test('cursor uses a deterministic timestamp and ID tiebreaker', () => {
  const createdAt = new Date();
  assert.deepEqual(cursorCondition({ createdAt, _id: 'id' }, 'before'), {
    $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: 'id' } }],
  });
});
test('revoked message serialization strips attachments and internal read bookkeeping', () => {
  const source = { isDeleted: true, media: { url: 'private' }, quiz: {}, quizMetadata: {}, replyTo: {}, readBy: ['private'], deletedFor: ['private'] };
  const server = publicMessage(source);
  assert.equal(server.readBy, undefined); assert.equal(server.deletedFor, undefined);
  for (const result of [server, deletedMessage(source), deletionFields()]) {
    assert.equal(result.media, null); assert.equal(result.quizMetadata, null); assert.equal(result.replyTo, null);
  }
});
test('socket-first and HTTP acknowledgement reconciliation never duplicates optimistic messages', () => {
  const pending = { _id: 'temp-1', sender: { _id: 'alice' }, clientMessageId: 'request-1', createdAt: '2026-01-01', isOptimistic: true };
  const sent = { ...pending, _id: 'saved-1', sender: 'alice', isOptimistic: false };
  const state = mergeMessages(mergeMessages([pending], [sent]), [sent]);
  assert.equal(state.length, 1); assert.equal(state[0]._id, 'saved-1'); assert.equal(state[0].isOptimistic, false);
  assert.equal(mergeMessages(state, [{ ...sent, _id: 'different', sender: 'bob' }]).length, 2);
});
test('read receipt updates only identified own messages and edit policy handles tombstones', () => {
  const state = [{ _id: '1', sender: 'alice' }, { _id: '2', sender: 'alice' }, { _id: '3', sender: 'bob' }];
  const result = applyReadReceipt(state, { readerId: 'bob', messageIds: ['1'] }, 'alice');
  assert.equal(result[0].deliveryStatus, 'read'); assert.equal(result[1].deliveryStatus, undefined);
  assert.equal(result[2].deliveryStatus, undefined);
  assert.equal(canEditMessage({ type: 'text', isDeleted: true }), false);
});

test('live deletion removes quoted content even when search excludes the original message', () => {
  const original = { _id: 'secret', text: 'revoked text', media: { url: 'private' } };
  const reply = { _id: 'reply', text: 'public response', replyTo: { messageId: 'secret', text: 'revoked text' } };
  const history = applyMessageDeletion([original, reply], 'secret');
  assert.equal(history[0].isDeleted, true);
  assert.equal(history[0].media, null);
  assert.equal(history[1].replyTo, null);
  assert.equal(applyMessageDeletion([reply], 'secret')[0].replyTo, null);
  assert.deepEqual(applyMessageDeletion([original, reply], 'secret', 'me'), [reply]);
});
test('drafts are isolated by account and conversation and tolerate storage failures', () => {
  const storage = new Map();
  globalThis.sessionStorage = { setItem: (k,v) => storage.set(k,v), getItem: k => storage.get(k), removeItem: k => storage.delete(k) };
  writeDraft('alice', 'thread', 'private draft');
  assert.equal(readDraft('bob', 'thread'), ''); assert.equal(readDraft('alice', 'other'), '');
  assert.equal(readDraft('alice', 'thread'), 'private draft');
  writeDraft('alice', 'thread', ''); assert.equal(readDraft('alice', 'thread'), '');
  globalThis.sessionStorage = { getItem: () => { throw new Error('disabled'); } };
  assert.equal(readDraft('alice', 'thread'), '');
  delete globalThis.sessionStorage;
});
