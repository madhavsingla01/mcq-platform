import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'fs/promises';
import path from 'path';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import mediaRoutes from './routes/media.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();
const storageRoot = path.resolve(env.MEDIA_STORAGE_PATH);
let server;

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));

app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    service: 'media-service',
    status: 'healthy',
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

export default app;
