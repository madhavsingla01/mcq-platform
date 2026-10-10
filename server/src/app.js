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
import { csrfProtection } from './middleware/csrf.middleware.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import parserRoutes from './routes/parser.routes.js';
import quizRoutes from './routes/quiz.routes.js';
import quizzesRoutes from './routes/quizzes.routes.js';
import attemptsRoutes from './routes/attempts.routes.js';
import profileRoutes from './routes/profile.routes.js';
import socialRoutes from './routes/social.routes.js';

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
app.use(csrfProtection);

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
app.use('/api/v1/users', profileRoutes);
app.use('/api/v1/social', socialRoutes);

// ===== SPA FALLBACK =====
// Serve frontend static files in production, or redirect to Vite dev server in development.
const clientDistPath = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDistPath));
}

app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    return next();
  }
  
  if (process.env.NODE_ENV === 'development') {
    // Redirect direct backend frontend route hits (localhost:5000/admin) to frontend dev server
    return res.redirect(`http://localhost:5173${req.originalUrl}`);
  }
  
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ===== ERROR HANDLING =====
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
