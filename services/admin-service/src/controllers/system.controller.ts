import { z } from 'zod';
import env from '../config/env.js';
import mongoose, { type Connection } from 'mongoose';
import { getAuthDb, getQuizDb, getAttemptDb } from '../config/db.js';
import { catchAsync } from '../middleware/error.middleware.js';

const probeDetails = z.object({
  service: z.string().optional(),
  status: z.string().optional(),
  timestamp: z.string().optional(),
});

async function checkService(name: string, url: string) {
  let port: string | null = null;
  let publicUrl: string | undefined;
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.HEALTH_CHECK_TIMEOUT_MS);

  try {
    const destination = new URL(url);
    port = destination.port || null;
    publicUrl = destination.origin;
    const response = await fetch(`${url}/api/v1/health`, { signal: controller.signal });
    const latencyMs = Math.round(performance.now() - start);
    const payload: unknown = await response.json().catch(() => undefined);
    const details = probeDetails.safeParse(payload).data ?? {};
    return {
      name, port, url: publicUrl, status: response.ok ? 'healthy' : 'degraded',
      statusCode: response.status, latencyMs, details,
    };
  } catch (error) {
    return {
      name, port, url: publicUrl, status: 'offline', latencyMs: null,
      error: error instanceof Error && error.name === 'AbortError'
        ? `Health check timed out (${env.HEALTH_CHECK_TIMEOUT_MS}ms)`
        : 'Health check failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function databaseHealth(name: string, conn: Connection | null) {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    name,
    state: conn ? states[conn.readyState] ?? 'unknown' : 'disconnected',
  };
}

export const getSystemHealth = catchAsync(async (_req, res) => {
  const downstream = await Promise.all(Object.entries(env.SERVICES)
    .map(([name, url]) => checkService(`${name}-service`, url)));
  const services = [...downstream, {
    name: 'admin-service',
    port: env.PORT,
    self: true,
    status: 'healthy',
    latencyMs: 1,
    details: { memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
  }];
  const databases = [
    databaseHealth('Admin DB (Primary)', mongoose.connection),
    databaseHealth('Auth DB (Secondary)', getAuthDb()),
    databaseHealth('Quiz DB (Secondary)', getQuizDb()),
    databaseHealth('Attempt DB (Secondary)', getAttemptDb()),
  ];

  res.json({
    success: true,
    data: {
      overallStatus: services.every(service => service.status === 'healthy') ? 'healthy' : 'degraded',
      services, databases,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});
