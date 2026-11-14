import { Router } from 'express';
import { parseFile, applyMapping, getPreview, getAssetPreview } from '../controllers/parser.controller.js';
import { createParseJob } from '../controllers/job.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';

const router = Router();

// Inter-service async parsing jobs (Media Service -> Parser Service)
router.post('/jobs', createParseJob);
router.post('/api/v1/parser/jobs', createParseJob);

// Safe Preview retrieval endpoint
router.get('/preview/asset/:assetId', getAssetPreview);
router.get('/api/v1/parser/preview/:assetId', getAssetPreview);

// Legacy upload parsing endpoints
router.post('/parse/:uploadId', validateObjectId('uploadId'), optionalAuth, parseFile);
router.post('/map/:uploadId', validateObjectId('uploadId'), optionalAuth, applyMapping);
router.get('/preview/:uploadId', validateObjectId('uploadId'), optionalAuth, getPreview);

export default router;
