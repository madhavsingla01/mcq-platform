import { randomUUID } from 'node:crypto';

export function integerSetting(env, name, fallback, min = 1, max = 120000) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function requestContext(req, res, next) {
  const supplied = req.headers['x-request-id'];
  req.requestId = typeof supplied === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(supplied)
    ? supplied : randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

// Collapse concurrent probes and bound dependency traffic from load balancers.
export function createHealthMonitor(services, { fetchImpl = fetch, timeoutMs = 2000, ttlMs = 3000, now = Date.now } = {}) {
  let cached;
  let expiresAt = 0;
  let pending;
  return async function checkHealth() {
    if (cached && now() < expiresAt) return cached;
    if (pending) return pending;
    pending = Promise.all(Object.entries(services).map(async ([name, url]) => {
      const started = now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${url}/api/v1/health`, { signal: controller.signal });
        const data = await response.json();
        return [name, {
          service: name,
          status: response.ok && data.status === 'healthy' ? 'healthy' : 'degraded',
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

export const isSocketPath = url => /^\/socket\.io(?:\/|\?|$)/.test(url || '');
