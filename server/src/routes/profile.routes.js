import { Router } from 'express';
import { getProfile, getUserQuizzes } from '../controllers/profile.controller.js';
import {
  followUser,
  getUserActivity,
  listFollowers,
  listFollowing,
  unfollowUser,
} from '../controllers/social.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/:username', optionalAuth, getProfile);
router.get('/:username/quizzes', optionalAuth, getUserQuizzes);
router.get('/:username/activity', optionalAuth, getUserActivity);
router.get('/:username/followers', optionalAuth, listFollowers);
router.get('/:username/following', optionalAuth, listFollowing);
router.post('/:username/follow', protect, followUser);
router.delete('/:username/follow', protect, unfollowUser);

export default router;
