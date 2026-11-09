import mongoose from 'mongoose';
/**
 * QuizFocus Attempt & Scoring Service
 * Handles attempt lifecycles, timer sync, locking, scoring, and performance analytics.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import attemptsRoutes from './routes/attempts.routes.js';
import { startFinalizationWorker } from './jobs/finalization.worker.js';

const allowedOrigins = env.CLIENT_URL;

const app = express();

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(csrfProtection);

// Health check
app.get('/api/v1/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({
    service: 'attempt-service',
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/v1/attempts', attemptsRoutes);
app.use('/api/v1/quiz/attempts', attemptsRoutes);
app.use('/api/v1/quiz', attemptsRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    const stopWorker = startFinalizationWorker(message => logger.error(message));
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Attempt Service running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      const drained = new Promise(resolve => server.close(resolve));
      server.closeIdleConnections?.();
      await Promise.all([drained, stopWorker()]);
      await mongoose.disconnect();
      clearTimeout(deadline);
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (err) {
    logger.error('Failed to start Attempt Service:', err.message);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

start();

export default app;
