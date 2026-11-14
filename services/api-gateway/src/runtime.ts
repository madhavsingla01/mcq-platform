import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction } from 'express';
import { isRecord } from './request-types.js';

export function integerSetting(env: NodeJS.ProcessEnv, name: string, fallback: number, min = 1, max = 120000) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function assignRequestId(req: IncomingMessage): string {
  const supplied = req.headers['x-request-id'];
  req.requestId = typeof supplied === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(supplied)
    ? supplied : randomUUID();
  return req.requestId;
}

export function requestContext(req: IncomingMessage, res: Pick<ServerResponse, 'setHeader'>, next: NextFunction) {
  res.setHeader('X-Request-ID', assignRequestId(req));
  next();
}

// Collapse concurrent probes and bound dependency traffic from load balancers.
interface DependencyHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unreachable';
  code?: number;
  latencyMs: number;
}

interface HealthSnapshot {
  healthy: boolean;
  services: Record<string, DependencyHealth>;
}

interface HealthMonitorOptions {
  fetchImpl?: (url: string, options: { signal: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
  timeoutMs?: number;
  ttlMs?: number;
  now?: () => number;
}

export function createHealthMonitor(services: Record<string, string>, { fetchImpl = fetch, timeoutMs = 2000, ttlMs = 3000, now = Date.now }: HealthMonitorOptions = {}) {
  let cached: HealthSnapshot | undefined;
  let expiresAt = 0;
  let pending: Promise<HealthSnapshot> | undefined;
  return async function checkHealth() {
    if (cached && now() < expiresAt) return cached;
    if (pending) return pending;
    pending = Promise.all(Object.entries(services).map(async ([name, url]): Promise<[string, DependencyHealth]> => {
      const started = now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${url}/api/v1/health`, { signal: controller.signal });
        const data: unknown = await response.json();
        return [name, {
          service: name,
          status: response.ok && isRecord(data) && data.status === 'healthy' ? 'healthy' : 'degraded',
          code: response.status,
          latencyMs: Math.max(0, now() - started),
        }];
      } catch {
        return [name, { service: name, status: 'unreachable', latencyMs: Math.max(0, now() - started) }];
      } finally {
        clearTimeout(timeout);
      }
    })).then(entries => {
      cached = { healthy: entries.every(([, service]) => service.status === 'healthy'), services: Object.fromEntries(entries) };
      expiresAt = now() + ttlMs;
      return cached;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}

export const isSocketPath = (url?: string) => /^\/socket\.io(?:\/|\?|$)/.test(url || '');
