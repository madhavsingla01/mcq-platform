import { Router } from 'express';
import {
  bookmarkQuiz,
  getBookmarks,
  getShareContacts,
  likeQuiz,
  shareQuiz,
  shareQuizDirect,
  unbookmarkQuiz,
  unlikeQuiz,
} from '../controllers/quizInteractions.controller.js';
import { protect } from '../../../social-service/src/middleware/auth.middleware.js';
import { validateObjectId } from '../../../social-service/src/middleware/validation.middleware.js';

const router = Router();

router.get('/bookmarks', protect, getBookmarks);
router.get('/share-contacts', protect, getShareContacts);

router.post('/quizzes/:quizId/like', validateObjectId('quizId'), protect, likeQuiz);
router.delete('/quizzes/:quizId/like', validateObjectId('quizId'), protect, unlikeQuiz);
router.post('/quizzes/:quizId/bookmark', validateObjectId('quizId'), protect, bookmarkQuiz);
router.delete('/quizzes/:quizId/bookmark', validateObjectId('quizId'), protect, unbookmarkQuiz);
router.post('/quizzes/:quizId/share', validateObjectId('quizId'), protect, shareQuiz);
router.post('/quizzes/:quizId/share-direct', validateObjectId('quizId'), protect, shareQuizDirect);

export default router;
