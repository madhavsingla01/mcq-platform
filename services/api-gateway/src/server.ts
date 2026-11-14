/**
 * QuizFocus API Gateway
 * Central reverse proxy and security perimeter for all microservices.
 */

import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

import http, { ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { assignRequestId, createHealthMonitor, integerSetting, isSocketPath, requestContext } from './runtime.js';
import { errorBody, proxyFailure, sanitizeProxyRequest } from './contracts.js';
import { socialServiceForPath } from './social-routing.js';
import { pathTraversalGuard } from './middleware/security.js';
import { createUploadRateLimiter } from './middleware/rateLimit.js';
import { createAuditLogMiddleware } from './middleware/auditLog.js';
import { isRecord, requestIdOf } from './request-types.js';

dotenv.config();

const app = express();
const requiredSetting = (name: string) => {
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
  socialFeed: requiredSetting('SOCIAL_FEED_SERVICE_URL'),
  socialInteractions: requiredSetting('SOCIAL_INTERACTIONS_SERVICE_URL'),
  socialComments: requiredSetting('SOCIAL_COMMENTS_SERVICE_URL'),
  message: requiredSetting('MESSAGE_SERVICE_URL'),
  media: requiredSetting('MEDIA_SERVICE_URL'),
  admin: requiredSetting('ADMIN_SERVICE_URL'),
  challenge: requiredSetting('CHALLENGE_SERVICE_URL'),
  aiIntegration: requiredSetting('AI_INTEGRATION_SERVICE_URL'),
  marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://127.0.0.1:5013',
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

// Path traversal & safe filename perimeter defense
app.use(pathTraversalGuard);

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
    return res.status(403).json(errorBody(403, 'Request origin is not allowed', requestIdOf(req)));
  }
  next();
});

if (NODE_ENV !== 'test') {
  morgan.token('request-id', req => req.requestId);
  morgan.token('safe-path', req => 'path' in req && typeof req.path === 'string' ? req.path : undefined);
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
  if (draining) return res.status(503).set('Connection', 'close').json(errorBody(503, 'Service restarting', requestIdOf(req)));
  next();
});

