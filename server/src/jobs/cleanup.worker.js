import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Run every hour
export const startCleanupWorker = () => {
  cron.schedule('0 * * * *', () => {
    logger.info('🧹 Running cleanup worker...');
    try {
      const directories = ['originals', 'temp'];
      let deletedFiles = 0;

      directories.forEach(dir => {
        const targetPath = path.join(UPLOADS_DIR, dir);
        if (fs.existsSync(targetPath)) {
          const files = fs.readdirSync(targetPath);
          const now = Date.now();

          files.forEach(file => {
            if (file === '.gitkeep') return;
            const filePath = path.join(targetPath, file);
            const stats = fs.statSync(filePath);
            
            // Delete files older than 24 hours
            if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
              fs.unlinkSync(filePath);
              deletedFiles++;
            }
          });
        }
      });

      logger.info(`🧹 Cleanup worker finished. Deleted ${deletedFiles} old files.`);
    } catch (err) {
      logger.error('Cleanup worker failed:', err.message);
    }
  });
};
