import { Router } from 'express';
import { getExplanation, getGoogleSearchUrl } from '../controllers/ai.controller.js';

const router = Router();
router.post('/explain', getExplanation);
router.post('/search-url', getGoogleSearchUrl);

export default router;
