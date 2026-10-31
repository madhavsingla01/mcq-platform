import { Router } from 'express';
import {
  bookmarkQuiz,
  createComment,
  deleteComment,
  followUser,
  getBookmarks,
  getChallengesOverview,
  getExplore,
  getFeed,
  getNotifications,
  getUnreadNotificationCount,
  getShareContacts,
  getUserActivity,
  likeComment,
  likeQuiz,
  listComments,
  listFollowers,
  listFollowing,
  markAllNotificationsRead,
  markNotificationRead,
  shareQuiz,
  shareQuizDirect,
  unbookmarkQuiz,
  unfollowUser,
  unlikeComment,
  unlikeQuiz,
  updateComment,
} from '../controllers/social.controller.js';
import { getProfile, getUserQuizzes } from '../controllers/profile.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.get('/challenges-overview', optionalAuth, getChallengesOverview);
router.get('/feed', optionalAuth, getFeed);
router.get('/explore', optionalAuth, getExplore);
router.get('/bookmarks', protect, getBookmarks);
router.get('/share-contacts', protect, getShareContacts);

// Profile and user relationship routes under /social
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

router.post('/quizzes/:quizId/like', validateObjectId('quizId'), protect, likeQuiz);
router.delete('/quizzes/:quizId/like', validateObjectId('quizId'), protect, unlikeQuiz);
router.post('/quizzes/:quizId/bookmark', validateObjectId('quizId'), protect, bookmarkQuiz);
router.delete('/quizzes/:quizId/bookmark', validateObjectId('quizId'), protect, unbookmarkQuiz);
router.post('/quizzes/:quizId/share', validateObjectId('quizId'), protect, shareQuiz);
router.post('/quizzes/:quizId/share-direct', validateObjectId('quizId'), protect, shareQuizDirect);

router.get('/quizzes/:quizId/comments', validateObjectId('quizId'), optionalAuth, listComments);
router.post('/quizzes/:quizId/comments', validateObjectId('quizId'), protect, createComment);
router.patch('/comments/:commentId', validateObjectId('commentId'), protect, updateComment);
router.delete('/comments/:commentId', validateObjectId('commentId'), protect, deleteComment);
router.post('/comments/:commentId/like', validateObjectId('commentId'), protect, likeComment);
router.delete('/comments/:commentId/like', validateObjectId('commentId'), protect, unlikeComment);

export default router;
