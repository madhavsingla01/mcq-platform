import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

import Quiz from '../models/Quiz.model.js';
import Question from '../models/Question.model.js';
import Attempt from '../models/Attempt.model.js';
import Upload from '../models/Upload.model.js';
import { mergeAttemptTrackingPayload } from '../services/quiz/attemptTracking.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

export const autoFinalizeExpiredChallenges = async () => {
  try {
    const now = new Date();

    // 1. Auto-finalize active challenges that passed their deadline
    const expiredChallenges = await Quiz.find({
      isChallenge: true,
      deadlineAt: { $lte: now },
      challengeStatus: 'active',
    });

    for (const challenge of expiredChallenges) {
      challenge.challengeStatus = 'ended';
      await challenge.save();

      const questions = await Question.find({ quizId: challenge._id }).sort({ orderIndex: 1, questionNumber: 1 });
      const inProgressAttempts = await Attempt.find({
        quizId: challenge._id,
        status: 'in_progress',
      });

      for (const attempt of inProgressAttempts) {
        mergeAttemptTrackingPayload({
          attempt,
          questions,
          payload: {},
          finalizing: true,
        });
        await attempt.save();
      }
    }

    // 2. Auto-finalize any in-progress strict attempts whose deadline has passed
    const expiredAttempts = await Attempt.find({
      status: 'in_progress',
      timerMode: 'strict',
      deadlineAt: { $lte: now },
    });

    for (const attempt of expiredAttempts) {
      const questions = await Question.find({ quizId: attempt.quizId }).sort({ orderIndex: 1, questionNumber: 1 });
      mergeAttemptTrackingPayload({
        attempt,
        questions,
        payload: {},
        finalizing: true,
      });
      await attempt.save();
    }
  } catch (err) {
    logger.error('Failed to auto-finalize expired challenges/attempts:', err.message);
  }
};

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

  // Run every minute for challenge and timer expiration
  cron.schedule('* * * * *', async () => {
    await autoFinalizeExpiredChallenges();
  });
};
