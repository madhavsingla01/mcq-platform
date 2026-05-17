import { Router } from 'express';
import { getExplanation, getGoogleSearchUrl } from '../controllers/ai.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();
router.post('/explain', optionalAuth, getExplanation);
router.post('/search-url', optionalAuth, getGoogleSearchUrl);

export default router;
