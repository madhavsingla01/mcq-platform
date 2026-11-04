import env from '../config/env.js';
import mongoose from 'mongoose';
import { getAuthDb, getQuizDb, getAttemptDb } from '../config/db.js';
import { catchAsync } from '../middleware/error.middleware.js';

export const getSystemHealth = catchAsync(async (req, res) => {
  const checkService = async (name, url) => {
    const port = new URL(url).port || null;
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.HEALTH_CHECK_TIMEOUT_MS);

    try {
      const resp = await fetch(`${url}/api/v1/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - start);
      const data = await resp.json().catch(() => ({}));

      return {
        name,
        port,
        url,
        status: resp.ok ? 'healthy' : 'degraded',
        statusCode: resp.status,
        latencyMs,
        details: data,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        name,
        port,
        url,
        status: 'offline',
        latencyMs: null,
        error: err.name === 'AbortError' ? `Health check timed out (${env.HEALTH_CHECK_TIMEOUT_MS}ms)` : err.message,
      };
    }
  };

  const services = Object.entries(env.SERVICES).map(([name, url]) => ({ name: `${name}-service`, url }));
  services.push({ name: 'admin-service', port: env.PORT, self: true });

  const serviceResults = await Promise.all(
    services.map((svc) =>
      svc.self
        ? Promise.resolve({
            name: svc.name,
            port: svc.port,
            status: 'healthy',
            latencyMs: 1,
            details: { memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
          })
        : checkService(svc.name, svc.url)
    )
  );

  const getDbState = (conn) => {
    if (!conn) return 'disconnected';
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return states[conn.readyState] || 'unknown';
  };

  const databases = [
    { name: 'Admin DB (Primary)', uri: env.MONGO_URI, state: getDbState(mongoose.connection) },
    { name: 'Auth DB (Secondary)', uri: env.AUTH_MONGO_URI, state: getDbState(getAuthDb()) },
    { name: 'Quiz DB (Secondary)', uri: env.QUIZ_MONGO_URI, state: getDbState(getQuizDb()) },
    { name: 'Attempt DB (Secondary)', uri: env.ATTEMPT_MONGO_URI, state: getDbState(getAttemptDb()) },
  ];

  const allHealthy = serviceResults.every((s) => s.status === 'healthy');

  res.json({
    success: true,
    data: {
      overallStatus: allHealthy ? 'healthy' : 'degraded',
      services: serviceResults,
      databases,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});
