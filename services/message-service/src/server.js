/**
 * QuizFocus Direct Messaging Service
 * Manages 1-on-1 conversations, real-time message exchange, unread badges, and emoji reactions.
 */

import express from 'express';
import mongoose from 'mongoose';
import Message from './models/Message.model.js';
import Conversation from './models/Conversation.model.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import messageRoutes from './routes/message.routes.js';

import http from 'http';
import { initSocketServer, getIO } from './socket/socketHandler.js';

const allowedOrigins = env.CLIENT_URL;

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(cookieParser());
app.use(csrfProtection);

// Health check
app.get('/api/v1/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({
    service: 'message-service',
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
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
    await Promise.all([Message.init(), Conversation.init()]);
    server.listen(env.PORT, () => {
      logger.info(`🚀 Message Service running with Socket.IO on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start Message Service:', err.message);
    process.exit(1);
  }
};

let stopping = false;
const shutdown = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(code), 10000);
  deadline.unref();
  getIO()?.close();
  server.close();
  await mongoose.disconnect();
  clearTimeout(deadline);
  process.exit(code);
};
process.once('SIGTERM', () => shutdown());
process.once('SIGINT', () => shutdown());
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.once(event, err => { logger.error(event, err); shutdown(1); });
}

start();

export { app, server };
export default app;
