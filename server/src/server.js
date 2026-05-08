/**
 * Server entry point.
 * Connects to database and starts the Express server.
 */

import app from './app.js';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import { startCleanupWorker } from './jobs/cleanup.worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const uploadDirs = ['uploads/temp', 'uploads/parsed', 'uploads/originals'];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start background workers
    startCleanupWorker();

    // Create HTTP Server
    const server = http.createServer(app);

    // Initialize Socket.IO
    const io = new Server(server, {
      cors: {
        origin: env.isProd ? process.env.CLIENT_URL : ['http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true
      }
    });

    // Basic socket connection stub
    io.on('connection', (socket) => {
      logger.debug(`Socket connected: ${socket.id}`);
      socket.on('disconnect', () => {
        logger.debug(`Socket disconnected: ${socket.id}`);
      });
    });

    // Attach io to app so routes can use it
    app.set('io', io);

    // Start server
    server.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      logger.info(`   Health: http://localhost:${env.PORT}/api/v1/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION:', err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', err.message);
  process.exit(1);
});

startServer();
