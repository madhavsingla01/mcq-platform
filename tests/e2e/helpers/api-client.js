/**
 * QuizFocus E2E API Client
 * Manages HTTP communications with the API Gateway, handling cookie sessions,
 * CSRF tokens, headers, and authentication state isolation.
 */

export class ApiClient {
  constructor(baseUrl = process.env.API_GATEWAY_URL || 'http://127.0.0.1:5000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookies = new Map();
    this.token = null;
    // Set default CSRF token
    this.setCookie('csrfToken', 'e2e_csrf_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      this.cookies.set('accessToken', token);
    }
  }

  setCookie(name, value) {
    this.cookies.set(name, value);
    if (name === 'accessToken') {
      this.token = value;
    }
  }

  getCookie(name) {
    return this.cookies.get(name);
  }

  clearSession() {
    this.cookies.clear();
    this.token = null;
    this.setCookie('csrfToken', 'e2e_csrf_token');
  }

  _parseSetCookie(headers) {
    const rawCookies = headers.getSetCookie ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const raw of rawCookies) {
      if (!raw) continue;
      const parts = raw.split(';')[0].split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        this.cookies.set(key, val);
        if (key === 'accessToken') {
          this.token = val;
        }
      }
    }
  }

  _buildCookieHeader() {
    const pairs = [];
    for (const [key, val] of this.cookies.entries()) {
      pairs.push(`${key}=${val}`);
    }
    return pairs.join('; ');
  }

  async request(method, path, options = {}) {
    const {
      body,
      headers = {},
      query,
      expectedStatus,
      raw = false,
    } = options;

    let urlStr = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    if (query && Object.keys(query).length > 0) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          q.append(k, String(v));
        }
      }
      urlStr += (urlStr.includes('?') ? '&' : '?') + q.toString();
    }

    const reqHeaders = {
      'Accept': 'application/json',
      ...headers,
    };

    if (body !== undefined && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const cookieHeader = this._buildCookieHeader();
    if (cookieHeader) {
      reqHeaders['Cookie'] = cookieHeader;
    }

    const csrf = this.cookies.get('csrfToken') || 'e2e_csrf_token';
    if (!reqHeaders['x-csrf-token']) {
      reqHeaders['x-csrf-token'] = csrf;
    }

    if (this.token && !reqHeaders['Authorization']) {
      reqHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    const fetchOptions = {
      method,
      headers: reqHeaders,
      redirect: 'manual',
    };

    if (body !== undefined) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(urlStr, fetchOptions);
    } catch (err) {
      throw new Error(`[ApiClient Request Failed] ${method} ${urlStr}: ${err.message}`);
    }

    this._parseSetCookie(response.headers);

    const status = response.status;
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = await response.text();
      } catch {
        data = '';
      }
    }

    if (expectedStatus !== undefined) {
      const statusArr = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      if (!statusArr.includes(status)) {
        throw new Error(
          `Expected HTTP status ${statusArr.join(' or ')} but got ${status} on ${method} ${urlStr}. Response: ${
            typeof data === 'object' ? JSON.stringify(data) : String(data).slice(0, 300)
          }`
        );
      }
    }

    return {
      status,
      headers: response.headers,
      data,
      ok: response.ok,
    };
  }

  get(path, options = {}) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  /** Register a new test account; never impersonate a pre-existing account. */
  async registerTestUser(prefix = 'testuser') {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    const username = `${prefix}_${timestamp}_${rand}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = `${username}@example.com`;
    const password = 'Password123!';
    const name = `Test User ${rand}`;

    const res = await this.post('/api/v1/auth/register', {
      name,
      username,
      email,
      password,
    });

    let userId = res.data?.data?.user?._id || res.data?.data?.user?.id;
    let user = res.data?.data?.user;

    if (!res.ok || !userId) throw new Error('Test registration failed: ' + res.status + ' ' + (res.data?.message || 'missing user'));

    return {
      name,
      username: user?.username || username,
      email: user?.email || email,
      password,
      userId,
      user,
      response: res,
    };
  }
}

export const defaultApiClient = new ApiClient();
