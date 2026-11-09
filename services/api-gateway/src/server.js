/**
 * QuizFocus API Gateway
 * Central reverse proxy and security perimeter for all microservices.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

import http from 'http';
import { createHealthMonitor, integerSetting, isSocketPath, requestContext } from './runtime.js';
import { errorBody, proxyFailure, sanitizeProxyRequest } from './contracts.js';

dotenv.config();

const app = express();
const requiredSetting = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const NODE_ENV = requiredSetting('NODE_ENV');
const PORT = Number(requiredSetting('PORT'));
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS || process.env.CLIENT_URL || requiredSetting('CLIENT_URL');
const allowedOrigins = configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
if (allowedOrigins.length === 0) throw new Error('CLIENT_URL or CORS_ALLOWED_ORIGINS must contain at least one allowed origin');

const SERVICES = {
  auth: requiredSetting('AUTH_SERVICE_URL'),
  quiz: requiredSetting('QUIZ_SERVICE_URL'),
  parser: requiredSetting('PARSER_SERVICE_URL'),
  attempt: requiredSetting('ATTEMPT_SERVICE_URL'),
  social: requiredSetting('SOCIAL_SERVICE_URL'),
  message: requiredSetting('MESSAGE_SERVICE_URL'),
  media: requiredSetting('MEDIA_SERVICE_URL'),
  admin: requiredSetting('ADMIN_SERVICE_URL'),
  challenge: requiredSetting('CHALLENGE_SERVICE_URL'),
};

for (const [name, value] of Object.entries(SERVICES)) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} service URL must be an HTTP(S) origin without credentials`);
  }
}
const proxyTimeout = integerSetting(process.env, 'PROXY_TIMEOUT_MS', 30000);
const shutdownTimeout = integerSetting(process.env, 'SHUTDOWN_TIMEOUT_MS', 10000);
const checkHealth = createHealthMonitor(SERVICES, {
  timeoutMs: integerSetting(process.env, 'HEALTH_CHECK_TIMEOUT_MS', 2000),
  ttlMs: integerSetting(process.env, 'HEALTH_CACHE_TTL_MS', 3000),
});
let draining = false;
app.disable('x-powered-by');
// Trust only a configured number of hops, never arbitrary forwarded IP headers.
app.set('trust proxy', integerSetting(process.env, 'TRUST_PROXY_HOPS', 0, 0, 5));
app.use(requestContext);

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS Configuration
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ['X-Request-ID'],
}));

app.use(cookieParser());
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json(errorBody(403, 'Request origin is not allowed', req.requestId));
  }
  next();
});

if (NODE_ENV !== 'test') {
  morgan.token('request-id', req => req.requestId);
  morgan.token('safe-path', req => req.path);
  app.use(morgan(':request-id :method :safe-path :status :response-time ms'));
}

app.get('/api/v1/livez', (req, res) => res.json({ status: 'alive' }));
app.get(['/api/v1/health', '/api/v1/readyz'], async (req, res, next) => {
  try {
    const health = await checkHealth();
    const ready = health.healthy && !draining;
    res.setHeader('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({
      success: ready,
      status: ready ? 'healthy' : 'degraded',
      gateway: draining ? 'draining' : 'healthy',
      timestamp: new Date().toISOString(),
      services: health.services,
    });
  } catch (error) { next(error); }
});
app.use((req, res, next) => {
  if (draining) return res.status(503).set('Connection', 'close').json(errorBody(503, 'Service restarting', req.requestId));
  next();
});

// Proxy helper with standard logging & header forwarding
const makeProxy = (target, pathPrefix = '') => createProxyMiddleware({
  target: pathPrefix ? `${target}${pathPrefix}` : target,
  changeOrigin: true,
  xfwd: true,
  proxyTimeout,
  timeout: proxyTimeout + 5000,
  on: {
    proxyReqWs: (proxyReq, req) => {
      if (!req.requestId) requestContext(req, { setHeader() {} }, () => {});
      sanitizeProxyRequest(proxyReq, { headers: req.headers, requestId: req.requestId, ip: req.socket.remoteAddress });
    },
    proxyReq: (proxyReq, req) => {
      sanitizeProxyRequest(proxyReq, req);
      proxyReq.once('timeout', () => { req.proxyTimedOut = true; });
      if (req.headers.cookie) {
        proxyReq.setHeader('cookie', req.headers.cookie);
      }
      if (req.headers['x-csrf-token']) {
        proxyReq.setHeader('x-csrf-token', req.headers['x-csrf-token']);
      }
      if (req.headers['x-client-session-id']) {
        proxyReq.setHeader('x-client-session-id', req.headers['x-client-session-id']);
      }
      if (req.headers['x-quiz-session-id']) {
        proxyReq.setHeader('x-quiz-session-id', req.headers['x-quiz-session-id']);
      }
      if (req.headers['authorization']) {
        proxyReq.setHeader('authorization', req.headers['authorization']);
      }
    },
    error: (err, req, res) => {
      console.error(`[Gateway Proxy Error] ${req.requestId} ${req.method}`, err.code || 'PROXY_ERROR');
      if (!res) return;
      const failure = proxyFailure(req.proxyTimedOut ? { code: 'ETIMEDOUT' } : err);
      const body = errorBody(failure.status, failure.message, req.requestId);

      // 1. Standard Express Response
      if (typeof res.status === 'function') {
        if (!res.headersSent) {
          res.status(failure.status).json(body);
        }
        return;
      }

      // 2. Standard Node.js http.ServerResponse
      if (typeof res.writeHead === 'function') {
        if (!res.headersSent) {
          res.writeHead(failure.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(body));
        }
        return;
      }

      // 3. Raw Socket (WebSocket upgrade errors where res is a net.Socket)
      if (typeof res.end === 'function') {
        try {
          if (res.writable) {
            res.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
          }
        } catch {}
        if (typeof res.destroy === 'function') {
          res.destroy();
        }
      }
    },
  },
});

// Specific route mappings
// 1. Attempts (Specific attempt endpoints under /api/v1/quiz/attempts or /api/v1/attempts)
app.use('/api/v1/quiz/attempts', makeProxy(SERVICES.attempt, '/api/v1/quiz/attempts'));
app.use('/api/v1/attempts', makeProxy(SERVICES.attempt, '/api/v1/attempts'));

// 2. Auth & Profiles
app.use('/api/v1/auth', makeProxy(SERVICES.auth, '/api/v1/auth'));
app.use('/api/v1/users', makeProxy(SERVICES.auth, '/api/v1/users'));

// 3. Quiz, Quizzes & Search
app.use('/api/v1/quiz', makeProxy(SERVICES.quiz, '/api/v1/quiz'));
app.use('/api/v1/quizzes', makeProxy(SERVICES.quiz, '/api/v1/quizzes'));
app.use('/api/v1/search', makeProxy(SERVICES.quiz, '/api/v1/search'));


// 4. Parser, Upload & Static Uploads
app.use('/api/v1/media', makeProxy(SERVICES.media, '/api/v1/media'));
app.use('/media', makeProxy(SERVICES.media, '/media'));
app.use('/api/v1/upload', makeProxy(SERVICES.parser, '/api/v1/upload'));
app.use('/api/v1/parser', makeProxy(SERVICES.parser, '/api/v1/parser'));
app.use('/uploads/covers', makeProxy(SERVICES.quiz, '/uploads/covers'));
app.use('/uploads', makeProxy(SERVICES.parser, '/uploads'));

// 5. Social & Community
app.use('/api/v1/social', makeProxy(SERVICES.social, '/api/v1/social'));
app.use('/api/v1/notifications', makeProxy(SERVICES.social, '/api/v1/social/notifications'));

// 6. Direct Messaging & Real-Time WebSockets
const socketProxy = makeProxy(SERVICES.message);
app.use('/socket.io', (req, res, next) => {
  req.url = `/socket.io${req.url}`;
  socketProxy(req, res, next);
});
app.use('/api/v1/messages', makeProxy(SERVICES.message, '/api/v1/messages'));

// 7. Admin Control Center & Operations
app.use('/api/v1/admin', makeProxy(SERVICES.admin, '/api/v1/admin'));

// 8. Competitive Challenges Arena
app.use('/api/v1/challenges', makeProxy(SERVICES.challenge, '/api/v1/challenges'));

// Fallback 404
app.use('*', (req, res) => {
  res.status(404).json(errorBody(404, 'API Gateway route not found', req.requestId));
});

// Global Gateway Error Handler
app.use((err, req, res, next) => {
  console.error(JSON.stringify({ service: 'api-gateway', requestId: req.requestId, category: err.name, code: err.code }));
  const status = err.status || err.statusCode || 500;
  if (res.headersSent) return next(err);
  res.status(status).json(errorBody(status, status >= 500 ? 'Internal Gateway Error' : 'Invalid gateway request', req.requestId));
});

const server = http.createServer(app);
server.headersTimeout = 15000;
server.requestTimeout = proxyTimeout + 5000;
const sockets = new Set();
server.on('connection', socket => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
});

// Forward WebSocket upgrade requests to the message service
server.on('upgrade', (req, socket, head) => {
  socket.on('error', (err) => {
    console.error('[Gateway WS Client Socket Error]:', err.message);
  });
  const origin = req.headers.origin;
  if (!draining && isSocketPath(req.url) && (!origin || allowedOrigins.includes(origin)) && typeof socketProxy.upgrade === 'function') {
    socketProxy.upgrade(req, socket, head);
  } else {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  }
});

function shutdown(exitCode = 0) {
  if (draining) return;
  draining = true;
  const deadline = setTimeout(() => {
    for (const socket of sockets) socket.destroy();
    process.exit(exitCode);
  }, shutdownTimeout);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); process.exit(exitCode); });
  server.closeIdleConnections?.();
}
process.once('SIGTERM', () => shutdown());
process.once('SIGINT', () => shutdown());
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.once(event, error => {
    console.error(`[API Gateway ${event}]`, error);
    shutdown(1);
  });
}

server.listen(PORT, () => {
  console.log(`🚀 API Gateway active on http://127.0.0.1:${PORT}`);
  console.log('   Proxy Destinations:');
  console.log(`   - Auth Service:     ${SERVICES.auth}`);
  console.log(`   - Quiz Service:     ${SERVICES.quiz}`);
  console.log(`   - Parser Service:   ${SERVICES.parser}`);
  console.log(`   - Attempt Service:  ${SERVICES.attempt}`);
  console.log(`   - Social Service:   ${SERVICES.social}`);
  console.log(`   - Message Service:  ${SERVICES.message}`);
  console.log(`   - Media Service:    ${SERVICES.media}`);
  console.log(`   - Admin Service:    ${SERVICES.admin}`);
  console.log(`   - Challenge Service:${SERVICES.challenge}`);
  console.log(`   - Real-Time WS:     /socket.io -> ${SERVICES.message}`);
});

export { app, server };
export default app;
