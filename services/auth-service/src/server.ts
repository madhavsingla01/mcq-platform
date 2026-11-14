/**
 * QuizFocus Auth & User Service
 * Manages authentication, sessions, profiles, and credentials.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import { pruneExpiredSessions } from './services/session.service.js';

const allowedOrigins = env.CLIENT_URL;

const app = express();
app.set('trust proxy', env.AUTH_TRUST_PROXY_HOPS);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  const body: unknown = req.body;
  if (typeof body === 'object' && body !== null) {
    for (const key of ['__proto__', 'constructor', 'prototype']) Reflect.deleteProperty(body, key);
  }
  next();
});
app.use(cookieParser());
app.use(csrfProtection);

// Health check
app.get('/api/v1/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    service: 'auth-service',
    status: connected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: connected ? 'connected' : 'unavailable',
  });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', profileRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    const cleanupExpiredSessions = async () => {
      try {
        const result = await pruneExpiredSessions();
        if (result.modifiedCount) logger.info(`Removed expired sessions from ${result.modifiedCount} accounts`);
      } catch (error) {
        logger.error('Failed to remove expired sessions:', error instanceof Error ? error.message : error);
      }
    };
    void cleanupExpiredSessions();
    const sessionCleanupTimer = setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
    sessionCleanupTimer.unref();
    app.listen(env.PORT, () => {
      logger.info(`🚀 Auth Service running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start Auth Service:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
};

process.on("unhandledRejection", (err) => { logger.error("Unhandled Promise Rejection:", err); });
process.on("uncaughtException", (err) => { logger.error("Uncaught Exception:", err); });

start();

export default app;
