import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { logger } from './utils/logger.js';

export function createSocialServiceApp(serviceName, routes) {
  const app = express();

  app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get('/api/v1/health', (req, res) => {
    const healthy = mongoose.connection.readyState === 1;
    res.status(healthy ? 200 : 503).json({
      service: serviceName,
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1/social', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export async function startSocialService(app, serviceName) {
  const displayName = serviceName === 'social-service' ? 'Social Service' : serviceName;

  process.on('unhandledRejection', (error) => {
    logger.error(`Unhandled Promise Rejection in ${serviceName}:`, error);
  });
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception in ${serviceName}:`, error);
  });

  try {
    await connectDB();
    app.listen(env.PORT, () => {
      logger.info(`${serviceName === 'social-service' ? '🚀 ' : ''}${displayName} running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (error) {
    logger.error(`Failed to start ${displayName}:`, error.message);
    process.exit(1);
  }
}
