import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

import Quiz from '../models/Quiz.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import QuestionAnalytics from '../models/QuestionAnalytics.model.js';
import QuizSession from '../models/QuizSession.model.js';
import SessionMessage from '../models/SessionMessage.model.js';
import JoinedSession from '../models/JoinedSession.model.js';
import Upload from '../models/Upload.model.js';
import { isSessionExpired } from '../utils/sessionSettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

export const startCleanupWorker = () => {
  // Run every hour for temp files
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

  // Run every hour for shared session expiry settings
  cron.schedule('15 * * * *', async () => {
    logger.info('Running shared session expiry worker...');
    try {
      const activeSessions = await QuizSession.find({
        isActive: true,
        'settings.lifetime': { $in: ['auto_expire', 'manual'] },
      });

      const expiredSessionIds = activeSessions
        .filter((session) => isSessionExpired(session))
        .map((session) => session._id);

      if (expiredSessionIds.length > 0) {
        await QuizSession.updateMany(
          { _id: { $in: expiredSessionIds } },
          { $set: { isActive: false } }
        );
      }

      logger.info(`Shared session expiry worker finished. Deactivated ${expiredSessionIds.length} sessions.`);
    } catch (err) {
      logger.error('Shared session expiry worker failed:', err.message);
    }
  });

  // Run daily at midnight for stale quizzes (older than 30 days)
  cron.schedule('0 0 * * *', async () => {
    logger.info('🧹 Running quiz auto-deletion worker...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find quizzes where updatedAt is older than 30 days
      const staleQuizzes = await Quiz.find({ updatedAt: { $lt: thirtyDaysAgo } }, '_id');
      const quizIds = staleQuizzes.map(q => q._id);

      if (quizIds.length > 0) {
        const quizSessions = await QuizSession.find({ quizId: { $in: quizIds } }, '_id');
        const sessionIds = quizSessions.map(s => s._id);

        await Promise.all([
          Quiz.deleteMany({ _id: { $in: quizIds } }),
          Question.deleteMany({ quizId: { $in: quizIds } }),
          Attempt.deleteMany({ quizId: { $in: quizIds } }),
          QuestionAnalytics.deleteMany({ quizId: { $in: quizIds } }),
          QuizSession.deleteMany({ quizId: { $in: quizIds } }),
          SessionMessage.deleteMany({ sessionId: { $in: sessionIds } }),
          JoinedSession.deleteMany({ sessionId: { $in: sessionIds } }),
          Upload.deleteMany({ quizId: { $in: quizIds } }),
        ]);

        logger.info(`🧹 Quiz auto-deletion finished. Deleted ${quizIds.length} stale quizzes.`);
      } else {
        logger.info('🧹 Quiz auto-deletion finished. No stale quizzes found.');
      }
    } catch (err) {
      logger.error('Quiz auto-deletion worker failed:', err.message);
    }
  });
};
