import type { Server } from 'node:http';
import express, { type RequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import logger from './utils/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import analyticsRoutes from './routes/analytics.routes.js';

const app = express();


app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Top-level health and readiness probes
const probeHandler: RequestHandler = (_req, res) => {
  res.status(200).json({
    service: 'analytics-service',
    status: 'healthy',
    ready: true,
    timestamp: new Date().toISOString(),
  });
};

app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    service: 'analytics-service',
    message: 'QuizFocus Analytics Service. This port serves the API. Open the QuizFocus desktop app to use the website.',
    health: '/api/v1/health',
  });
});

app.get('/health', probeHandler);
app.get('/ready', probeHandler);
app.get('/livez', probeHandler);
app.get('/api/v1/health', probeHandler);
app.get('/api/v1/ready', probeHandler);

// Mount domain routes under /api/v1/analytics
app.use('/api/v1/analytics', analyticsRoutes);

// Catch-all 404 and global error handling
app.use(notFoundHandler);
app.use(errorHandler);

let server: Server | null = null;
let stopping = false;

export const shutdown = async (exitProcess = true) => {
  if (stopping) return;
  stopping = true;

  logger.info('Shutting down Analytics Service...');

  const deadline = setTimeout(() => {
    logger.warn('Shutdown deadline reached, forcing exit.');
    if (exitProcess) process.exit(1);
  }, 10000);
  deadline.unref();

  try {
    if (server) {
      const current = server;
      current.closeIdleConnections();
      await new Promise<void>((resolve, reject) => current.close((error) => (error ? reject(error) : resolve())));
      server = null;
      logger.info('HTTP server closed.');
    }
    await disconnectDB();
  } catch (err) {
    logger.error('Error during HTTP server drain or DB disconnect:', err);
  } finally {
    clearTimeout(deadline);
    stopping = false;
    if (exitProcess) process.exit(0);
  }
};

export const start = async (port = env.PORT) => {
  stopping = false;
  try {
    await connectDB();
  } catch (err) {
    logger.error('Database connection failed during startup:', err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV !== 'test') {
      throw err;
    }
  }

  return new Promise<Server>((resolve, reject) => {
    try {
      const listening = app.listen(port, () => {
        logger.info(`🚀 Analytics Service running on port ${port} [${env.NODE_ENV}]`);
        resolve(listening);
      });

      server = listening;
      listening.on('error', (err) => {
        logger.error('Analytics Service error:', err.message);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

process.once('SIGINT', () => shutdown(true));
process.once('SIGTERM', () => shutdown(true));

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error('Failed to start Analytics Service:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { app };
export default app;
