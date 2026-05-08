import { Router } from 'express';
import {
  getQuestionAnalytics,
  getQuizAnalytics,
  getUserAnalytics,
} from '../controllers/quiz.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.get('/quiz/:id', validateObjectId('id'), optionalAuth, getQuizAnalytics);
router.get('/question/:id', validateObjectId('id'), optionalAuth, getQuestionAnalytics);
router.get('/user/:id', validateObjectId('id'), protect, getUserAnalytics);

export default router;
