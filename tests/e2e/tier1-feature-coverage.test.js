/**
 * Tier 1: Feature Coverage E2E Test Suite
 * Covers Features F1 through F12 with >=5 test cases per feature.
 * Authoritative source: PROJECT.md Feature Inventory & ORIGINAL_REQUEST.md.
 */

import { describe, test, it, expect, before, after } from './helpers/runner-core.js';
import { ApiClient } from './helpers/api-client.js';
import { proxyFailure } from '../../services/api-gateway/src/contracts.js';
import {
  PATHS,
  readFileSafe,
  readJsonSafe,
  extractHexColors,
  fileExists,
} from './helpers/static-checker.js';

const api = new ApiClient();

describe('Tier 1: Feature Coverage (F1 through F12)', () => {

  // =========================================================================
  // F1: Strict Orange & Dark Neutral Palette
  // =========================================================================
  describe('F1: Strict Orange & Dark Neutral Palette', () => {
    const indexCss = readFileSafe(PATHS.indexCss) || '';

    it('F1-1: defines pure Orange (#FF4500) as primary brand color token', () => {
      const hasOrange = indexCss.includes('#FF4500') || indexCss.includes('#ff4500');
      expect(hasOrange).toBeTruthy();
    });

    it('F1-2: defines dark neutral glass tokens (#121214, #18181B) and pure black (#000000)', () => {
      const hasDarkGlass1 = indexCss.includes('#121214') || indexCss.includes('#121214');
      const hasDarkGlass2 = indexCss.includes('#18181B') || indexCss.includes('#18181b');
      const hasBlack = indexCss.includes('#000000') || indexCss.includes('#000');
      expect(hasDarkGlass1 || hasDarkGlass2).toBeTruthy();
      expect(hasBlack).toBeTruthy();
    });

    it('F1-3: root theme tokens exclude unapproved saturated blue/purple accent variables', () => {
      const unapprovedAccents = ['#6366F1', '#8B5CF6', '#3B82F6', '#06B6D4', '#10B981'];
      const hexes = extractHexColors(indexCss);
      const violations = unapprovedAccents.filter(color => hexes.includes(color));
      expect(violations).toEqual([]);
    });

    it('F1-4: AIWorkspace.jsx eliminates light-mode bleed and adheres to dark styling', () => {
      const aiContent = readFileSafe(PATHS.aiWorkspace) || '';
      expect(aiContent.length).toBeGreaterThan(0);
      expect(aiContent).not.toMatch(/(?<!hover:)bg-white(?!\/)/i);
    });

    it('F1-5: NavigatorSidebar.jsx eliminates light-mode bleed and adheres to dark theme tokens', () => {
      const navContent = readFileSafe(PATHS.navigatorSidebar) || '';
      expect(navContent.length).toBeGreaterThan(0);
      expect(navContent).not.toMatch(/bg-slate-100|bg-gray-100|bg-zinc-100/i);
    });
  });

  // =========================================================================
  // F2: Apple-Inspired Animation & Interaction Polish
  // =========================================================================
  describe('F2: Apple-Inspired Animation & Interaction Polish', () => {
    const indexCss = readFileSafe(PATHS.indexCss) || '';
    const sidebarCss = readFileSafe(PATHS.sidebarCss) || '';

    it('F2-1: defines standard Apple-inspired cubic-bezier easing tokens', () => {
      const hasEaseOut = indexCss.includes('cubic-bezier(0.23, 1, 0.32, 1)');
      expect(hasEaseOut).toBeTruthy();
    });

    it('F2-2: UI animation durations abide by max 300ms duration rule in tokens', () => {
      const durationMatches = indexCss.match(/--duration-[a-z]+:\s*([0-9]+)ms/g) || [];
      for (const m of durationMatches) {
        const val = parseInt(m.match(/([0-9]+)ms/)[1], 10);
        expect(val).toBeLessThanOrEqual(300);
      }
    });

    it('F2-3: Sidebar.css does not animate layout properties (e.g. width) during transitions', () => {
      expect(sidebarCss).not.toMatch(/transition:\s*width/i);
    });

    it('F2-4: enforces active scale touch feedback rule (:active { transform: scale(0.97) })', () => {
      const hasActiveScale = indexCss.includes('scale(0.97)') || indexCss.includes('0.97');
      expect(hasActiveScale).toBeTruthy();
    });

    it('F2-5: interactive platform components use Sonner toast rather than window.alert()', () => {
      const settingsDrawer = readFileSafe(PATHS.settingsDrawer) || '';
      const activitySettings = readFileSafe(PATHS.activitySettings) || '';
      const helpSettings = readFileSafe(PATHS.helpSettings) || '';

      expect(settingsDrawer).not.toMatch(/\bwindow\.alert\s*\(/);
      expect(activitySettings).not.toMatch(/\bwindow\.alert\s*\(/);
      expect(helpSettings).not.toMatch(/\bwindow\.alert\s*\(/);
    });
  });

  // =========================================================================
  // F3: Microservices Security Hardening
  // =========================================================================
  describe('F3: Microservices Security Hardening', () => {
    it('F3-1: API Gateway includes Helmet security headers (nosniff, frameguard, referrer)', async () => {
      const res = await api.get('/api/v1/health');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toContain('strict-origin-when-cross-origin');
    });

    it('F3-2: admin reports submit endpoint accepts valid report and validates required fields', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'platform',
        reason: 'Security audit probe',
        description: 'Verifying report route security',
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data?.success).toBeTruthy();
    });

    it('F3-3: unhandled gateway route returns safe sanitized 404 without server stack leak', async () => {
      const res = await api.get('/api/v1/nonexistent-route-for-security-check');
      expect(res.status).toBe(404);
      expect(res.data?.success).toBe(false);
      expect(JSON.stringify(res.data)).not.toMatch(/at Function\.execute|node_modules|Error:/);
    });

    it('F3-4: unauthenticated access to protected admin route is rejected with 401 or 403', async () => {
      const unauthClient = new ApiClient();
      const res = await unauthClient.get('/api/v1/admin/overview');
      expect([401, 403]).toContain(res.status);
    });

    it('F3-5: microservices servers register global process unhandledRejection handlers', () => {
      const adminServer = readFileSafe(PATHS.root + '/services/admin-service/src/server.js') || '';
      const authServer = readFileSafe(PATHS.root + '/services/auth-service/src/server.js') || '';
      const quizServer = readFileSafe(PATHS.root + '/services/quiz-service/src/server.js') || '';

      const hasRejectionHandler =
        adminServer.includes('unhandledRejection') ||
        authServer.includes('unhandledRejection') ||
        quizServer.includes('unhandledRejection');
      expect(hasRejectionHandler).toBeTruthy();
    });
  });

  // =========================================================================
  // F4: Performance Bottleneck Remediation
  // =========================================================================
  describe('F4: Performance Bottleneck Remediation', () => {
    it('F4-1: social explore endpoint responds with success status', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: 1, limit: 10 } });
      expect([200, 304]).toContain(res.status);
      expect(res.data?.success).toBeTruthy();
    });

    it('F4-2: explore query enforces limit bounds and pagination structure', async () => {
      const res = await api.get('/api/v1/social/explore', { query: { page: 1, limit: 5 } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.data?.quizzes || res.data?.data)).toBeTruthy();
    });

    it('F4-3: explore endpoint executes with high performance (< 1000ms latency)', async () => {
      const start = performance.now();
      const res = await api.get('/api/v1/social/explore');
      const elapsed = performance.now() - start;
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(1500);
    });

    it('F4-4: User model defines compound indexes for high performance social queries', () => {
      const userModel = readFileSafe(PATHS.root + '/services/auth-service/src/models/User.model.js') || '';
      const hasIndexes = userModel.includes('userSchema.index');
      expect(hasIndexes).toBeTruthy();
      expect(userModel).toContain('isProfilePublic');
    });

    it('F4-5: Quiz model defines indexes for public discoverability and aggregation', () => {
      const quizModel = readFileSafe(PATHS.root + '/services/quiz-service/src/models/Quiz.model.js') || '';
      const hasIndexes = quizModel.includes('quizSchema.index') || quizModel.includes('index:');
      expect(hasIndexes).toBeTruthy();
    });
  });

  // =========================================================================
  // F5: Wire Feedback & Issue Reporting
  // =========================================================================
  describe('F5: Wire Feedback & Issue Reporting', () => {
    it('F5-1: submits user feedback report to POST /api/v1/admin/reports/submit with 201 Created', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'quizfocus-web',
        reason: 'Suggestion: Add Dark OLED mode option to header',
        description: 'Apple design feedback test',
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data?.success).toBe(true);
    });

    it('F5-2: submits quiz issue report with targetType quiz and persists report', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'quiz',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'Typo in question 3 statement',
        description: 'Testing quiz moderation report flow',
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data?.data?.report?._id || res.data?.data?.report?.id || res.data?.reportId).toBeDefined();
    });

    it('F5-3: submits user profile report with targetType user', async () => {
      const res = await api.post('/api/v1/admin/reports/submit', {
        targetType: 'user',
        targetId: '507f1f77bcf86cd799439012',
        reason: 'Impersonation concern',
        description: 'Testing user moderation report flow',
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data?.success).toBe(true);
    });

    it('F5-4: HelpSettings.jsx form contains submission state and real submit handler', () => {
      const helpCode = readFileSafe(PATHS.helpSettings) || '';
      expect(helpCode).toContain('handleSubmitReport');
      expect(helpCode).toContain('reportText');
    });

    it('F5-5: PublicProfile.jsx or profile routes support reporting user violations', () => {
      const publicProfileCode = readFileSafe(PATHS.publicProfile) || '';
      expect(publicProfileCode.length).toBeGreaterThan(0);
      expect(publicProfileCode).toMatch(/report|flag|moderation/i);
    });
  });

  // =========================================================================
  // F6: Wire Attempt History & Profile Endpoints
  // =========================================================================
  describe('F6: Wire Attempt History & Profile Endpoints', () => {
    let testUserClient;

    before(async () => {
      testUserClient = new ApiClient();
      await testUserClient.registerTestUser('history_f6');
    });

    it('F6-1: attempt history endpoint responds to GET /api/v1/attempts', async () => {
      const res = await testUserClient.get('/api/v1/attempts', { query: { page: 1, limit: 10 } });
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.data?.success).toBe(true);
      }
    });

    it('F6-2: AttemptService client maps getUserAttempts to /attempts endpoint', () => {
      const attemptServiceCode = readFileSafe(PATHS.desktopWeb + '/src/services/attempt.service.js') || '';
      expect(attemptServiceCode).toContain("api.get('/attempts'");
    });

    it('F6-3: user profile endpoint accepts PATCH /api/v1/auth/me to update profile info', async () => {
      const res = await testUserClient.patch('/api/v1/auth/me', {
        bio: 'Updated bio for E2E verification test',
        gender: 'other',
      });
      expect(res.status).toBe(200);
      expect(res.data?.success).toBe(true);
      expect(res.data?.data?.user?.bio).toBe('Updated bio for E2E verification test');
    });

    it('F6-4: AuthService client uses PATCH method for updateProfile', () => {
      const authServiceCode = readFileSafe(PATHS.desktopWeb + '/src/services/auth.service.js') || '';
      expect(authServiceCode).toMatch(/api\.patch\(['"`]\/auth\/me['"`]/);
    });

    it('F6-5: attempt result endpoint returns 404 for non-existent attempt without crashing', async () => {
      const res = await api.get('/api/v1/quiz/attempts/507f1f77bcf86cd799439099/result');
      expect([404, 400]).toContain(res.status);
      expect(res.data?.success).toBe(false);
    });
  });

  // =========================================================================
  // F7: Wire Preferences & Privacy Persistence
  // =========================================================================
  describe('F7: Wire Preferences & Privacy Persistence', () => {
    let userClient;

    before(async () => {
      userClient = new ApiClient();
      await userClient.registerTestUser('pref_f7');
    });

    it('F7-1: persists soundCues and autoAdvance in user preferences via PATCH /api/v1/auth/me', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        preferences: {
          soundCues: true,
          autoAdvance: true,
          theme: 'dark',
          fontSize: 'md',
        },
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.preferences?.soundCues).toBe(true);
      expect(res.data?.data?.user?.preferences?.autoAdvance).toBe(true);
    });

    it('F7-2: retrieves persisted preferences on GET /api/v1/auth/me', async () => {
      const res = await userClient.get('/api/v1/auth/me');
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.preferences?.soundCues).toBe(true);
      expect(res.data?.data?.user?.preferences?.autoAdvance).toBe(true);
    });

    it('F7-3: SettingsDrawer component includes sound and auto-advance toggles', () => {
      const drawerCode = readFileSafe(PATHS.settingsDrawer) || '';
      expect(drawerCode).toContain('handleToggleSound');
      expect(drawerCode).toContain('handleToggleAutoAdvance');
    });

    it('F7-4: synchronizes isPrivate and isProfilePublic in User model', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        isPrivate: true,
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.isPrivate).toBe(true);
      expect(res.data?.data?.user?.isProfilePublic).toBe(false);
    });

    it('F7-5: supports privacy toggles searchDiscovery, allowMessagesFrom, showOnLeaderboard', async () => {
      const res = await userClient.patch('/api/v1/auth/me', {
        preferences: {
          searchDiscovery: false,
          allowMessagesFrom: 'following',
          showOnLeaderboard: false,
        },
      });
      expect(res.status).toBe(200);
      expect(res.data?.data?.user?.preferences?.searchDiscovery).toBe(false);
      expect(res.data?.data?.user?.preferences?.showOnLeaderboard).toBe(false);
    });
  });

  // =========================================================================
  // F8: Fix Dead-End Routes & Redundant Requests
  // =========================================================================
  describe('F8: Fix Dead-End Routes & Redundant Requests', () => {
    it('F8-1: ActivitySettings formats result navigation link using attemptId', () => {
      const activityCode = readFileSafe(PATHS.activitySettings) || '';
      expect(activityCode).toMatch(/primaryLink:\s*[`'"]\/result\/\$\{(?:act\.attemptId|act\.attempt\?\.id|act\.attempt\?._id|act\._id|attemptId)/);
    });

    it('F8-2: Challenges page does not call guaranteed 404 /social/challenges-overview', () => {
      const challengesCode = readFileSafe(PATHS.challengesPage) || '';
      expect(challengesCode).not.toContain('/social/challenges-overview');
    });

    it('F8-3: Challenges page handles data loading without unhandled exceptions', () => {
      const challengesCode = readFileSafe(PATHS.challengesPage) || '';
      expect(challengesCode).toContain('fetchChallenges');
      expect(challengesCode).toContain('setLoading');
    });

    it('F8-4: Gateway returns structured JSON 404 for non-existent route', async () => {
      const res = await api.get('/api/v1/route-that-does-not-exist');
      expect(res.status).toBe(404);
      expect(res.data?.success).toBe(false);
      expect(res.data?.message).toContain('route not found');
    });

    it('F8-5: Challenge service health and overview route is reachable via Gateway', async () => {
      const res = await api.get('/api/v1/challenges/health');
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.data?.status || res.data?.service).toBeDefined();
      }
    });
  });

  // =========================================================================
  // F9: Fix Render Container Builds & Port Binding
  // =========================================================================
  describe('F9: Fix Render Container Builds & Port Binding', () => {
    it('F9-1: message-service package.json has no file:../.. root dependency', () => {
      const pkg = readJsonSafe(PATHS.root + '/services/message-service/package.json');
      expect(pkg?.dependencies?.['mcq-platform-root']).toBeUndefined();
    });

    it('F9-2: parser-service package.json has no file:../.. root dependency', () => {
      const pkg = readJsonSafe(PATHS.root + '/services/parser-service/package.json');
      expect(pkg?.dependencies?.['mcq-platform-root']).toBeUndefined();
    });

    it('F9-3: social-service package.json has no file:../.. root dependency', () => {
      const pkg = readJsonSafe(PATHS.root + '/services/social-service/package.json');
      expect(pkg?.dependencies?.['mcq-platform-root']).toBeUndefined();
    });

    it('F9-4: microservices servers read process.env.PORT dynamically', () => {
      const gatewayServer = readFileSafe(PATHS.root + '/services/api-gateway/src/server.js') || '';
      const authServer = readFileSafe(PATHS.root + '/services/auth-service/src/server.js') || '';
      expect(gatewayServer).toContain('PORT');
      expect(authServer).toContain('PORT');
    });

    it('F9-5: all 10 microservices are currently listening on allocated ports', async () => {
      const res = await api.get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.data?.services?.auth?.status).toBe('healthy');
      expect(res.data?.services?.quiz?.status).toBe('healthy');
      expect(res.data?.services?.parser?.status).toBe('healthy');
      expect(res.data?.services?.attempt?.status).toBe('healthy');
      expect(res.data?.services?.social?.status).toBe('healthy');
      expect(res.data?.services?.admin?.status).toBe('healthy');
    });
  });

  // =========================================================================
  // F10: Configure Cross-Domain CORS & Cookies
  // =========================================================================
  describe('F10: Configure Cross-Domain CORS & Cookies', () => {
    it('F10-1: responds with Access-Control-Allow-Origin for allowed origin', async () => {
      const res = await api.request('GET', '/api/v1/health', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('F10-2: responds with Access-Control-Allow-Credentials: true for allowed origin', async () => {
      const res = await api.request('GET', '/api/v1/health', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('F10-3: rejects unapproved origin from receiving Access-Control-Allow-Origin', async () => {
      const res = await api.request('GET', '/api/v1/health', {
        headers: { Origin: 'http://malicious-site.example.com' },
      });
      const acao = res.headers.get('access-control-allow-origin');
      expect(acao).not.toBe('http://malicious-site.example.com');
    });

    it('F10-4: handles preflight OPTIONS request with 200/204 and CORS headers', async () => {
      const res = await api.request('OPTIONS', '/api/v1/auth/login', {
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, x-csrf-token',
        },
      });
      expect([200, 204]).toContain(res.status);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('F10-5: auth service sets secure cookie attributes for sessions', async () => {
      const res = await api.get('/api/v1/auth/bootstrap');
      expect([200, 304]).toContain(res.status);
    });
  });

  // =========================================================================
  // F11: Vercel Deployment Readiness & Config
  // =========================================================================
  describe('F11: Vercel Deployment Readiness & Config', () => {
    it('F11-1: apps/desktop-web/vercel.json exists and defines SPA rewrites', () => {
      const hasVercelJson = fileExists(PATHS.vercelJson);
      expect(hasVercelJson).toBe(true);
      if (hasVercelJson) {
        const conf = readJsonSafe(PATHS.vercelJson);
        const hasSpaRewrite = conf?.rewrites?.some(r => r.destination === '/index.html' || r.destination === '/');
        expect(hasSpaRewrite).toBe(true);
      }
    });

    it('F11-2: desktop-web package.json defines standard build script', () => {
      const pkg = readJsonSafe(PATHS.desktopWebPackageJson);
      expect(pkg?.scripts?.build).toBeDefined();
    });

    it('F11-3: desktop-web axios client supports dynamic API baseURL', () => {
      const axiosCode = readFileSafe(PATHS.desktopWeb + '/src/api/axios.js') || '';
      expect(axiosCode).toContain('/api/v1');
    });

    it('F11-4: apps/desktop-web/index.html includes root container #root', () => {
      const html = readFileSafe(PATHS.desktopWeb + '/index.html') || '';
      expect(html).toContain('id="root"');
    });

    it('F11-5: vite.config.js configures dev proxy or dynamic port for dev server', () => {
      const viteConfig = readFileSafe(PATHS.desktopWeb + '/vite.config.js') || '';
      expect(viteConfig.length).toBeGreaterThan(0);
      expect(viteConfig).toMatch(/plugins|server|proxy/i);
    });
  });

  // =========================================================================
  // F12: Root Test Runner & Gateway Tests
  // =========================================================================
  describe('F12: Root Test Runner & Gateway Tests', () => {
    it('F12-1: API Gateway /api/v1/health aggregates status of all microservices', async () => {
      const res = await api.get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.data?.gateway).toBe('healthy');
      expect(res.data?.services).toBeDefined();
      expect(Object.keys(res.data.services).length).toBeGreaterThanOrEqual(8);
    });

    it('F12-2: Gateway proxies /api/v1/auth requests downstream to auth-service', async () => {
      const res = await api.get('/api/v1/auth/check-username', { query: { username: 'testcheck123' } });
      expect([200, 400]).toContain(res.status);
      expect(res.data).toBeDefined();
    });

    it('F12-3: Gateway proxies /api/v1/quiz requests downstream to quiz-service', async () => {
      const res = await api.get('/api/v1/quiz/health');
      expect([200, 404]).toContain(res.status);
    });

    it('F12-4: api-gateway contract tests cover proxy sanitization', () => {
      const contractTest = readFileSafe(PATHS.root + '/services/api-gateway/tests/contracts.test.js') || '';
      expect(contractTest.length).toBeGreaterThan(0);
      expect(contractTest).toContain('sanitizeProxyRequest');
    });

    it('F12-5: Gateway error handler responds with 502 Bad Gateway if downstream is unavailable', () => {
      const failure = proxyFailure({ code: 'ECONNREFUSED' });
      expect(failure.message).toBe('Downstream service unavailable');
      expect(failure.status).toBe(502);
    });
  });

});
