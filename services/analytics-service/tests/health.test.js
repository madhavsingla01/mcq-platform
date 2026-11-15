import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.PORT = '5015';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';

const { app, start, shutdown } = await import('../dist/server.js');

const VALID_TOKEN = jwt.sign(
  {
    id: '507f1f77bcf86cd799439011',
    role: 'creator',
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  process.env.JWT_SECRET,
  { algorithm: 'HS256' }
);

describe('Analytics Service — Health Probes and Server Lifecycle', () => {
  let testServer;
  let baseUrl;

  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const { port } = testServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  it('GET / returns HTTP 200 with service descriptor and health path', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.health, '/api/v1/health');
    assert.match(data.message, /QuizFocus Analytics Service/);
  });

  it('GET /health returns HTTP 200 with healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.status, 'healthy');
    assert.equal(data.ready, true);
    assert.ok(data.timestamp);
  });

  it('GET /ready returns HTTP 200 with ready state', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.status, 'healthy');
    assert.equal(data.ready, true);
  });

  it('GET /livez returns HTTP 200 with liveness indicator', async () => {
    const res = await fetch(`${baseUrl}/livez`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.status, 'healthy');
  });

  it('GET /api/v1/health returns HTTP 200 (for API Gateway health monitor)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.status, 'healthy');
  });

  it('GET /api/v1/ready returns HTTP 200', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.status, 'healthy');
    assert.equal(data.ready, true);
  });

  it('GET /api/v1/analytics/health returns HTTP 200 (for Tier 1 E2E probes)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.status, 'healthy');
  });

  it('GET /api/v1/analytics/ready returns HTTP 200 with ready: true', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.service, 'analytics-service');
    assert.equal(data.ready, true);
  });

  it('unauthenticated GET /api/v1/analytics/overview returns HTTP 401 (T1-ANA-05 compliance)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/overview`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Not authenticated/);
  });

  it('authenticated GET /api/v1/analytics/overview returns structured HTTP 404 for Phase 2', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/overview`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Analytics business routes are not yet implemented in Phase 2/);
    assert.equal(data.data, null);
    assert.deepEqual(data.errors, []);
  });

  it('GET /unknown-route returns 404 via notFoundHandler', async () => {
    const res = await fetch(`${baseUrl}/nonexistent-path-for-testing`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.message, 'Route not found');
  });

  it('rejects JSON payloads larger than 1MB with HTTP 413 (T2-BND-18 compliance)', async () => {
    const largePayload = JSON.stringify({ data: 'a'.repeat(1024 * 1024 + 100) });
    const res = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: largePayload,
    });
    assert.equal(res.status, 413);
  });

  it('exported start() and shutdown() manage lifecycle cleanly on ephemeral port', async () => {
    const ephemeralServer = await start(0);
    assert.ok(ephemeralServer.listening);
    const addr = ephemeralServer.address();
    assert.ok(typeof addr === 'object' && addr !== null);
    assert.ok(addr.port > 0);

    const probeRes = await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(probeRes.status, 200);

    await shutdown(false);
  });
});
