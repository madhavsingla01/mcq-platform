import { Router } from 'express';
import {
  answerAttempt,
  getAttemptById,
  getAttemptReview,
  startAttempt,
  submitAttemptById,
  syncAttemptTime,
  getInProgressAttempts,
  getResultByAttemptId,
  getResult,
  getActiveAttempt,
  syncAttempt,
  submitAttempt,
} from '../controllers/attempt.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

// Standard attempt operations
router.post('/start', optionalAuth, startAttempt);
router.get('/in-progress', protect, getInProgressAttempts);
router.get('/:id/result', validateObjectId('id'), optionalAuth, getResultByAttemptId);
router.get('/:id/review', validateObjectId('id'), optionalAuth, getAttemptReview);
router.post('/:id/answer', validateObjectId('id'), optionalAuth, answerAttempt);
router.post('/:id/sync-time', validateObjectId('id'), optionalAuth, syncAttemptTime);
router.post('/:id/submit', validateObjectId('id'), optionalAuth, submitAttemptById);
router.get('/:id', validateObjectId('id'), optionalAuth, getAttemptById);

// Aliases for /api/v1/quiz/attempts/:attemptId/result and /api/v1/quiz/:id/attempt
router.get('/attempts/:attemptId/result', validateObjectId('attemptId'), optionalAuth, getResultByAttemptId);
router.get('/:id/attempt/active', validateObjectId('id'), optionalAuth, getActiveAttempt);
router.post('/:id/attempt', validateObjectId('id'), optionalAuth, startAttempt);
router.put('/:id/attempt/:attemptId', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, submitAttempt);
router.put('/:id/attempt/:attemptId/sync-progress', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, syncAttempt);
router.post('/:id/attempt/:attemptId/sync-progress', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, syncAttempt);
router.get('/:id/attempt/:attemptId/result', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, getResult);

export default router;
