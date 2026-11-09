import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'fs/promises';
import path from 'path';
import env from './config/env.js';
import { connectDB, contentDbReady } from './config/db.js';
import mediaRoutes from './routes/media.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { recoverClipJobs, cleanupAbandonedClips } from './services/clipProcessing.service.js';

const app = express();
const storageRoot = path.resolve(env.MEDIA_STORAGE_PATH);
let server;

app.disable('x-powered-by');
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));

app.get('/api/v1/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1 && contentDbReady();
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    service: 'media-service',
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/media', mediaRoutes);
app.use('/media', mediaRoutes);
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});
app.use(errorHandler);

const start = async () => {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required by the media service');
  await fs.mkdir(storageRoot, { recursive: true });
  await connectDB();
  await recoverClipJobs();
  const recover = setInterval(() => recoverClipJobs().catch(() => console.error('Clip job recovery failed')),30000);
  recover.unref();
  const cleanup = setInterval(() => cleanupAbandonedClips().catch(() => console.error('Abandoned media cleanup failed')),3600000);
  cleanup.unref();
  server = app.listen(env.PORT, () => {
    console.log(`Media service running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
};

if (process.env.NODE_ENV !== 'test') {
  start().catch((error) => {
    console.error('Failed to start media service:', error);
    process.exit(1);
  });
}

const stopServer = (signal) => {
  if (!server) return;
  server.close(() => {
    if (signal === 'SIGUSR2') process.kill(process.pid, 'SIGUSR2');
    else process.exit(0);
  });
};

process.once('SIGUSR2', () => stopServer('SIGUSR2'));
process.once('SIGINT', () => stopServer('SIGINT'));
process.once('SIGTERM', () => stopServer('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('[Media Service Unhandled Rejection]:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Media Service Uncaught Exception]:', err);
});

export default app;
