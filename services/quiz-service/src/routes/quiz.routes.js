import { validateQuestionMedia } from '../services/questionMedia.service.js';
import { catchAsync } from '../middleware/error.middleware.js';
import { Router } from 'express';
import {
  generateQuiz,
  getQuiz,
  getQuizByCode,
  getQuizQuestions,
  getMyQuizzes,
  getQuizAnalytics,
  getQuizAttempts,
  deleteQuiz,
  saveManualDraft,
  updateQuiz,
  uploadQuizCover,
  removeQuizCover,
  getChallengeLeaderboard,
  createChallenge,
  getDrafts,
  getDraftById,
  updateDraft,
  publishDraft,
  duplicateDraft,
  deleteDraft,
} from '../controllers/quiz.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateObjectId, validateQuizIdentifier } from '../middleware/validation.middleware.js';

const router = Router();

router.post('/generate', optionalAuth, generateQuiz);
router.post('/challenge', protect, createChallenge);
router.post('/manual', protect, saveManualDraft);
router.post('/media-validation', protect, catchAsync(async (req, res) => {
  if (!Array.isArray(req.body.questions)) return res.status(400).json({ success: false, message: 'questions array is required' });
  const questions = await validateQuestionMedia(req.body.questions, req, { draft: req.body.draft === true });
  res.json({ success: true, data: { questions } });
}));
router.get('/my', protect, getMyQuizzes);

// Dedicated Draft Management Endpoints
router.get('/drafts', protect, getDrafts);
router.get('/drafts/:id', validateObjectId('id'), protect, getDraftById);
router.put('/drafts/:id', validateObjectId('id'), protect, updateDraft);
router.post('/drafts/:id/publish', validateObjectId('id'), protect, publishDraft);
router.post('/drafts/:id/duplicate', validateObjectId('id'), protect, duplicateDraft);
router.delete('/drafts/:id', validateObjectId('id'), protect, deleteDraft);

// Lookup quiz directly by symbolic code (e.g., !QZ-XXXXXX, QZ-XXXXXX)
router.get('/code/:quizCode', optionalAuth, getQuizByCode);

router.get('/:id', validateQuizIdentifier('id'), optionalAuth, getQuiz);
router.get('/:id/leaderboard', validateQuizIdentifier('id'), optionalAuth, getChallengeLeaderboard);
router.put('/:id', validateQuizIdentifier('id'), protect, updateQuiz);
router.post('/:id/cover', validateQuizIdentifier('id'), protect, uploadQuizCover);
router.delete('/:id/cover', validateQuizIdentifier('id'), protect, removeQuizCover);
router.delete('/:id', validateQuizIdentifier('id'), protect, deleteQuiz);
router.get('/:id/analytics', validateQuizIdentifier('id'), optionalAuth, getQuizAnalytics);
router.get('/:id/attempts', validateQuizIdentifier('id'), protect, getQuizAttempts);
router.get('/:id/questions', validateQuizIdentifier('id'), optionalAuth, getQuizQuestions);

export default router;
