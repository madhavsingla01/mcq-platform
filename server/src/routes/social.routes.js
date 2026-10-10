import { Router } from 'express';
import {
  bookmarkQuiz,
  createComment,
  deleteComment,
  getBookmarks,
  getExplore,
  getFeed,
  getNotifications,
  likeQuiz,
  listComments,
  markAllNotificationsRead,
  markNotificationRead,
  shareQuiz,
  unbookmarkQuiz,
  unlikeQuiz,
  updateComment,
} from '../controllers/social.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.get('/feed', optionalAuth, getFeed);
router.get('/explore', optionalAuth, getExplore);
router.get('/bookmarks', protect, getBookmarks);

router.get('/notifications', protect, getNotifications);
router.patch('/notifications/read-all', protect, markAllNotificationsRead);
router.patch('/notifications/:id/read', validateObjectId('id'), protect, markNotificationRead);

router.post('/quizzes/:quizId/like', validateObjectId('quizId'), protect, likeQuiz);
router.delete('/quizzes/:quizId/like', validateObjectId('quizId'), protect, unlikeQuiz);
router.post('/quizzes/:quizId/bookmark', validateObjectId('quizId'), protect, bookmarkQuiz);
router.delete('/quizzes/:quizId/bookmark', validateObjectId('quizId'), protect, unbookmarkQuiz);
router.post('/quizzes/:quizId/share', validateObjectId('quizId'), protect, shareQuiz);

router.get('/quizzes/:quizId/comments', validateObjectId('quizId'), optionalAuth, listComments);
router.post('/quizzes/:quizId/comments', validateObjectId('quizId'), protect, createComment);
router.patch('/comments/:commentId', validateObjectId('commentId'), protect, updateComment);
router.delete('/comments/:commentId', validateObjectId('commentId'), protect, deleteComment);

export default router;
