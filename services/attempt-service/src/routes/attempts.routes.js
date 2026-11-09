import { Router } from 'express';
import {
  answerAttempt,
  getAttemptQuestions,
  getAttemptById,
  getAttemptReview,
  startAttempt,
  submitAttemptById,
  syncAttemptTime,
  getInProgressAttempts,
  getSubmissionCalendar,
  getUserAttempts,
  getResultByAttemptId,
  getResult,
  getActiveAttempt,
  syncAttempt,
  submitAttempt,
} from '../controllers/attempt.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';
import { resolveQuizIdentifier } from '../middleware/quizIdentifier.middleware.js';

const router = Router();

// Standard attempt operations
router.get('/', optionalAuth, getUserAttempts);
router.get('/my-attempts', optionalAuth, getUserAttempts);
router.get('/user', optionalAuth, getUserAttempts);
router.post('/start', optionalAuth, resolveQuizIdentifier, startAttempt);
router.get('/in-progress', protect, getInProgressAttempts);
router.get('/submission-calendar', protect, getSubmissionCalendar);
router.get('/:id/questions', validateObjectId('id'), optionalAuth, getAttemptQuestions);
router.get('/:id/result', validateObjectId('id'), optionalAuth, getResultByAttemptId);
router.get('/:id/review', validateObjectId('id'), optionalAuth, getAttemptReview);
router.post('/:id/answer', validateObjectId('id'), optionalAuth, answerAttempt);
router.post('/:id/sync-time', validateObjectId('id'), optionalAuth, syncAttemptTime);
router.post('/:id/submit', validateObjectId('id'), optionalAuth, submitAttemptById);
router.get('/:id', validateObjectId('id'), optionalAuth, getAttemptById);

// Aliases for /api/v1/quiz/attempts/:attemptId/result and /api/v1/quiz/:id/attempt
router.get('/attempts/:attemptId/result', validateObjectId('attemptId'), optionalAuth, getResultByAttemptId);
router.get('/:id/attempt/active', optionalAuth, resolveQuizIdentifier, getActiveAttempt);
router.post('/:id/attempt', optionalAuth, resolveQuizIdentifier, startAttempt);
router.put('/:id/attempt/:attemptId', validateObjectId('attemptId'), optionalAuth, resolveQuizIdentifier, submitAttempt);
router.put('/:id/attempt/:attemptId/sync-progress', validateObjectId('attemptId'), optionalAuth, resolveQuizIdentifier, syncAttempt);
router.post('/:id/attempt/:attemptId/sync-progress', validateObjectId('attemptId'), optionalAuth, resolveQuizIdentifier, syncAttempt);
router.get('/:id/attempt/:attemptId/result', validateObjectId('attemptId'), optionalAuth, resolveQuizIdentifier, getResult);

export default router;
