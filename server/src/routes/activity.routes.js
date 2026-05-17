import { Router } from 'express';
import {
  getActivityFeed,
  getRecentQuizzes,
  getSearchHistory,
  saveSearch,
  trackEvent,
} from '../controllers/activity.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/events', optionalAuth, trackEvent);
router.get('/events', optionalAuth, getActivityFeed);
router.get('/recent-quizzes', optionalAuth, getRecentQuizzes);
router.post('/searches', optionalAuth, saveSearch);
router.get('/searches', optionalAuth, getSearchHistory);

export default router;
