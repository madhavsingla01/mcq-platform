import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import marketplaceRoutes from './routes/marketplace.routes.js';

const app = express();

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Top-level health and readiness probes
const probeHandler = (req, res) => {
  res.status(200).json({
    service: 'marketplace-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', probeHandler);
app.get('/ready', probeHandler);
app.get('/api/v1/health', probeHandler);
app.get('/api/v1/ready', probeHandler);

// Mount domain routes under /api/v1/marketplace
app.use('/api/v1/marketplace', marketplaceRoutes);

// Catch-all 404 and global error handling
app.use(notFoundHandler);
app.use(errorHandler);

let server = null;
let stopping = false;

export const shutdown = async (exitProcess = true) => {
  if (stopping) return;
  stopping = true;

  logger.info('Shutting down Marketplace Service...');

  const deadline = setTimeout(() => {
    logger.warn('Shutdown deadline reached, forcing exit.');
    if (exitProcess) process.exit(1);
  }, 10000);
  deadline.unref();

  try {
    if (server) {
      server.closeIdleConnections?.();
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed.');
    }
  } catch (err) {
    logger.error('Error during HTTP server drain:', err);
  } finally {
    clearTimeout(deadline);
    if (exitProcess) process.exit(0);
  }
};

export const start = (port = env.PORT) => {
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(port, () => {
        logger.info(`🚀 Marketplace Service running on port ${port} [${env.NODE_ENV}]`);
        resolve(server);
      });

      server.on('error', (err) => {
        logger.error('Marketplace Service error:', err.message);
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
    logger.error('Failed to start Marketplace Service:', err.message);
    process.exit(1);
  });
}

export { app };
export default app;
