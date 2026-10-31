import { Router } from 'express';
import { parseFile, applyMapping, getPreview } from '../controllers/parser.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

router.post('/parse/:uploadId', validateObjectId('uploadId'), optionalAuth, parseFile);
router.post('/map/:uploadId', validateObjectId('uploadId'), optionalAuth, applyMapping);
router.get('/preview/:uploadId', validateObjectId('uploadId'), optionalAuth, getPreview);

export default router;
