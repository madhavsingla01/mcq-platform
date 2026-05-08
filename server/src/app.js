/**
 * Express application setup.
 * Configures middleware, routes, and error handling.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import parserRoutes from './routes/parser.routes.js';
import quizRoutes from './routes/quiz.routes.js';
import quizzesRoutes from './routes/quizzes.routes.js';
import attemptsRoutes from './routes/attempts.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import aiRoutes from './routes/ai.routes.js';
import communityRoutes from './routes/community.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// ===== BODY PARSING =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ===== LOGGING =====
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ===== STATIC FILES =====
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== HEALTH CHECK =====
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'MCQ Quiz Platform API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ===== API ROUTES (v1) =====
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/parser', parserRoutes);
app.use('/api/v1/quiz', quizRoutes);
app.use('/api/v1/quizzes', quizzesRoutes);
app.use('/api/v1/attempts', attemptsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/community', communityRoutes);

// ===== ERROR HANDLING =====
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
