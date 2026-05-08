import { Router } from 'express';
import {
  createQuiz,
  deleteQuiz,
  getQuiz,
  getQuizAttempts,
  getQuizQuestions,
  listQuizzes,
  updateQuiz,
} from '../controllers/quiz.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.get('/', optionalAuth, listQuizzes);
router.post('/', protect, createQuiz);
router.get('/:id', validateObjectId('id'), optionalAuth, getQuiz);
router.put('/:id', validateObjectId('id'), protect, updateQuiz);
router.delete('/:id', validateObjectId('id'), protect, deleteQuiz);
router.get('/:id/questions', validateObjectId('id'), optionalAuth, getQuizQuestions);
router.get('/:id/attempts', validateObjectId('id'), protect, getQuizAttempts);

export default router;
