/**
 * QuizFocus Direct Messaging Service
 * Manages 1-on-1 conversations, real-time message exchange, unread badges, and emoji reactions.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import messageRoutes from './routes/message.routes.js';

import http from 'http';
import { initSocketServer } from './socket/socketHandler.js';

const allowedOrigins = env.CLIENT_URL;

const app = express();
const server = http.createServer(app);

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
    service: 'message-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: env.MONGO_URI.split('/').pop(),
  });
});

// Routes
app.use('/api/v1/messages', messageRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize real-time Socket.IO
initSocketServer(server);

const start = async () => {
  try {
    await connectDB();
    server.listen(env.PORT, () => {
      logger.info(`🚀 Message Service running with Socket.IO on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start Message Service:', err.message);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

start();

export { app, server };
export default app;
