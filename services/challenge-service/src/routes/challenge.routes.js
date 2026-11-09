import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.middleware.js';
import {
  createChallenge,
  listChallenges,
  getChallengeByIdOrCode,
  updateChallenge,
  deleteChallenge,
} from '../controllers/challenge.controller.js';
import { getChallengesOverview } from '../controllers/overview.controller.js';
import { getChallengeLeaderboard } from '../controllers/leaderboard.controller.js';

const router = Router();

// Microservice health check
router.get('/health', (req, res) => {
  res.json({
    service: 'challenge-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Challenges Arena Overview (Feed, Streaks, Trending)
router.get('/overview', optionalAuth, getChallengesOverview);

// Leaderboard for challenge (Quarantined until deadline)
router.get('/:idOrCode/leaderboard', optionalAuth, getChallengeLeaderboard);

// Public / Filtered Challenges Listing
router.get('/', optionalAuth, listChallenges);

// Single Challenge Details (Sanitized questions if active)
router.get('/:idOrCode', optionalAuth, getChallengeByIdOrCode);

// Protected Management Endpoints
router.post('/', protect, createChallenge);
router.put('/:idOrCode', protect, updateChallenge);
router.delete('/:idOrCode', protect, deleteChallenge);

export default router;
