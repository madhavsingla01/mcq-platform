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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:5001',
  quiz: process.env.QUIZ_SERVICE_URL || 'http://localhost:5002',
  parser: process.env.PARSER_SERVICE_URL || 'http://localhost:5003',
  attempt: process.env.ATTEMPT_SERVICE_URL || 'http://localhost:5004',
  social: process.env.SOCIAL_SERVICE_URL || 'http://localhost:5005',
  message: process.env.MESSAGE_SERVICE_URL || 'http://localhost:5006',
  media: process.env.MEDIA_SERVICE_URL || 'http://localhost:5007',
  admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:5008',
};

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS Configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
  credentials: true,
}));

app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// System Health Aggregator
app.get('/api/v1/health', async (req, res) => {
  const checkService = async (name, url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const resp = await fetch(`${url}/api/v1/health`, { signal: controller.signal });
      const data = await resp.json().catch(() => ({}));
      return {
        ...data,
        service: data.service || name,
        status: resp.ok ? (data.status || 'healthy') : 'degraded',
        code: resp.status,
      };
    } catch (err) {
      return { service: name, status: 'unreachable', error: err.message };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const [authHealth, quizHealth, parserHealth, attemptHealth, socialHealth, messageHealth, mediaHealth, adminHealth] = await Promise.all([
    checkService('auth', SERVICES.auth),
    checkService('quiz', SERVICES.quiz),
    checkService('parser', SERVICES.parser),
    checkService('attempt', SERVICES.attempt),
    checkService('social', SERVICES.social),
    checkService('message', SERVICES.message),
    checkService('media', SERVICES.media),
    checkService('admin', SERVICES.admin),
  ]);

  const allHealthy = [authHealth, quizHealth, parserHealth, attemptHealth, socialHealth, messageHealth, mediaHealth, adminHealth]
    .every(s => s.status === 'healthy');

  res.status(allHealthy ? 200 : 207).json({
    success: true,
    gateway: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      auth: authHealth,
      quiz: quizHealth,
      parser: parserHealth,
      attempt: attemptHealth,
      social: socialHealth,
      message: messageHealth,
      media: mediaHealth,
      admin: adminHealth,
    },
  });
});

// Proxy helper with standard logging & header forwarding
const makeProxy = (target, pathPrefix = '') => createProxyMiddleware({
  target: pathPrefix ? `${target}${pathPrefix}` : target,
  changeOrigin: true,
  ws: true,
  on: {
    proxyReq: (proxyReq, req) => {
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
      console.error(`[Gateway Proxy Error] ${req.method} ${req.url} -> ${target}:`, err.message);
      if (!res) return;

      // 1. Standard Express Response
      if (typeof res.status === 'function') {
        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            message: `Downstream service unavailable: ${err.message}`,
          });
        }
        return;
      }

      // 2. Standard Node.js http.ServerResponse
      if (typeof res.writeHead === 'function') {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: `Downstream service unavailable: ${err.message}`,
          }));
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

// 6. Direct Messaging & Real-Time WebSockets
const socketProxy = makeProxy(SERVICES.message);
app.use('/socket.io', socketProxy);
app.use('/api/v1/messages', makeProxy(SERVICES.message, '/api/v1/messages'));

// 7. Admin Control Center & Operations
app.use('/api/v1/admin', makeProxy(SERVICES.admin, '/api/v1/admin'));

// Fallback 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Gateway route not found: ${req.originalUrl}`,
  });
});

const server = http.createServer(app);

// Forward WebSocket upgrade requests to the message service
server.on('upgrade', (req, socket, head) => {
  socket.on('error', (err) => {
    console.error('[Gateway WS Client Socket Error]:', err.message);
  });
  if (req.url?.startsWith('/socket.io') && typeof socketProxy.upgrade === 'function') {
    socketProxy.upgrade(req, socket, head);
  }
});

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
  console.log(`   - Real-Time WS:     /socket.io -> ${SERVICES.message}`);
});

export { app, server };
export default app;
