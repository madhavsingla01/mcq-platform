import { Router } from 'express';
import { getProfile, getUserQuizzes, followUser, unfollowUser, getFollowers, getFollowing } from '../controllers/profile.controller.js';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/:username', optionalAuth, getProfile);
router.get('/:username/quizzes', optionalAuth, getUserQuizzes);
router.post('/:username/follow', protect, followUser);
router.delete('/:username/follow', protect, unfollowUser);
router.get('/:username/followers', optionalAuth, getFollowers);
router.get('/:username/following', optionalAuth, getFollowing);

export default router;
