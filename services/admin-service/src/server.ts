import mongoose from 'mongoose';
/**
 * QuizFocus Admin Service
 * Microservice for platform operations, RBAC, content moderation,
 * user suspensions, immutable audit logs, and system health.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import env from './config/env.js';
import { connectDB, getAuthDb, getQuizDb, getAttemptDb } from './config/db.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import AdminRole, { DEFAULT_ROLES } from './models/AdminRole.model.js';
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
  const healthy = [mongoose.connection, getAuthDb(), getQuizDb(), getAttemptDb()].every(db => db?.readyState === 1);
  res.status(healthy ? 200 : 503).json({
    service: 'admin-service',
    status: healthy ? 'healthy' : 'degraded',
    port: env.PORT,
    timestamp: new Date().toISOString(),
  });
});

// Admin Routes
app.use('/api/v1/admin', adminRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const seedDefaultRoles = async () => {
  try {
    for (const r of DEFAULT_ROLES) {
      await AdminRole.updateOne(
        { slug: r.slug },
        { $setOnInsert: r },
        { upsert: true }
      );
    }
    console.log('🛡️ Default Admin RBAC roles seeded/verified.');
  } catch (err) {
    console.warn('⚠️ Warning: Failed to seed admin roles:', err instanceof Error ? err.message : err);
  }
};

const start = async () => {
  try {
    await connectDB();
    await seedDefaultRoles();

    app.listen(env.PORT, () => {
      console.log(`🚀 QuizFocus Admin Service active on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    console.error('❌ Failed to start Admin Service:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection in Admin Service:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in Admin Service:', err);
});

start();

export default app;
