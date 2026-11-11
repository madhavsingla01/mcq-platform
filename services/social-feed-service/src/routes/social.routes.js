import { Router } from 'express';
import {
  followUser,
  getChallengesOverview,
  getExplore,
  getFeed,
  getNotifications,
  getProfile,
  getUnreadNotificationCount,
  getUserActivity,
  getUserQuizzes,
  listFollowers,
  listFollowing,
  markAllNotificationsRead,
  markNotificationRead,
  unfollowUser,
} from '../controllers/feedProfile.controller.js';
import { optionalAuth, protect } from '../../../social-service/src/middleware/auth.middleware.js';
import { validateObjectId } from '../../../social-service/src/middleware/validation.middleware.js';

const router = Router();

router.get('/challenges-overview', optionalAuth, getChallengesOverview);
router.get('/feed', optionalAuth, getFeed);
router.get('/explore', optionalAuth, getExplore);

router.get('/profile/:username', optionalAuth, getProfile);
router.get('/users/:username/quizzes', optionalAuth, getUserQuizzes);
router.get('/users/:username/activity', optionalAuth, getUserActivity);
router.get('/users/:username/followers', optionalAuth, listFollowers);
router.get('/users/:username/following', optionalAuth, listFollowing);
router.post('/users/:username/follow', protect, followUser);
router.delete('/users/:username/follow', protect, unfollowUser);

router.get('/notifications', protect, getNotifications);
router.get('/notifications/unread-count', protect, getUnreadNotificationCount);
router.patch('/notifications/read-all', protect, markAllNotificationsRead);
router.patch('/notifications/:id/read', validateObjectId('id'), protect, markNotificationRead);

export default router;
