import mongoose from 'mongoose';
/**
 * QuizFocus Quiz & Question Core Service
 * Manages quiz authoring, question banks, drafts, challenges, and analytics.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import quizRoutes from './routes/quiz.routes.js';
import attemptCompatibilityRoutes from './routes/attemptCompatibility.routes.js';
import quizzesRoutes from './routes/quizzes.routes.js';
import searchRoutes from './routes/search.routes.js';
import { startCleanupWorker } from './jobs/cleanup.worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Static uploads for quiz covers
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/v1/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({
    service: 'quiz-service',
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/v1/quiz', attemptCompatibilityRoutes);
app.use('/api/v1/quiz', quizRoutes);
app.use('/api/v1/quizzes', quizzesRoutes);
app.use('/api/v1/search', searchRoutes);


// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    startCleanupWorker();
    app.listen(env.PORT, () => {
      logger.info(`🚀 Quiz Service running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start Quiz Service:', err.message);
    process.exit(1);
  }
};

process.on("unhandledRejection", (err) => { logger.error("Unhandled Promise Rejection:", err); });
process.on("uncaughtException", (err) => { logger.error("Uncaught Exception:", err); });

start();

export default app;
