import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { ApiClient } from '../e2e/helpers/api-client.js';

const authRequire = createRequire(new URL('../../services/auth-service/package.json', import.meta.url));
const webRequire = createRequire(new URL('../../apps/desktop-web/package.json', import.meta.url));
const jwt = authRequire('jsonwebtoken');
const { MongoClient, ObjectId } = authRequire('mongoose').mongo;
const { io } = webRequire('socket.io-client');
const authPath = '/api/v1/auth';
const status = (response, expected) => assert.equal(response.status, expected, JSON.stringify(response.data));

test('Step 03 identity and privacy controls through the gateway and direct services', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const mongo = await new MongoClient(process.env.MONGO_URI).connect();
  t.after(() => mongo.close());
  const db = mongo.db();
  const client = new ApiClient();
  const user = await client.registerTestUser('identity');
  const userId = new ObjectId(user.userId);
  const users = db.collection('users');

  await t.test('login supports username and cookie boundaries reject unsafe origins', async () => {
    const body = { identifier: user.username, password: user.password };
    for (const url of [process.env.GATEWAY_URL, process.env.AUTH_SERVICE_URL]) {
      const response = await fetch(url + authPath + '/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 403);
    }
    const signedIn = await client.post(authPath + '/login', body);
    status(signedIn, 200);
    assert.match(signedIn.headers.getSetCookie().find(cookie => cookie.startsWith('accessToken=')), /HttpOnly/i);
    assert.equal(signedIn.data.data.user.password, undefined);
    assert.equal(signedIn.data.data.user.refreshToken, undefined);
    const wrong = await client.post(authPath + '/login', { ...body, password: 'wrong password' });
    const absent = await client.post(authPath + '/login', { ...body, identifier: 'no-such-security-test-user' });
    status(wrong, 401);
    status(absent, 401);
    assert.equal(wrong.data.message, absent.data.message);
    status(await client.post(authPath + '/register', {
      name: 'Long UTF password', email: 'long-utf-password@example.test', password: '🔑'.repeat(19),
    }), 400);
  });

  await t.test('legacy refresh migrates once and concurrent replay loses without clearing cookies', async () => {
    const previous = client.getCookie('refreshToken');
    await users.updateOne({ _id: userId }, { $set: { refreshToken: previous } });
    const csrf = client.getCookie('csrfToken');
    const headers = { Cookie: `refreshToken=${previous}; csrfToken=${csrf}`, 'x-csrf-token': csrf };
    const refresh = () => fetch(process.env.GATEWAY_URL + authPath + '/refresh', { method: 'POST', headers });
    const responses = await Promise.all([refresh(), refresh()]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
    const winner = responses.find(response => response.ok);
    assert.equal(responses.find(response => !response.ok).headers.getSetCookie().length, 0);
    client._parseSetCookie(winner.headers);
    assert.notEqual(client.getCookie('refreshToken'), previous);
    const stored = await users.findOne({ _id: userId }, { projection: { refreshToken: 1 } });
    assert.match(stored.refreshToken, /^sha256:[a-f0-9]{64}$/);
    const logout = await fetch(process.env.GATEWAY_URL + authPath + '/logout', { method: 'POST', headers });
    assert.equal(logout.status, 200);
    status(await client.get(authPath + '/me'), 200);
    status(await client.post(authPath + '/refresh', {}), 200);
  });

  await t.test('signed malformed, scoped, expired and non-HS256 tokens are rejected', async () => {
    const claims = { id: user.userId, tokenVersion: 0 };
    const sign = (payload, options) => jwt.sign(payload, process.env.JWT_SECRET, options);
    const signed = sign(claims, { expiresIn: '5m' });
    const [header, payload, signature] = signed.split('.');
    const invalid = [
      [header, payload, (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)].join('.'),
      sign(claims, { expiresIn: '5m', algorithm: 'HS384' }),
      sign({ ...claims, scope: 'clip' }, { expiresIn: '5m' }),
      sign({ ...claims, tokenVersion: '0' }, { expiresIn: '5m' }),
      sign({ ...claims, id: 'not-an-id' }, { expiresIn: '5m' }),
      sign(claims, { expiresIn: -1 }),
      sign(claims),
    ];
    for (const token of invalid) {
      const response = await fetch(process.env.GATEWAY_URL + authPath + '/me', { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 401);
    }
  });

  await t.test('delegated permissions stay scoped and global role changes revoke prior sessions', async () => {
    const root = new ApiClient();
    const delegate = new ApiClient();
    const operator = new ApiClient();
    const [rootUser, delegateUser, operatorUser] = await Promise.all([
      root.registerTestUser('platformroot'),
      delegate.registerTestUser('delegated'),
      operator.registerTestUser('roleoperator'),
    ]);
    await users.updateOne({ _id: new ObjectId(rootUser.userId) }, { $set: { role: 'admin' } });
    await db.collection('adminroles').updateOne(
      { slug: 'super_admin' }, { $set: { name: 'Legacy global membership', permissions: ['manage_users', 'manage_roles'] } },
      { upsert: true },
    );
    await db.collection('adminroles').insertOne({
      slug: 'verification_delegate', name: 'Verification delegate', permissions: ['manage_users', 'manage_roles', 'suspend_users', '*'],
    });
    await db.collection('adminmemberships').insertMany([
      { userId: new ObjectId(delegateUser.userId), roleSlugs: ['verification_delegate'] },
      { userId: new ObjectId(operatorUser.userId), roleSlugs: ['super_admin'], notes: 'Promoted via make-admin script' },
    ]);

    const admin = '/api/v1/admin';
    const operatorPath = `${admin}/users/${operatorUser.userId}`;
    const rolePath = operatorPath + '/role';
    status(await delegate.get(`${admin}/users`), 200);
    status(await delegate.get(`${admin}/audit-logs`), 403);
    status(await delegate.post(rolePath, { role: 'admin' }), 403);
    status(await operator.get(`${admin}/overview`), 403);
    status(await root.post(rolePath, { role: 'admin' }), 200);
    status(await operator.get(authPath + '/me'), 401);
    status(await operator.post(authPath + '/refresh', {}), 401);
    status(await operator.post(authPath + '/login', { email: operatorUser.email, password: operatorUser.password }), 200);
    status(await operator.get(`${admin}/overview`), 200);
    status(await root.post(operatorPath + '/suspend', { reason: 'Verification restriction' }), 200);
    status(await delegate.post(operatorPath + '/restore', {}), 403);
    status(await root.post(operatorPath + '/restore', {}), 200);
    status(await operator.get(authPath + '/me'), 401);
    status(await operator.post(authPath + '/login', { email: operatorUser.email, password: operatorUser.password }), 200);

    status(await root.post(rolePath, { role: 'user' }), 200);
    status(await operator.get(`${admin}/overview`), 401);
    status(await operator.post(authPath + '/login', { email: operatorUser.email, password: operatorUser.password }), 200);
    status(await operator.get(authPath + '/me'), 200);
    status(await operator.get(`${admin}/overview`), 403);
    assert.equal(await db.collection('adminmemberships').countDocuments({ userId: new ObjectId(operatorUser.userId) }), 1);

    const rootDetails = await root.get(operatorPath);
    status(rootDetails, 200);
    assert.ok(rootDetails.data.data.auditLogs.some(event => event.action === 'user_role_change'));
    const delegateDetails = await delegate.get(operatorPath);
    status(delegateDetails, 200);
    assert.deepEqual(delegateDetails.data.data.auditLogs, []);
    const delegateOverview = await delegate.get(`${admin}/overview`);
    status(delegateOverview, 200);
    assert.deepEqual(delegateOverview.data.data.recentAuditLogs, []);
  });

  await t.test('cookie writes require a CSRF pair across Auth, Admin, Challenge and Media', async () => {
    const quizId = new ObjectId();
    const headers = { Cookie: `accessToken=${client.token}`, 'Content-Type': 'application/json' };
    for (const [url, path, method] of [
      [process.env.AUTH_SERVICE_URL, authPath + '/me', 'PATCH'],
      [process.env.ADMIN_SERVICE_URL, `/api/v1/admin/content/${quizId}/restrict`, 'POST'],
      [process.env.CHALLENGE_SERVICE_URL, '/api/v1/challenges', 'POST'],
      [process.env.MEDIA_SERVICE_URL, '/api/v1/media/validate-url', 'POST'],
    ]) {
      const response = await fetch(url + path, { method, headers, body: '{}' });
      assert.equal(response.status, 403, path);
      assert.match((await response.json()).message, /csrf/i, path);
    }
  });

  await t.test('revocation rejects old and legacy access tokens and disconnects an idle socket', async () => {
    const oldAccess = client.token;
    const legacyAccess = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const socket = io(process.env.GATEWAY_URL, {
      auth: { token: oldAccess }, transports: ['websocket'], reconnection: false, autoConnect: false,
    });
    try {
      const connected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
      socket.connect();
      await connected;
      const disconnected = once(socket, 'disconnect', { signal: AbortSignal.timeout(10000) });
      status(await client.post(authPath + '/me/sessions/revoke', { currentPassword: user.password }), 200);
      await disconnected;
      for (const token of [oldAccess, legacyAccess]) {
        for (const path of [authPath + '/me', '/api/v1/quiz/my', '/api/v1/admin/overview', '/api/v1/media/assets', '/api/v1/messages/unread-count']) {
          const response = await fetch(process.env.GATEWAY_URL + path, { headers: { Authorization: `Bearer ${token}` } });
          assert.equal(response.status, 401, path);
        }
      }
      status(await client.get(authPath + '/me'), 200);
    } finally {
      socket.disconnect();
    }
  });

  await t.test('notification listing and mark-read redact content after restriction', async () => {
    const owner = new ApiClient();
    const author = await owner.registerTestUser('notificationauthor');
    const title = 'Private notification fixture';
    const draft = await owner.post('/api/v1/quiz/manual', { title, isDraft: true, questions: [{
      questionText: 'Which is one?', options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }], correctAnswer: 'A',
    }] });
    status(draft, 201);
    const quizId = draft.data.data.quizId;
    status(await owner.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' }), 200);
    const comment = await client.post(`/api/v1/social/quizzes/${quizId}/comments`, { body: 'Historical comment content' });
    status(comment, 201);
    const commentId = comment.data.data.comment._id;
    status(await owner.post(`/api/v1/social/quizzes/${quizId}/comments`, {
      body: 'Historical reply content', parentComment: commentId,
    }), 201);
    const path = '/api/v1/social/notifications';
    const before = await client.get(path);
    status(before, 200);
    const notification = before.data.data.notifications.find(item => item.quiz?.title === title);
    assert.ok(notification);
    assert.equal(notification.comment.body, 'Historical reply content');
    await db.collection('quizzes').updateOne({ _id: new ObjectId(quizId), uploader: new ObjectId(author.userId) },
      { $set: { visibility: 'private', isPublic: false, isRestricted: true } });
    const after = await client.get(path);
    status(after, 200);
    const redacted = after.data.data.notifications.find(item => item._id === notification._id);
    assert.deepEqual([redacted.quiz, redacted.comment, redacted.metadata], [null, null, {}]);
    status(await client.post(`/api/v1/social/comments/${commentId}/like`, {}), 404);
    status(await owner.patch(`${path}/${notification._id}/read`, {}), 404);
    const marked = await client.patch(`${path}/${notification._id}/read`, {});
    status(marked, 200);
    assert.deepEqual(Object.keys(marked.data.data.notification).sort(), ['_id', 'readAt']);
  });

  await t.test('account deletion replaces the password hash and revokes browser credentials', async () => {
    const oldAccess = client.token;
    const before = await users.findOne({ _id: userId }, { projection: { password: 1 } });
    status(await client.delete(authPath + '/me'), 200);
    const after = await users.findOne({ _id: userId }, { projection: { isDeleted: 1, password: 1, refreshToken: 1 } });
    assert.equal(after.isDeleted, true);
    assert.equal(after.refreshToken, null);
    assert.match(after.password, /^\$2[aby]\$12\$/);
    assert.notEqual(after.password, before.password);
    const response = await fetch(process.env.GATEWAY_URL + authPath + '/me', { headers: { Authorization: `Bearer ${oldAccess}` } });
    assert.equal(response.status, 401);
  });
});
