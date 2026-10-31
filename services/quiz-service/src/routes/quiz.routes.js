import { Router } from 'express';
import {
  generateQuiz,
  getQuiz,
  getQuizByCode,
  getQuizQuestions,
  startAttempt,
  submitAttempt,
  getResult,
  getResultByAttemptId,
  getMyQuizzes,
  getQuizAnalytics,
  getQuizAttempts,
  syncAttempt,
  getActiveAttempt,
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

router.get('/attempts/:attemptId/result', validateObjectId('attemptId'), optionalAuth, getResultByAttemptId);
router.get('/:id', validateQuizIdentifier('id'), optionalAuth, getQuiz);
router.get('/:id/leaderboard', validateQuizIdentifier('id'), optionalAuth, getChallengeLeaderboard);
router.put('/:id', validateQuizIdentifier('id'), protect, updateQuiz);
router.post('/:id/cover', validateQuizIdentifier('id'), protect, uploadQuizCover);
router.delete('/:id/cover', validateQuizIdentifier('id'), protect, removeQuizCover);
router.delete('/:id', validateQuizIdentifier('id'), protect, deleteQuiz);
router.get('/:id/analytics', validateQuizIdentifier('id'), optionalAuth, getQuizAnalytics);
router.get('/:id/attempts', validateQuizIdentifier('id'), protect, getQuizAttempts);
router.get('/:id/questions', validateQuizIdentifier('id'), optionalAuth, getQuizQuestions);
router.get('/:id/attempt/active', validateQuizIdentifier('id'), optionalAuth, getActiveAttempt);
router.post('/:id/attempt', validateQuizIdentifier('id'), optionalAuth, startAttempt);
router.put('/:id/attempt/:attemptId', validateQuizIdentifier('id'), validateObjectId('attemptId'), optionalAuth, submitAttempt);
router.put('/:id/attempt/:attemptId/sync-progress', validateQuizIdentifier('id'), validateObjectId('attemptId'), optionalAuth, syncAttempt);
router.post('/:id/attempt/:attemptId/sync-progress', validateQuizIdentifier('id'), validateObjectId('attemptId'), optionalAuth, syncAttempt);
router.get('/:id/attempt/:attemptId/result', validateQuizIdentifier('id'), validateObjectId('attemptId'), optionalAuth, getResult);

export default router;
