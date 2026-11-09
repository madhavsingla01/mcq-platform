import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../e2e/helpers/api-client.js';

test('production Auth enforces origin, cookie, CSRF and refresh limits through the gateway', async () => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const base = process.env.GATEWAY_URL + '/api/v1/auth';
  const origin = 'http://127.0.0.1:5183';
  const browser = new ApiClient();
  const account = await browser.registerTestUser('productionauth');
  const preflight = await fetch(base + '/refresh', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-csrf-token' },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-csrf-token/i);

  const credentials = { email: account.email, password: account.password };
  const denied = await browser.post('/api/v1/auth/login', credentials, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.getSetCookie().length, 0);
  const login = await browser.post('/api/v1/auth/login', credentials, { headers: { Origin: origin } });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('access-control-allow-origin'), origin);
  assert.match(login.headers.get('cache-control'), /no-store/i);
  const cookies = login.headers.getSetCookie();
  for (const name of ['accessToken', 'refreshToken', 'csrfToken']) {
    const attributes = cookies.find(value => value.startsWith(name + '=')).split(';').slice(1).join(';');
    assert.match(attributes, /;?\s*Secure(?:;|$)/i);
    assert.match(attributes, /SameSite=None/i);
    assert.match(attributes, /Path=\/(?:;|$)/i);
    assert.equal(/HttpOnly/i.test(attributes), name !== 'csrfToken');
    assert.doesNotMatch(attributes, /Domain=/i);
  }

  const cookie = browser._buildCookieHeader();
  const missingCsrf = await fetch(base + '/refresh', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
  assert.equal(missingCsrf.status, 403);
  const refresh = await browser.post('/api/v1/auth/refresh', {}, { headers: { Origin: origin } });
  assert.equal(refresh.status, 200);
  const oldAccess = browser.token;
  const logout = await browser.post('/api/v1/auth/logout', {}, { headers: { Origin: origin } });
  assert.equal(logout.status, 200);
  assert.equal(logout.headers.getSetCookie().length, 3);
  for (const cookie of logout.headers.getSetCookie()) {
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/i);
    assert.doesNotMatch(cookie, /Max-Age=[1-9]/i);
  }
  const revoked = await fetch(base + '/me', { headers: { Authorization: 'Bearer ' + oldAccess } });
  assert.equal(revoked.status, 401);

  // One refresh was accepted above. The remaining address budget is shared
  // even when the caller rotates arbitrary identifiers and forwarded IPs.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(base + (attempt % 2 ? '/REFRESH/' : '/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${attempt + 1}` },
      body: JSON.stringify({ email: `refresh-bypass-${attempt}@example.test` }),
    });
    assert.equal(response.status, attempt === 49 ? 429 : 401);
    if (attempt === 49) assert.ok(Number(response.headers.get('retry-after')) > 0);
  }
});
