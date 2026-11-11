import { Router } from 'express';
import {
  createComment,
  deleteComment,
  likeComment,
  listComments,
  unlikeComment,
  updateComment,
} from '../controllers/comments.controller.js';
import { optionalAuth, protect } from '../../../social-service/src/middleware/auth.middleware.js';
import { validateObjectId } from '../../../social-service/src/middleware/validation.middleware.js';

const router = Router();

router.get('/quizzes/:quizId/comments', validateObjectId('quizId'), optionalAuth, listComments);
router.post('/quizzes/:quizId/comments', validateObjectId('quizId'), protect, createComment);
router.patch('/comments/:commentId', validateObjectId('commentId'), protect, updateComment);
router.delete('/comments/:commentId', validateObjectId('commentId'), protect, deleteComment);
router.post('/comments/:commentId/like', validateObjectId('commentId'), protect, likeComment);
router.delete('/comments/:commentId/like', validateObjectId('commentId'), protect, unlikeComment);

export default router;
