import env from '../config/env.js';
import mongoose from 'mongoose';
import { getAuthDb, getQuizDb, getAttemptDb } from '../config/db.js';
import { catchAsync } from '../middleware/error.middleware.js';

export const getSystemHealth = catchAsync(async (req, res) => {
  const checkService = async (name, port, url) => {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

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
        error: err.name === 'AbortError' ? 'Health check timed out (2500ms)' : err.message,
      };
    }
  };

  const services = [
    { name: 'api-gateway', port: 5000, url: env.SERVICES.gateway },
    { name: 'auth-service', port: 5001, url: env.SERVICES.auth },
    { name: 'quiz-service', port: 5002, url: env.SERVICES.quiz },
    { name: 'parser-service', port: 5003, url: env.SERVICES.parser },
    { name: 'attempt-service', port: 5004, url: env.SERVICES.attempt },
    { name: 'social-service', port: 5005, url: env.SERVICES.social },
    { name: 'message-service', port: 5006, url: env.SERVICES.message },
    { name: 'media-service', port: 5007, url: env.SERVICES.media },
    {
      name: 'admin-service',
      port: env.PORT,
      url: `http://localhost:${env.PORT}`,
      self: true,
    },
  ];

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
        : checkService(svc.name, svc.port, svc.url)
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
