import { Router } from 'express';
import {
  shareQuiz,
  getSessionByCode,
  joinSession,
  getMessages,
  getRecentSessions,
  getJoinedSessions,
  openLink,
  leaveSession,
  getLeaderboard,
  destroySession,
  regenerateShareLink,
} from '../controllers/session.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

// Public / optional auth
router.get('/recent', optionalAuth, getRecentSessions);

// Authenticated routes
router.get('/joined', protect, getJoinedSessions);
router.post('/open-link', optionalAuth, openLink);
router.post('/:quizId/share', protect, shareQuiz);
router.get('/code/:shareCode', optionalAuth, getSessionByCode);
router.post('/:sessionId/join', validateObjectId('sessionId'), optionalAuth, joinSession);
router.get('/:sessionId/messages', validateObjectId('sessionId'), optionalAuth, getMessages);
router.get('/:sessionId/leaderboard', validateObjectId('sessionId'), optionalAuth, getLeaderboard);
router.post('/:sessionId/regenerate-link', validateObjectId('sessionId'), protect, regenerateShareLink);
router.post('/:sessionId/destroy', validateObjectId('sessionId'), protect, destroySession);

// Beacon-friendly session leave (optionalAuth — sendBeacon may not send cookies)
router.post('/:sessionId/leave', validateObjectId('sessionId'), optionalAuth, leaveSession);

export default router;
