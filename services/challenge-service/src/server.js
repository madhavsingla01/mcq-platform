import mongoose from 'mongoose';
/**
 * QuizFocus Challenge Service
 * Microservice dedicated exclusively to competitive challenges,
 * countdown arenas, deadline locks, single-attempt rules, and leaderboards.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import challengeRoutes from './routes/challenge.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.CLIENT_URL.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(csrfProtection);

if (env.isDev) {
  app.use(morgan('dev'));
}

// Global Microservice Health Check
app.get('/api/v1/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({
    service: 'challenge-service',
    status: healthy ? 'healthy' : 'degraded',
    port: env.PORT,
    timestamp: new Date().toISOString(),
  });
});

// Dedicated Challenge Service Routes
app.use('/api/v1/challenges', challengeRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    app.listen(env.PORT, () => {
      console.log(`🏆 QuizFocus Challenge Service active on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    console.error('❌ Failed to start Challenge Service:', err.message);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  console.error('[Challenge Service Unhandled Rejection]:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Challenge Service Uncaught Exception]:', err);
});

start();

export default app;
