/**
 * QuizFocus Social & Community Service
 * Manages feed, explore discovery, reactions (likes/upvotes), bookmarks, comments, shares, and activity.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import socialRoutes from './routes/social.routes.js';

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
  res.json({
    service: 'social-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: env.MONGO_URI.split('/').pop(),
  });
});

// Routes
app.use('/api/v1/social', socialRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    app.listen(env.PORT, () => {
      logger.info(`🚀 Social Service running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start Social Service:', err.message);
    process.exit(1);
  }
};

start();

export default app;
