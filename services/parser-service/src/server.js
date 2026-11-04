/**
 * QuizFocus Ingestion & Parser Service
 * Handles file uploads, MIME inspection, CSV/Excel/JSON parsing, and heuristic column mapping.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import uploadRoutes from './routes/upload.routes.js';
import parserRoutes from './routes/parser.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure storage directories exist
const uploadDirs = ['uploads/temp', 'uploads/parsed', 'uploads/originals'];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

const allowedOrigins = env.CLIENT_URL;

const app = express();

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(csrfProtection);

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    service: 'parser-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: env.MONGO_URI.split('/').pop(),
  });
});

// Routes
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/parser', parserRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    app.listen(env.PORT, () => {
      logger.info(`🚀 Parser Service running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start Parser Service:', err.message);
    process.exit(1);
  }
};

start();

export default app;
