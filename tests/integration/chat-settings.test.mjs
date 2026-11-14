import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { ApiClient } from '../e2e/helpers/api-client.js';

const requireAuth = createRequire(new URL('../../services/auth-service/package.json', import.meta.url));
const requireWeb = createRequire(new URL('../../apps/desktop-web/package.json', import.meta.url));
const { MongoClient, ObjectId } = requireAuth('mongoose').mongo;
const jwt = requireAuth('jsonwebtoken');
const { io } = requireWeb('socket.io-client');

test('real HTTP, MongoDB and socket messaging/settings contracts', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/,
    'Run via npm run test:integration; this suite only accepts the disposable verification database.');
  const mongo = new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  const db = mongo.db();
  const clients = [new ApiClient(), new ApiClient(), new ApiClient()];
  const [alice, bob, outsider] = clients;
  const users = [];
  for (let i = 0; i < clients.length; i++) users.push(await clients[i].registerTestUser(`chat${i}`));
  const [a, b, c] = users.map(u => u.userId);
  const sockets = [];
  t.after(async () => { sockets.forEach(socket => socket.disconnect()); await mongo.close(); });
  const expectStatus = (response, status) => assert.equal(response.status, status, JSON.stringify(response.data));
  const connect = async client => {
    const socket = io(process.env.API_GATEWAY_URL, { auth: { token: client.token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 10000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', error => { clearTimeout(timer); reject(error); });
    });
    return socket;
  };
  const request = (socket, event, payload) => new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
  });
  const nextEvent = (socket, event, matches) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Expected ${event} event was not received`));
    }, 5000);
    const handler = data => {
      if (!matches(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
  let conv;
  let firstMessage;
  let aliceSocket;
  let bobSocket;

  await t.test('unauthenticated requests fail and a fresh inbox is empty', async () => {
    expectStatus(await new ApiClient().get('/api/v1/messages/conversations'), 401);
    const empty = await outsider.get('/api/v1/messages/conversations');
    expectStatus(empty, 200);
    assert.deepEqual(empty.data.data.conversations, []);
  });

  await t.test('settings validate types and preserve independent concurrent preferences', async () => {
    for (const preferences of [{ mystery: true }, { messagingReadReceipts: 'false' }, [], { theme: 'invalid' }]) {
      expectStatus(await alice.patch('/api/v1/auth/me', { preferences }), 400);
    }
    const updates = await Promise.all([
      alice.patch('/api/v1/auth/me', { preferences: { notifications: { directMessages: false } } }),
      alice.patch('/api/v1/auth/me', { preferences: { messagingSendOnEnter: false, soundCues: true } }),
    ]);
    updates.forEach(response => expectStatus(response, 200));
    const prefs = (await alice.get('/api/v1/auth/me')).data.data.user.preferences;
    assert.equal(prefs.notifications.directMessages, false);
    assert.equal(prefs.messagingSendOnEnter, false);
    assert.equal(prefs.soundCues, true);
  });

  await t.test('concurrent direct chat starts and send retries create one record', async () => {
    const starts = await Promise.all(Array.from({ length: 3 }, () => alice.post('/api/v1/messages/start', { recipientId: b })));
    starts.forEach(response => expectStatus(response, 200));
    conv = starts[0].data.data.conversation._id;
    assert.equal(new Set(starts.map(response => response.data.data.conversation._id)).size, 1);
    const responses = await Promise.all(Array.from({ length: 3 }, () => alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'A message [literal]', clientMessageId: 'retry-message-123' })));
    responses.forEach(response => expectStatus(response, 201));
    firstMessage = responses[0].data.data.message._id;
    assert.equal(new Set(responses.map(response => response.data.data.message._id)).size, 1);
    assert.equal(await db.collection('messages').countDocuments({ sender: new ObjectId(a), clientMessageId: 'retry-message-123' }), 1);
    assert.equal(responses[0].data.data.message.readBy, undefined);
  });

  await t.test('history starts at latest messages and handles identical timestamps without gaps', async () => {
    const ids = [firstMessage];
    for (let i = 0; i < 4; i++) {
      const response = await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: `History ${i}` });
      expectStatus(response, 201); ids.push(response.data.data.message._id);
    }
    await db.collection('messages').updateMany({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { $set: { createdAt: new Date('2026-01-01T00:00:00Z') } });
    const latest = await bob.get(`/api/v1/messages/conversations/${conv}`, { query: { limit: 2 } });
    expectStatus(latest, 200);
    assert.deepEqual(latest.data.data.messages.map(m => m._id), ids.slice(-2));
    const earlier = await bob.get(`/api/v1/messages/conversations/${conv}`, { query: { limit: 2, before: latest.data.data.pagination.nextCursor } });
    assert.deepEqual(earlier.data.data.messages.map(m => m._id), ids.slice(1, 3));
    const search = await bob.get(`/api/v1/messages/conversations/${conv}`, { query: { q: '[literal]' } });
    assert.deepEqual(search.data.data.messages.map(m => m._id), [firstMessage]);
    expectStatus(await bob.get(`/api/v1/messages/conversations/${conv}`, { query: { limit: -1 } }), 400);
  });

  await t.test('ranked message search paginates by relevance and skips hidden messages', async () => {
    const path = `/api/v1/messages/conversations/${conv}`;
    const ids = [];
    for (const text of ['Topography', 'Topography notes', 'Topograpyh', 'Topograpy']) {
      const response = await alice.post(`${path}/messages`, { text });
      expectStatus(response, 201);
      ids.push(response.data.data.message._id);
    }
    await db.collection('messages').updateMany({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { $set: { createdAt: new Date('2026-01-02T00:00:00Z') } });
    const query = { q: 'Topography', match: 'closest', limit: 1 };
    const found = [];
    let before;
    for (let page = 0; page < ids.length; page++) {
      const response = await bob.get(path, { query: { ...query, ...(before && { before }) } });
      expectStatus(response, 200);
      found.push(...response.data.data.messages.map(message => message._id));
      const pagination = response.data.data.pagination;
      assert.equal(pagination.hasMore, page < ids.length - 1);
      before = pagination.nextCursor;
      if (page === 0) expectStatus(await bob.delete(`/api/v1/messages/${ids[0]}?mode=me`), 200);
    }
    assert.deepEqual(found, [ids[0], ids[1], ids[3], ids[2]]);
    const hidden = await bob.get(path, { query });
    expectStatus(hidden, 200);
    assert.equal(hidden.data.data.messages[0]._id, ids[1]);
    expectStatus(await outsider.get(path, { query }), 404);
    expectStatus(await bob.get(path, { query: { ...query, before: 'invalid' } }), 400);
  });

  await t.test('nonparticipants cannot read, acknowledge, edit or delete messages', async () => {
    expectStatus(await outsider.get(`/api/v1/messages/conversations/${conv}`), 404);
    expectStatus(await outsider.patch(`/api/v1/messages/conversations/${conv}/read`, {}), 404);
    expectStatus(await outsider.patch(`/api/v1/messages/${firstMessage}`, { text: 'hijacked' }), 404);
    expectStatus(await outsider.delete(`/api/v1/messages/${firstMessage}`), 404);
    const unrelated = await alice.post('/api/v1/messages/start', { recipientId: c, initialMessage: 'Other conversation' });
    expectStatus(await alice.get(`/api/v1/messages/conversations/${conv}`, { query: { before: unrelated.data.data.message._id } }), 400);
  });

  await t.test('writes ignore spoofed identity and reject invalid input and CSRF', async () => {
    const endpoint = `/api/v1/messages/conversations/${conv}/messages`;
    expectStatus(await alice.post('/api/v1/messages/conversations/not-an-id/messages', { text: 'bad' }), 400);
    for (const body of [{ text: '   ' }, { text: 'x'.repeat(2001) }, { text: { $ne: 'test' } }, { replyTo: { messageId: { _id: firstMessage } }, text: 'invalid reference' }]) {
      expectStatus(await alice.post(endpoint, body), 400);
    }
    expectStatus(await alice.post(endpoint, { text: 'x'.repeat(33000) }), 413);
    expectStatus(await alice.post(endpoint, { text: 'bad token' }, { headers: { 'x-csrf-token': 'different' } }), 403);
    const accepted = await alice.post(endpoint, { text: '<img src=x onerror=alert(1)>', sender: b, senderId: b, conversation: c });
    expectStatus(accepted, 201);
    assert.equal(accepted.data.data.message.sender._id, a);
    assert.equal(accepted.data.data.message.conversation, conv);
    assert.equal(accepted.data.data.message.text, '<img src=x onerror=alert(1)>');
  });

  await t.test('socket and HTTP sends both enforce recipient permissions', async () => {
    aliceSocket = await connect(alice);
    bobSocket = await connect(bob);
    assert.equal((await request(aliceSocket, 'conversation:join', { conversationId: conv })).success, true);
    assert.equal((await request(bobSocket, 'conversation:join', { conversationId: conv })).success, true);
    expectStatus(await bob.patch('/api/v1/auth/me', { preferences: { allowMessagesFrom: 'none' } }), 200);
    expectStatus(await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'blocked' }), 403);
    assert.equal((await request(aliceSocket, 'message:send', { conversationId: conv, text: 'also blocked' })).success, false);
    await bob.patch('/api/v1/auth/me', { preferences: { allowMessagesFrom: 'followers' } });
    expectStatus(await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'not following' }), 403);
    await db.collection('follows').insertOne({ follower: new ObjectId(a), following: new ObjectId(b) });
    const response = await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'Follower permitted' });
    expectStatus(response, 201);
    await bob.patch('/api/v1/auth/me', { preferences: { allowMessagesFrom: 'everyone' } });
  });

  await t.test('typing and read privacy are enforced on the server, while unread counts clear', async () => {
    await bob.patch('/api/v1/auth/me', { preferences: { messagingTypingIndicators: false, messagingReadReceipts: false } });
    let typing = 0;
    let receipts = 0;
    const onTyping = () => typing++;
    const onRead = () => receipts++;
    aliceSocket.on('typing:update', onTyping);
    aliceSocket.on('message:read_status', onRead);
    assert.equal((await request(bobSocket, 'typing:start', { conversationId: conv })).success, true);
    expectStatus(await bob.patch(`/api/v1/messages/conversations/${conv}/read`, {}), 200);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(typing, 0); assert.equal(receipts, 0);
    assert.equal((await bob.get('/api/v1/messages/unread-count')).data.data.unreadCount, 0);
    const message = await db.collection('messages').findOne({ _id: new ObjectId(firstMessage) });
    assert.notEqual(message.deliveryStatus, 'read');
    aliceSocket.off('typing:update', onTyping); aliceSocket.off('message:read_status', onRead);
  });

  await t.test('participants receive live sends, replies, edits, reactions, read receipts and revocations', async () => {
    await bob.patch('/api/v1/auth/me', { preferences: { messagingTypingIndicators: true, messagingReadReceipts: true } });
    const key = 'live-delivery-check-123';
    const arrival = nextEvent(bobSocket, 'message:new', data => data.message?.clientMessageId === key);
    const sent = await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'Live original', clientMessageId: key });
    expectStatus(sent, 201);
    const id = sent.data.data.message._id;
    assert.equal((await arrival).message._id, id);

    const replyArrival = nextEvent(aliceSocket, 'message:new', data => data.message?.clientMessageId === 'live-reply-check-123');
    const reply = await request(bobSocket, 'message:send', {
      conversationId: conv, text: 'Live reply', clientMessageId: 'live-reply-check-123', replyTo: { messageId: id },
    });
    assert.equal(reply.success, true);
    assert.equal((await replyArrival).message.replyTo.text, 'Live original');
    // A transport retry must return the socket-created record without duplication.
    const retry = await bob.post(`/api/v1/messages/conversations/${conv}/messages`, {
      text: 'Live reply', clientMessageId: 'live-reply-check-123',
    });
    assert.equal(retry.data.data.message._id, reply.data._id);

    const editEvent = nextEvent(bobSocket, 'message:edited', data => data.messageId === id);
    expectStatus(await alice.patch(`/api/v1/messages/${id}`, { text: 'Live edited' }), 200);
    assert.equal((await editEvent).text, 'Live edited');

    const reactionEvent = nextEvent(aliceSocket, 'message:reaction_update', data => data.messageId === id);
    assert.equal((await request(bobSocket, 'message:reaction', { messageId: id, emoji: '👍' })).success, true);
    assert.equal((await reactionEvent).reactions[0].emoji, '👍');

    const receipt = nextEvent(aliceSocket, 'message:read_status', data => data.messageIds?.includes(id));
    expectStatus(await bob.patch(`/api/v1/messages/conversations/${conv}/read`, { messageIds: [id] }), 200);
    assert.equal((await receipt).readerId, b);

    const typing = nextEvent(aliceSocket, 'typing:update', data => data.user?._id === b && data.isTyping);
    assert.equal((await request(bobSocket, 'typing:start', { conversationId: conv })).success, true);
    assert.equal((await typing).conversationId, conv);

    const deletion = nextEvent(bobSocket, 'message:deleted', data => data.messageId === id);
    expectStatus(await alice.delete(`/api/v1/messages/${id}`), 200);
    assert.equal((await deletion).mode, 'everyone');
    const search = await bob.get(`/api/v1/messages/conversations/${conv}`, { query: { q: 'Live reply' } });
    assert.equal(search.data.data.messages[0].replyTo.text, 'This message was deleted');
  });

  await t.test('socket outsiders cannot join or mutate a private conversation', async () => {
    const socket = await connect(outsider);
    for (const [event, payload] of [
      ['conversation:join', { conversationId: conv }],
      ['message:send', { conversationId: conv, text: 'Unauthorized socket send' }],
      ['message:read', { conversationId: conv, messageIds: [firstMessage] }],
      ['message:edit', { messageId: firstMessage, text: 'Unauthorized edit' }],
      ['message:delete', { messageId: firstMessage }],
      ['message:reaction', { messageId: firstMessage, emoji: '👍' }],
    ]) assert.equal((await request(socket, event, payload)).success, false, event);
    const presence = await request(socket, 'presence:get', { userIds: [b] });
    assert.deepEqual(presence.data, {});
    socket.disconnect();
  });

  await t.test('reconnecting retrieves edits and per-user deletions made while offline', async () => {
    const sent = await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'Before connection gap' });
    const id = sent.data.data.message._id;
    const hidden = await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'Hidden during connection gap' });
    const hiddenId = hidden.data.data.message._id;
    bobSocket.disconnect();
    expectStatus(await alice.patch(`/api/v1/messages/${id}`, { text: 'Updated during connection gap' }), 200);
    expectStatus(await bob.delete(`/api/v1/messages/${hiddenId}`, { query: { mode: 'me' } }), 200);
    bobSocket = await connect(bob);
    assert.equal((await request(bobSocket, 'conversation:join', { conversationId: conv })).success, true);
    const history = await bob.get(`/api/v1/messages/conversations/${conv}`);
    expectStatus(history, 200);
    assert.equal(history.data.data.messages.find(message => message._id === id).text, 'Updated during connection gap');
    assert.equal(history.data.data.messages.some(message => message._id === hiddenId), false);
  });

  await t.test('edit policy, reactions and deletion preserve authorization and remove quoted content', async () => {
    expectStatus(await alice.patch(`/api/v1/messages/${firstMessage}`, { text: 'too late' }), 400);
    const sent = await alice.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'Revocable secret' });
    const id = sent.data.data.message._id;
    expectStatus(await alice.patch(`/api/v1/messages/${id}`, { text: 'Edited secret' }), 200);
    expectStatus(await bob.patch(`/api/v1/messages/${id}`, { text: 'not my message' }), 403);
    const reactions = await Promise.all([alice.post(`/api/v1/messages/${id}/reactions`, { emoji: '👍' }), bob.post(`/api/v1/messages/${id}/reactions`, { emoji: '🔥' })]);
    reactions.forEach(response => expectStatus(response, 200));
    assert.equal((await db.collection('messages').findOne({ _id: new ObjectId(id) })).reactions.length, 2);
    const quote = await bob.post(`/api/v1/messages/conversations/${conv}/messages`, { text: 'Reply', replyTo: { messageId: id, text: 'forged quote' } });
    assert.equal(quote.data.data.message.replyTo.text, 'Edited secret');
    expectStatus(await alice.delete(`/api/v1/messages/${id}`), 200);
    const stored = await db.collection('messages').findOne({ _id: new ObjectId(id) });
    assert.equal(stored.quiz, null); assert.equal(stored.link, null); assert.equal(stored.media, null);
    const reply = await db.collection('messages').findOne({ _id: new ObjectId(quote.data.data.message._id) });
    assert.equal(reply.replyTo.text, 'This message was deleted');
    let leaked = false;
    const onDelete = payload => { if (payload.mode === 'me') leaked = true; };
    aliceSocket.on('message:deleted', onDelete);
    expectStatus(await bob.delete(`/api/v1/messages/${firstMessage}`, { query: { mode: 'me' } }), 200);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(leaked, false);
    aliceSocket.off('message:deleted', onDelete);
  });

  await t.test('legacy share route cannot choose a random recipient or bypass privacy', async () => {
    const quizId = new ObjectId();
    await db.collection('quizzes').insertOne({ _id: quizId, title: 'Verification quiz', visibility: 'public', isPublic: true, uploader: new ObjectId(a), questionCount: 1 });
    expectStatus(await alice.post(`/api/v1/social/quizzes/${quizId}/share-direct`, { recipientUsername: 'nonexistent_member_99999' }), 404);
    await bob.patch('/api/v1/auth/me', { preferences: { allowMessagesFrom: 'none' } });
    expectStatus(await alice.post(`/api/v1/social/quizzes/${quizId}/share-direct`, { recipientId: b }), 403);
    await bob.patch('/api/v1/auth/me', { preferences: { allowMessagesFrom: 'everyone' } });
    const shared = await alice.post(`/api/v1/social/quizzes/${quizId}/share-direct`, { recipientId: b });
    expectStatus(shared, 201);
    const id = shared.data.data.messageId;
    const searchQuery = { q: 'Verificaton quiz', match: 'closest' };
    const available = await bob.get(`/api/v1/messages/conversations/${conv}`, { query: searchQuery });
    expectStatus(available, 200);
    assert.ok(available.data.data.messages.some(message => message._id === id));
    await db.collection('quizzes').updateOne({ _id: quizId }, { $set: { isRestricted: true } });
    expectStatus(await alice.post(`/api/v1/social/quizzes/${quizId}/share-direct`, { recipientId: b }), 403);
    const history = await bob.get(`/api/v1/messages/conversations/${conv}`);
    const preview = history.data.data.messages.find(message => message._id === id);
    assert.equal(preview.text, 'Quiz unavailable');
    const unavailable = await bob.get(`/api/v1/messages/conversations/${conv}`, { query: searchQuery });
    expectStatus(unavailable, 200);
    assert.ok(!unavailable.data.data.messages.some(message => message._id === preview._id));
    assert.equal(preview.quiz, null);
    assert.equal(preview.quizMetadata, null);
  });

  await t.test('active sessions can be listed and one device can be signed out', async () => {
    const secondDevice = new ApiClient();
    expectStatus(await secondDevice.post('/api/v1/auth/login', {
      email: users[0].email,
      password: users[0].password,
    }, { headers: {
      'x-client-location-latitude': '37.7749',
      'x-client-location-longitude': '-122.4194',
      'x-client-location-accuracy': '30',
      'x-client-locale': 'en-US',
      'x-client-timezone': 'America/Los_Angeles',
    } }), 200);

    const sessionList = await alice.get('/api/v1/auth/me/sessions');
    expectStatus(sessionList, 200);
    const activeSessions = sessionList.data.data.sessions;
    assert.equal(activeSessions.length, 2);
    assert.equal(activeSessions.filter(session => session.isCurrent).length, 1);

    const secondDeviceSessionId = JSON.parse(Buffer.from(secondDevice.token.split('.')[1], 'base64url').toString()).sid;
    const secondDeviceSession = activeSessions.find(session => session.sessionId === secondDeviceSessionId);
    assert.ok(secondDeviceSession);
    assert.equal(secondDeviceSession.isCurrent, false);
    assert.equal(secondDeviceSession.location.latitude, 37.7749);
    assert.equal(secondDeviceSession.location.longitude, -122.4194);
    assert.equal(secondDeviceSession.location.accuracy, 30);
    assert.ok(Date.parse(secondDeviceSession.location.capturedAt));
    assert.equal(secondDeviceSession.locale, 'en-US');
    assert.equal(secondDeviceSession.timeZone, 'America/Los_Angeles');

    expectStatus(await alice.post(`/api/v1/auth/me/sessions/${secondDeviceSessionId}/revoke`, {
      currentPassword: 'wrong-password',
    }), 400);
    assert.equal((await alice.get('/api/v1/auth/me/sessions')).data.data.sessions.length, 2);
    expectStatus(await alice.post(`/api/v1/auth/me/sessions/${secondDeviceSessionId}/revoke`, {
      currentPassword: users[0].password,
    }), 200);
    expectStatus(await secondDevice.get('/api/v1/auth/me'), 401);
    expectStatus(await alice.get('/api/v1/auth/me'), 200);
    assert.equal((await alice.get('/api/v1/auth/me/sessions')).data.data.sessions.length, 1);
  });

  await t.test('bootstrap upgrades an existing legacy browser into a tracked session', async () => {
    const legacy = new ApiClient();
    const legacyUser = await legacy.registerTestUser('legacy_session');
    const legacyRefreshToken = jwt.sign(
      { id: legacyUser.userId, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    const legacyAccessToken = jwt.sign(
      { id: legacyUser.userId, tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    await db.collection('users').updateOne(
      { _id: new ObjectId(legacyUser.userId) },
      {
        $set: {
          tokenVersion: 0,
          refreshToken: `sha256:${createHash('sha256').update(legacyRefreshToken).digest('hex')}`,
          sessions: [],
        },
      }
    );
    legacy.clearSession();
    legacy.setToken(legacyAccessToken);
    legacy.setCookie('refreshToken', legacyRefreshToken);

    const bootstrap = await legacy.get('/api/v1/auth/bootstrap');
    expectStatus(bootstrap, 200);
    assert.equal(bootstrap.data.data.authenticated, true);
    const active = await legacy.get('/api/v1/auth/me/sessions');
    expectStatus(active, 200);
    assert.equal(active.data.data.sessions.length, 1);
    assert.equal(active.data.data.sessions[0].isCurrent, true);
    assert.ok(JSON.parse(Buffer.from(legacy.token.split('.')[1], 'base64url').toString()).sid);
  });

  await t.test('session revocation requires password and invalidates HTTP and existing sockets', async () => {
    expectStatus(await alice.post('/api/v1/auth/me/sessions/revoke', { currentPassword: 'wrong-password' }), 400);
    const older = new ApiClient(); older.setToken(alice.token);
    expectStatus(await alice.post('/api/v1/auth/me/sessions/revoke', { currentPassword: users[0].password }), 200);
    expectStatus(await older.get('/api/v1/auth/me'), 401);
    expectStatus(await alice.get('/api/v1/auth/me'), 200);
    // The periodic session check may disconnect before the event handler can reply.
    if (aliceSocket.connected) {
      const controller = new AbortController();
      const disconnected = new Promise(resolve => {
        const onDisconnect = () => resolve({ success: false });
        aliceSocket.once('disconnect', onDisconnect);
        controller.signal.addEventListener('abort', () => aliceSocket.off('disconnect', onDisconnect), { once: true });
      });
      try {
        const response = await Promise.race([
          disconnected,
          request(aliceSocket, 'message:send', { conversationId: conv, text: 'revoked' }),
        ]);
        assert.equal(response.success, false);
      } finally {
        controller.abort();
      }
    }
    const history = await alice.get(`/api/v1/messages/conversations/${conv}`);
    expectStatus(history, 200);
    assert.equal(history.data.data.messages.some(message => message.text === 'revoked'), false);
  });
});
