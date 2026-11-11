import { Router } from 'express';
import {
  createQuiz,
  createChallenge,
  deleteQuiz,
  getQuiz,
  getQuizAnalytics,
  getQuizAttempts,
  getQuizQuestions,
  listQuizzes,
  updateQuiz,
  saveManualDraft,
} from '../controllers/quiz.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId, validateQuizIdentifier } from '../middleware/validation.middleware.js';

const router = Router();

router.get('/', optionalAuth, listQuizzes);
router.post('/challenge', protect, createChallenge);
router.post('/manual', protect, saveManualDraft);
router.post('/', protect, createQuiz);
router.get('/:id', validateQuizIdentifier('id'), optionalAuth, getQuiz);
router.put('/:id', validateQuizIdentifier('id'), protect, updateQuiz);
router.put('/:id/settings', validateQuizIdentifier('id'), protect, updateQuiz);
router.delete('/:id', validateQuizIdentifier('id'), protect, deleteQuiz);
router.get('/:id/questions', validateQuizIdentifier('id'), optionalAuth, getQuizQuestions);
router.get('/:id/analytics', validateQuizIdentifier('id'), optionalAuth, getQuizAnalytics);
router.get('/:id/attempts', validateQuizIdentifier('id'), protect, getQuizAttempts);

export default router;
