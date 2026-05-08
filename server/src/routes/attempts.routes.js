import { Router } from 'express';
import {
  answerAttempt,
  getAttemptById,
  getAttemptReview,
  startAttempt,
  submitAttemptById,
  syncAttemptTime,
} from '../controllers/quiz.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.post('/start', optionalAuth, startAttempt);
router.get('/:id', validateObjectId('id'), optionalAuth, getAttemptById);
router.get('/:id/review', validateObjectId('id'), optionalAuth, getAttemptReview);
router.post('/:id/answer', validateObjectId('id'), optionalAuth, answerAttempt);
router.post('/:id/sync-time', validateObjectId('id'), optionalAuth, syncAttemptTime);
router.post('/:id/submit', validateObjectId('id'), optionalAuth, submitAttemptById);

export default router;
