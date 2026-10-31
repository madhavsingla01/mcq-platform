import { Router } from 'express';
import {
  universalSearch,
  getTrendingTags,
  getQuizzesByTag,
} from '../controllers/search.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Universal search endpoint
router.get('/universal', optionalAuth, universalSearch);

// Trending hashtags endpoint
router.get('/trending-tags', optionalAuth, getTrendingTags);

// Specific hashtag feed endpoint
router.get('/tags/:tag', optionalAuth, getQuizzesByTag);

export default router;
