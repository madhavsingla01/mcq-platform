import { Router } from 'express';
import { getCreatorLeaderboard, getGlobalLeaderboard } from '../controllers/leaderboard.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/global', optionalAuth, getGlobalLeaderboard);
router.get('/creators', optionalAuth, getCreatorLeaderboard);

export default router;
