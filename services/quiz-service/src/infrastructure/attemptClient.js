// Compatibility transport only. Attempt Service owns policy and persistence.
// The caller's original credentials are verified again by the receiving service.
export function createAttemptRelay({ origin, timeoutMs = 15000, fetchImpl = fetch }) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('ATTEMPT_SERVICE_URL must be an HTTP(S) origin without credentials');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('ATTEMPT_REQUEST_TIMEOUT_MS must be from 100 to 30000');
  return async (req, res, next) => {
    let target;
    try {
      target = new URL(req.originalUrl, url.origin);
      if (!req.originalUrl.startsWith('/api/v1/quiz/') || target.origin !== url.origin || !target.pathname.startsWith('/api/v1/quiz/')) throw new Error();
    } catch {
      const error = new Error('Invalid attempt route');
      error.statusCode = 400;
      return next(error);
    }
    const headers = { 'content-type': 'application/json' };
    for (const name of ['cookie', 'authorization', 'x-csrf-token', 'x-request-id', 'x-client-session-id', 'x-quiz-session-id']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', disconnected);
    try {
      const upstream = await fetchImpl(target, {
        method: req.method, headers, redirect: 'manual', signal: controller.signal,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: JSON.stringify(req.body || {}) } : {}),
      });
      if (upstream.status >= 300 && upstream.status < 400) throw new Error('Unexpected redirect from Attempt Service');
      const body = await upstream.json();
      if (typeof body?.success !== 'boolean') throw new Error('Invalid attempt response');
      if (!res.destroyed) res.status(upstream.status).json(body);
    } catch {
      if (res.destroyed) return;
      const error = new Error(controller.signal.aborted ? 'Attempt service timed out' : 'Attempt service unavailable');
      error.statusCode = controller.signal.aborted ? 504 : 503;
      error.isOperational = true;
      next(error);
    } finally {
      clearTimeout(timer);
      res.off('close', disconnected);
    }
  };
}
