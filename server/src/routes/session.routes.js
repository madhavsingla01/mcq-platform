import { Router } from 'express';
import {
  shareQuiz,
  getSessionByCode,
  joinSession,
  getMessages,
  getRecentSessions,
  getJoinedSessions,
  openLink,
} from '../controllers/session.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

// Public / optional auth
router.get('/recent', optionalAuth, getRecentSessions);

// Authenticated routes
router.get('/joined', protect, getJoinedSessions);
router.post('/open-link', protect, openLink);
router.post('/:quizId/share', protect, shareQuiz);
router.get('/code/:shareCode', protect, getSessionByCode);
router.post('/:sessionId/join', validateObjectId('sessionId'), protect, joinSession);
router.get('/:sessionId/messages', validateObjectId('sessionId'), protect, getMessages);

export default router;
