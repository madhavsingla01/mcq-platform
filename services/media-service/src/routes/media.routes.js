import { Router } from 'express';
import { deleteMyMedia, getAsset, getMyMedia, uploadImage, validateUrl } from '../controllers/media.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { receiveImage, verifyImageSignature } from '../middleware/upload.middleware.js';

const router = Router();

router.post('/images', requireAuth, receiveImage, verifyImageSignature, uploadImage);
router.post('/validate-url', requireAuth, validateUrl);
router.get('/assets', requireAuth, getMyMedia);
router.delete('/assets/:id', requireAuth, deleteMyMedia);
router.get('/assets/:id/:variant?', getAsset);

export default router;