// Proxy helper with standard logging & header forwarding
const makeProxy = (target: string, pathPrefix = '') => createProxyMiddleware({
  target: pathPrefix ? `${target}${pathPrefix}` : target,
  changeOrigin: true,
  xfwd: true,
  proxyTimeout,
  timeout: proxyTimeout + 5000,
  on: {
    proxyReqWs: (proxyReq, req) => {
      const requestId = req.requestId || assignRequestId(req);
      sanitizeProxyRequest(proxyReq, { headers: req.headers, requestId, ip: req.socket.remoteAddress });
    },
    proxyReq: (proxyReq, req) => {
      const ip = 'ip' in req && typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress;
      sanitizeProxyRequest(proxyReq, { headers: req.headers, requestId: requestIdOf(req), ip });
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
      const requestId = req.requestId || assignRequestId(req);
      const code = 'code' in err && typeof err.code === 'string' ? err.code : 'PROXY_ERROR';
      console.error(`[Gateway Proxy Error] ${requestId} ${req.method}`, code);
      if (!res) return;
      const failure = proxyFailure(req.proxyTimedOut ? { code: 'ETIMEDOUT' } : err);
      const body = errorBody(failure.status, failure.message, requestId);

      if (res instanceof ServerResponse) {
        if (!res.headersSent) {
          res.writeHead(failure.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(body));
        }
        return;
      }

      // WS upgrade errors arrive on a raw socket.
      try {
        if (res.writable) res.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      } catch {
        // The client may have already disconnected.
      } finally {
        res.destroy();
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


// 4. Parser, Upload & Static Uploads (Protected with rate limiting and audit logging)
const uploadRateLimiter = createUploadRateLimiter();
const auditLogMiddleware = createAuditLogMiddleware();

app.use('/api/v1/media', auditLogMiddleware, uploadRateLimiter, makeProxy(SERVICES.media, '/api/v1/media'));
app.use('/media', auditLogMiddleware, uploadRateLimiter, makeProxy(SERVICES.media, '/media'));
app.use('/api/v1/upload', auditLogMiddleware, uploadRateLimiter, makeProxy(SERVICES.parser, '/api/v1/upload'));
app.use('/api/v1/parser', auditLogMiddleware, uploadRateLimiter, makeProxy(SERVICES.parser, '/api/v1/parser'));
app.use('/uploads/covers', makeProxy(SERVICES.quiz, '/uploads/covers'));
app.use('/uploads', auditLogMiddleware, uploadRateLimiter, makeProxy(SERVICES.parser, '/uploads'));

// 5. Social & Community
const socialDomainProxies = {
  feedProfile: makeProxy(SERVICES.socialFeed, '/api/v1/social'),
  interactions: makeProxy(SERVICES.socialInteractions, '/api/v1/social'),
  comments: makeProxy(SERVICES.socialComments, '/api/v1/social'),
};
const legacySocialProxy = makeProxy(SERVICES.social, '/api/v1/social');
app.use('/api/v1/social', (req, res, next) => {
  const domain = socialServiceForPath(req.path);
  return (domain ? socialDomainProxies[domain] : legacySocialProxy)(req, res, next);
});
app.use('/api/v1/notifications', makeProxy(SERVICES.socialFeed, '/api/v1/social/notifications'));

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

// 10. AI integration boundary (connectors are intentionally not configured yet)
app.use('/api/v1/ai', makeProxy(SERVICES.aiIntegration, '/api/v1/ai'));

// 9. Marketplace Service & Phase 1 Route Isolation
const marketplaceProxy = makeProxy(SERVICES.marketplace, '/api/v1/marketplace');
app.use('/api/v1/marketplace', (req, res, next) => {
  if (req.path === '/health' || req.path === '/ready') {
    return marketplaceProxy(req, res, next);
  }
  return res.status(404).json(errorBody(404, 'Marketplace business routes are not yet implemented in Phase 1', requestIdOf(req)));
});

// Fallback 404
app.use('*', (req, res) => {
  res.status(404).json(errorBody(404, 'API Gateway route not found', requestIdOf(req)));
});

// Global Gateway Error Handler
const handleGatewayError: ErrorRequestHandler = (err: unknown, req, res, next) => {
  const details = isRecord(err) ? err : {};
  const requestId = req.requestId || assignRequestId(req);
  console.error(JSON.stringify({ service: 'api-gateway', requestId, category: typeof details.name === 'string' ? details.name : undefined, code: typeof details.code === 'string' ? details.code : undefined }));
  const candidate = details.status || details.statusCode;
  const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  if (res.headersSent) return next(err);
  res.status(status).json(errorBody(status, status >= 500 ? 'Internal Gateway Error' : 'Invalid gateway request', requestId));
};
app.use(handleGatewayError);

const server = http.createServer(app);
server.headersTimeout = 15000;
server.requestTimeout = proxyTimeout + 5000;
const sockets = new Set<Socket>();
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
  if (socket instanceof Socket && !draining && isSocketPath(req.url) && (!origin || allowedOrigins.includes(origin)) && typeof socketProxy.upgrade === 'function') {
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
function handleFatalError(event: string, error: unknown) {
  console.error(`[API Gateway ${event}]`, error);
  shutdown(1);
}
process.once('unhandledRejection', error => handleFatalError('unhandledRejection', error));
process.once('uncaughtException', error => handleFatalError('uncaughtException', error));

server.listen(PORT, () => {
  console.log(`🚀 API Gateway active on http://127.0.0.1:${PORT}`);
  console.log('   Proxy Destinations:');
  console.log(`   - Auth Service:     ${SERVICES.auth}`);
  console.log(`   - Quiz Service:     ${SERVICES.quiz}`);
  console.log(`   - Parser Service:   ${SERVICES.parser}`);
  console.log(`   - Attempt Service:  ${SERVICES.attempt}`);
  console.log(`   - Social Feed/Profile Service: ${SERVICES.socialFeed}`);
  console.log(`   - Social Interactions Service: ${SERVICES.socialInteractions}`);
  console.log(`   - Social Comments Service:     ${SERVICES.socialComments}`);
  console.log(`   - Legacy Social Fallback:      ${SERVICES.social}`);
  console.log(`   - Message Service:  ${SERVICES.message}`);
  console.log(`   - Media Service:    ${SERVICES.media}`);
  console.log(`   - Admin Service:    ${SERVICES.admin}`);
  console.log(`   - Challenge Service:${SERVICES.challenge}`);
  console.log(`   - AI Integration Service: ${SERVICES.aiIntegration}`);
  console.log(`   - Marketplace Service: ${SERVICES.marketplace}`);
  console.log(`   - Real-Time WS:     /socket.io -> ${SERVICES.message}`);
});

export { app, server };
export default app;
