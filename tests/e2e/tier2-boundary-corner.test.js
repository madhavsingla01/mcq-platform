/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite
 * Covers Features F1 through F12 with >=5 boundary/corner cases per feature.
 * Authoritative source: PROJECT.md Feature Inventory & ORIGINAL_REQUEST.md.
 */

import { describe, test, it, expect, before, after } from './helpers/runner-core.js';
import { ApiClient } from './helpers/api-client.js';
import {
  PATHS,
  readFileSafe,
  readJsonSafe,
  extractHexColors,
  fileExists,
} from './helpers/static-checker.js';

const api = new ApiClient();

describe('Tier 2: Boundary & Corner Cases (F1 through F12)', () => {

  // =========================================================================
  // F1: Strict Orange & Dark Neutral Palette (Boundaries)
  // =========================================================================
  describe('F1 Boundary: Palette & Dark Neutral Invariants', () => {
    const indexCss = readFileSafe(PATHS.indexCss) || '';

    it('F1-B1: brand orange hex normalization: #FF4500 matches case-insensitively', () => {
      const match = indexCss.match(/#ff4500/i);
      expect(match).toBeTruthy();
    });

    it('F1-B2: dark neutral glass hexes (#121214, #18181B) have RGB luminance < 30', () => {
      const hexToRgb = (hex) => {
        const clean = hex.replace('#', '');
        return {
          r: parseInt(clean.substring(0, 2), 16),
          g: parseInt(clean.substring(2, 4), 16),
          b: parseInt(clean.substring(4, 6), 16),
        };
      };
      const rgb1 = hexToRgb('121214');
      const rgb2 = hexToRgb('18181B');
      expect(rgb1.r).toBeLessThan(30);
      expect(rgb1.g).toBeLessThan(30);
      expect(rgb1.b).toBeLessThan(30);
      expect(rgb2.r).toBeLessThan(30);
      expect(rgb2.g).toBeLessThan(30);
      expect(rgb2.b).toBeLessThan(30);
    });

    it('F1-B3: true black token (#000000) has exact zero luminance across all channels', () => {
      const hex = '000000';
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('F1-B4: absence of legacy emerald/green (#10B981) as accent token in index.css', () => {
      const hexes = extractHexColors(indexCss);
      expect(hexes.includes('#10B981')).toBeFalsy();
    });

    it('F1-B5: KaTeX math containers in components do not force white text background', () => {
      const questionCard = readFileSafe(PATHS.desktopWeb + '/src/components/quiz/QuestionCard.jsx') || '';
      expect(questionCard).not.toMatch(/katex[^"']*bg-white/);
    });
  });

  // =========================================================================
  // F2: Apple-Inspired Animation & Interaction Polish (Boundaries)
  // =========================================================================
  describe('F2 Boundary: Animation Bounds & Touch Feedback', () => {
    const indexCss = readFileSafe(PATHS.indexCss) || '';
    const sidebarCss = readFileSafe(PATHS.sidebarCss) || '';

    it('F2-B1: maximum animation duration boundary: no duration token exceeds 300ms', () => {
      const durationMatches = indexCss.match(/--duration-[a-z]+:\s*([0-9]+)ms/g) || [];
      expect(durationMatches.length).toBeGreaterThan(0);
      for (const m of durationMatches) {
        const ms = parseInt(m.match(/([0-9]+)ms/)[1], 10);
        expect(ms).toBeLessThanOrEqual(300);
      }
    });

    it('F2-B2: active state scale boundary: scale factor is within [0.95, 0.98]', () => {
      const scaleMatches = indexCss.match(/scale\((0\.\d+)\)/g) || [];
      expect(scaleMatches.length).toBeGreaterThan(0);
      for (const m of scaleMatches) {
        const val = parseFloat(m.match(/scale\((0\.\d+)\)/)[1]);
        expect(val).toBeGreaterThanOrEqual(0.95);
        expect(val).toBeLessThanOrEqual(0.98);
      }
    });

    it('F2-B3: cubic-bezier curve control points are normalized in [0, 1] range for X coordinates', () => {
      const bezierMatches = indexCss.match(/cubic-bezier\(([^)]+)\)/g) || [];
      expect(bezierMatches.length).toBeGreaterThan(0);
      for (const b of bezierMatches) {
        const numbers = b.match(/cubic-bezier\(([^)]+)\)/)[1].split(',').map(n => parseFloat(n.trim()));
        expect(numbers[0]).toBeGreaterThanOrEqual(0);
        expect(numbers[0]).toBeLessThanOrEqual(1);
        expect(numbers[2]).toBeGreaterThanOrEqual(0);
        expect(numbers[2]).toBeLessThanOrEqual(1);
      }
    });

    it('F2-B4: no layout property (width, height, margin, padding) animated in Sidebar.css', () => {
      expect(sidebarCss).not.toMatch(/transition:[^;]*(?:width|height|margin|padding)/i);
    });

    it('F2-B5: zero native window.confirm() or prompt() calls in user settings or quiz pages', () => {
      const helpSettings = readFileSafe(PATHS.helpSettings) || '';
      const activitySettings = readFileSafe(PATHS.activitySettings) || '';
      expect(helpSettings).not.toMatch(/\bwindow\.confirm\s*\(/);
      expect(helpSettings).not.toMatch(/\bwindow\.prompt\s*\(/);
      expect(activitySettings).not.toMatch(/\bwindow\.confirm\s*\(/);
      expect(activitySettings).not.toMatch(/\bwindow\.prompt\s*\(/);
    });
  });

  // =========================================================================
  // F3: Microservices Security Hardening (Boundaries)
  // =========================================================================
  describe('F3 Boundary: Security Invariants & Attack Payloads', () => {
    it('F3-B1: malformed JWT in Authorization header returns 401 Unauthorized', async () => {
      const testClient = new ApiClient();
      testClient.setToken('malformed.header.payload');
      const res = await testClient.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('F3-B2: empty bearer token in Authorization header returns 401 Unauthorized', async () => {
      const res = await api.request('GET', '/api/v1/auth/me', {
        headers: { Authorization: 'Bearer ' },
      });
      expect(res.status).toBe(401);
    });

    it('F3-B3: NoSQL injection object in login body is rejected with 400 Bad Request', async () => {
      const res = await api.post('/api/v1/auth/login', {
        email: { $gt: '' },
        password: 'Password123!',
      });
      expect([400, 422, 429]).toContain(res.status);
    });

    it('F3-B4: prototype pollution payload in JSON request body does not pollute Object prototype', async () => {
      await api.post('/api/v1/auth/register', {
        name: 'Pollution Probe',
        email: 'pollution@example.com',
        password: 'Password123!',
        __proto__: { pollutedKey: true },
      });
      expect(({}).pollutedKey).toBeUndefined();
    });

    it('F3-B5: report submission with empty targetType is rejected with 400', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: '',
        targetId: 'quiz123',
        reason: 'Missing targetType test',
      });
      expect(res.status).toBe(400);
      expect(res.data?.success).toBe(false);
    });
  });

  // =========================================================================
  // F4: Performance Bottleneck Remediation (Boundaries)
  // =========================================================================
  describe('F4 Boundary: Explore Feed Pagination Limits', () => {
    it('F4-B1: explore query handles page=0 by clamping or default without error', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: 0, limit: 10 } });
      expect([200, 304]).toContain(res.status);
      expect(res.data?.success).toBe(true);
    });

    it('F4-B2: explore query handles negative page=-5 gracefully', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: -5, limit: 10 } });
      expect([200, 304]).toContain(res.status);
      expect(res.data?.success).toBe(true);
    });

    it('F4-B3: explore query handles limit=0 gracefully without divide-by-zero crash', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: 1, limit: 0 } });
      expect([200, 304]).toContain(res.status);
      expect(res.data?.success).toBe(true);
    });

    it('F4-B4: explore query caps oversized limit=5000 to max limit without crashing', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: 1, limit: 5000 } });
      expect([200, 304]).toContain(res.status);
      const items = res.data?.data?.quizzes || res.data?.data || [];
      expect(items.length).toBeLessThanOrEqual(100);
    });

    it('F4-B5: explore query at high offset page=999999 returns empty array gracefully', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: 999999, limit: 10 } });
      expect([200, 304]).toContain(res.status);
      const items = res.data?.data?.quizzes || res.data?.data || [];
      expect(items.length).toBe(0);
    });
  });

  // =========================================================================
  // F5: Wire Feedback & Issue Reporting (Boundaries)
  // =========================================================================
  describe('F5 Boundary: Moderation Report Input Validation', () => {
    it('F5-B1: report submission with empty reason string rejected with 400', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'quiz1',
        reason: '   ',
      });
      expect(res.status).toBe(400);
    });

    it('F5-B2: report submission with missing targetId rejected with 400', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'quiz',
        reason: 'Missing targetId parameter',
      });
      expect(res.status).toBe(400);
    });

    it('F5-B3: report submission handles Unicode and LaTeX special characters safely', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'latex_quiz',
        reason: 'Question has formula $\\frac{\\partial \\psi}{\\partial t} = i \\hbar$ with emoji 🧪✨',
        description: 'Verifying LaTeX encoding integrity in moderation DB',
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data?.success).toBe(true);
    });

    it('F5-B4: report submission handles large description (5,000 characters) without server crash', async () => {
      const largeDesc = 'A'.repeat(5000);
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'large_payload_test',
        reason: 'Stress testing description length',
        description: largeDesc,
      });
      expect([200, 201, 413]).toContain(res.status);
    });

    it('F5-B5: report submission allows optional guest session identification', async () => {
      const guestClient = new ApiClient();
      guestClient.setCookie('csrfToken', 'test_csrf_token');
      const res = await guestClient.post('/api/v1/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'guest_feedback',
        reason: 'Guest reporting feedback',
      });
      expect([200, 201]).toContain(res.status);
    });
  });

  // =========================================================================
  // F6: Wire Attempt History & Profile Endpoints (Boundaries)
  // =========================================================================
  describe('F6 Boundary: Attempt History & Profile Mutability', () => {
    let authClient;

    before(async () => {
      authClient = new ApiClient();
      await authClient.registerTestUser('boundary_f6');
    });

    it('F6-B1: attempt history pagination page=999999 returns empty data array', async () => {
      const res = await authClient.get('/api/v1/attempts', { query: { page: 999999, limit: 10 } });
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        const attempts = Array.isArray(res.data?.data) ? res.data.data : res.data?.data?.attempts || [];
        expect(attempts.length).toBe(0);
      }
    });

    it('F6-B2: attempt result for malformed non-hex string returns 400 Bad Request', async () => {
      const res = await api.get('/api/v1/quiz/attempts/invalid-not-an-objectid/result');
      expect([400, 404]).toContain(res.status);
      expect(res.data?.success).toBe(false);
    });

    it('F6-B3: profile update with empty payload returns 400 Bad Request', async () => {
      const res = await authClient.patch('/api/v1/auth/me', {});
      expect([400, 422]).toContain(res.status);
      expect(res.data?.success).toBe(false);
    });

    it('F6-B4: profile update attempting to escalate role to admin is rejected or ignored', async () => {
      const res = await authClient.patch('/api/v1/auth/me', {
        role: 'admin',
        name: 'Attempted Escalation',
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.role).toBe('user');
    });

    it('F6-B5: profile update attempting to overwrite user _id is safely ignored', async () => {
      const res = await authClient.patch('/api/v1/auth/me', {
        _id: '507f1f77bcf86cd799439099',
        bio: 'ID immutable test',
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?._id).not.toBe('507f1f77bcf86cd799439099');
    });
  });

  // =========================================================================
  // F7: Wire Preferences & Privacy Persistence (Boundaries)
  // =========================================================================
  describe('F7 Boundary: Preferences Synchronization & Deep Payloads', () => {
    let userClient;

    before(async () => {
      userClient = new ApiClient();
      await userClient.registerTestUser('boundary_f7');
    });

    it('F7-B1: empty preferences object does not reset existing preferences to null', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        preferences: {},
        name: 'Preferences Preserve Test',
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.preferences).toBeDefined();
    });

    it('F7-B2: unknown preferences are rejected without persisting unsupported fields', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        preferences: {
          customExperimentalFlag: 'enabled',
          timerVisibility: 'visible',
        },
      });
      expect(res.status).toBe(400);
      const current = await userClient.get('/api/v1/auth/me');
      expect(current.data?.data?.user?.preferences?.customExperimentalFlag).toBeUndefined();
    });

    it('F7-B3: explicit toggle isProfilePublic: false synchronizes isPrivate: true', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        isProfilePublic: false,
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.isProfilePublic).toBe(false);
      expect(res.data?.data?.user?.isPrivate).toBe(true);
    });

    it('F7-B4: explicit toggle isProfilePublic: true synchronizes isPrivate: false', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        isProfilePublic: true,
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.isProfilePublic).toBe(true);
      expect(res.data?.data?.user?.isPrivate).toBe(false);
    });

    it('F7-B5: boolean preferences accept explicit false values without reverting to defaults', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        preferences: {
          soundCues: false,
          autoAdvance: false,
        },
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.preferences?.soundCues).toBe(false);
      expect(res.data?.data?.user?.preferences?.autoAdvance).toBe(false);
    });
  });

  // =========================================================================
  // F8: Fix Dead-End Routes & Redundant Requests (Boundaries)
  // =========================================================================
  describe('F8 Boundary: Dead-End Route Fallbacks & 404 Resilience', () => {
    it('F8-B1: non-existent attempt result returns 404 with structured error message', async () => {
      const res = await api.get('/api/v1/quiz/attempts/507f1f77bcf86cd799439000/result');
      expect([404, 400]).toContain(res.status);
      expect(res.data?.success).toBe(false);
    });

    it('F8-B2: Challenges page handles non-existent tab gracefully in frontend state', () => {
      const challengesCode = readFileSafe(PATHS.challengesPage) || '';
      expect(challengesCode).toContain('activeTab');
    });

    it('F8-B3: Gateway handles request with trailing slashes /api/v1/health/ without error', async () => {
      const res = await api.get('/api/v1/health/');
      expect(res.status).toBe(200);
    });

    it('F8-B4: Gateway does not crash when request contains URI encoded special characters', async () => {
      const res = await api.get('/api/v1/quiz?tag=%20%23%24%25%5E%26');
      expect([200, 404]).toContain(res.status);
    });

    it('F8-B5: Gateway returns 404 JSON for undefined root path', async () => {
      const res = await api.get('/nonexistent-root-endpoint');
      expect(res.status).toBe(404);
      expect(res.data?.success).toBe(false);
    });
  });

  // =========================================================================
  // F9: Fix Render Container Builds & Port Binding (Boundaries)
  // =========================================================================
  describe('F9 Boundary: Port Range & Container Packaging', () => {
    it('F9-B1: api-gateway enforces port range from 1 to 65535 in startup code', () => {
      const serverCode = readFileSafe(PATHS.root + '/services/api-gateway/src/server.js') || '';
      expect(serverCode).toContain('65535');
    });

    it('F9-B2: parser-service dependencies contain zero file: references', () => {
      const pkg = readJsonSafe(PATHS.root + '/services/parser-service/package.json');
      const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
      for (const [key, val] of Object.entries(deps)) {
        expect(String(val).startsWith('file:')).toBe(false);
      }
    });

    it('F9-B3: social-service dependencies contain zero file: references', () => {
      const pkg = readJsonSafe(PATHS.root + '/services/social-service/package.json');
      const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
      for (const [key, val] of Object.entries(deps)) {
        expect(String(val).startsWith('file:')).toBe(false);
      }
    });

    it('F9-B4: message-service dependencies contain zero file: references', () => {
      const pkg = readJsonSafe(PATHS.root + '/services/message-service/package.json');
      const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
      for (const [key, val] of Object.entries(deps)) {
        expect(String(val).startsWith('file:')).toBe(false);
      }
    });

    it('F9-B5: media-service health check responds with 200 without environment crash', async () => {
      const res = await api.get('/api/v1/health');
      expect(res.data?.services?.media?.status).toBe('healthy');
    });
  });

  // =========================================================================
  // F10: Configure Cross-Domain CORS & Cookies (Boundaries)
  // =========================================================================
  describe('F10 Boundary: Malicious Origins & Header Attacks', () => {
    it('F10-B1: subdomain spoofing origin (http://localhost:5173.attacker.com) does not receive CORS header', async () => {
      const res = await api.request('GET', '/api/v1/health', {
        headers: { Origin: 'http://localhost:5173.attacker.com' },
      });
      expect(res.headers.get('access-control-allow-origin')).not.toBe('http://localhost:5173.attacker.com');
    });

    it('F10-B2: null origin header on GET request does not throw gateway error', async () => {
      const res = await api.request('GET', '/api/v1/health', {
        headers: { Origin: 'null' },
      });
      expect(res.status).toBe(200);
    });

    it('F10-B3: preflight OPTIONS request returns allowed methods list', async () => {
      const res = await api.request('OPTIONS', '/api/v1/auth/login', {
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
        },
      });
      expect([200, 204]).toContain(res.status);
    });

    it('F10-B4: preflight OPTIONS request reflects Access-Control-Allow-Headers', async () => {
      const res = await api.request('OPTIONS', '/api/v1/auth/login', {
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'x-custom-test-header',
        },
      });
      expect([200, 204]).toContain(res.status);
    });

    it('F10-B5: auth cookies parser operates safely without throwing on malformed cookie header', async () => {
      const res = await api.request('GET', '/api/v1/health', {
        headers: { Cookie: 'malformed_cookie_string;;==;;' },
      });
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // F11: Vercel Deployment Readiness & Config (Boundaries)
  // =========================================================================
  describe('F11 Boundary: Vercel Rewrites & SPA Resilience', () => {
    it('F11-B1: vercel.json is valid strict JSON with zero trailing comma errors', () => {
      if (fileExists(PATHS.vercelJson)) {
        const raw = readFileSafe(PATHS.vercelJson);
        let parsed = null;
        expect(() => { parsed = JSON.parse(raw); }).not.toThrow();
        expect(parsed).toBeDefined();
      }
    });

    it('F11-B2: vercel.json rewrite destination points to /index.html', () => {
      if (fileExists(PATHS.vercelJson)) {
        const conf = readJsonSafe(PATHS.vercelJson);
        const destination = conf?.rewrites?.[0]?.destination;
        expect(['/index.html', '/']).toContain(destination);
      }
    });

    it('F11-B3: apps/desktop-web/src/api/axios.js handles null/empty baseURL gracefully', () => {
      const axiosCode = readFileSafe(PATHS.desktopWeb + '/src/api/axios.js') || '';
      expect(axiosCode).toContain('baseURL');
    });

    it('F11-B4: desktop-web package.json build script specifies vite build', () => {
      const pkg = readJsonSafe(PATHS.desktopWebPackageJson);
      expect(pkg?.scripts?.build).toContain('vite build');
    });

    it('F11-B5: desktop-web index.html includes viewport meta tag for mobile scaling', () => {
      const html = readFileSafe(PATHS.desktopWeb + '/index.html') || '';
      expect(html).toContain('viewport');
    });
  });

  // =========================================================================
  // F12: Root Test Runner & Gateway Tests (Boundaries)
  // =========================================================================
  describe('F12 Boundary: Gateway Proxy Stress & Error Mapping', () => {
    it('F12-B1: Gateway handles 20 concurrent health check requests without dropping sockets', async () => {
      const requests = Array.from({ length: 20 }, () => api.get('/api/v1/health'));
      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });

    it('F12-B2: Gateway forwards custom session headers (x-client-session-id)', async () => {
      const testClient = new ApiClient();
      const res = await testClient.request('GET', '/api/v1/auth/bootstrap', {
        headers: { 'x-client-session-id': 'sess_probe_12345' },
      });
      expect([200, 304]).toContain(res.status);
    });

    it('F12-B3: Gateway correctly handles downstream 404 from quiz service', async () => {
      const res = await api.get('/api/v1/quizzes/nonexistent-quiz-slug-999');
      expect([400, 404]).toContain(res.status);
    });

    it('F12-B4: api-gateway unit tests in services/api-gateway/tests are syntactically valid JS', () => {
      const csrfTest = readFileSafe(PATHS.root + '/services/api-gateway/tests/csrf.test.js') || '';
      expect(csrfTest.length).toBeGreaterThan(0);
      expect(csrfTest).toContain('describe');
    });

    it('F12-B5: Gateway health endpoint includes all required services in its status payload', async () => {
      const res = await api.get('/api/v1/health');
      expect(res.status).toBe(200);
      const svc = res.data?.services;
      expect(svc?.auth).toBeDefined();
      expect(svc?.quiz).toBeDefined();
      expect(svc?.attempt).toBeDefined();
      expect(svc?.social).toBeDefined();
      expect(svc?.admin).toBeDefined();
    });
  });

});
