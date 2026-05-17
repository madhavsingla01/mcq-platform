import { Router } from 'express';
import {
  generateQuiz,
  getQuiz,
  getQuizQuestions,
  startAttempt,
  submitAttempt,
  getResult,
  getResultByAttemptId,
  getMyQuizzes,
  getQuizAnalytics,
  getQuizAttempts,
  syncAttempt,
  getActiveAttempt,
} from '../controllers/quiz.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.post('/generate', optionalAuth, generateQuiz);
router.get('/my', protect, getMyQuizzes);
router.get('/attempts/:attemptId/result', validateObjectId('attemptId'), optionalAuth, getResultByAttemptId);
router.get('/:id', validateObjectId('id'), optionalAuth, getQuiz);
router.get('/:id/analytics', validateObjectId('id'), optionalAuth, getQuizAnalytics);
router.get('/:id/attempts', validateObjectId('id'), protect, getQuizAttempts);
router.get('/:id/questions', validateObjectId('id'), optionalAuth, getQuizQuestions);
router.get('/:id/attempt/active', validateObjectId('id'), optionalAuth, getActiveAttempt);
router.post('/:id/attempt', validateObjectId('id'), optionalAuth, startAttempt);
router.put('/:id/attempt/:attemptId', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, submitAttempt);
router.put('/:id/attempt/:attemptId/sync', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, syncAttempt);
router.post('/:id/attempt/:attemptId/sync', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, syncAttempt);
router.get('/:id/attempt/:attemptId/result', validateObjectId('id'), validateObjectId('attemptId'), optionalAuth, getResult);

export default router;
