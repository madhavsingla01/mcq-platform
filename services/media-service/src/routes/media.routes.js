import { Router } from 'express';
import { deleteMyMedia, getAsset, getMyMedia, uploadImage, validateUrl } from '../controllers/media.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { receiveImage, verifyImageSignature } from '../middleware/upload.middleware.js';
import { requireMediaAuthor } from '../services/clipAccess.service.js';
import { clipCapabilities, receiveClip, uploadClip, importClipImage, getClip, retryClip, deleteClip, validateClipReferences, requestClipAccess, streamClip } from '../controllers/clip.controller.js';
import {
  initiateAsset,
  receiveEducationalUpload,
  uploadAsset,
  getAssetStatus,
  updateAssetStatus,
  getAssetAccess,
  streamAssetContent,
} from '../controllers/educationalAsset.controller.js';

const router = Router();
router.get('/clip-capabilities', clipCapabilities);
router.post('/clips', requireMediaAuthor, receiveClip, uploadClip);
router.post('/clips/image-url', requireMediaAuthor, importClipImage);
router.post('/clips/validate-references', requireMediaAuthor, validateClipReferences);
router.post('/clips/access', requestClipAccess);
router.get('/clips/:id/content', streamClip);
router.get('/clips/:id', requireMediaAuthor, getClip);
router.post('/clips/:id/retry', requireMediaAuthor, retryClip);
router.delete('/clips/:id', requireMediaAuthor, deleteClip);

router.post('/images', requireAuth, receiveImage, verifyImageSignature, uploadImage);
router.post('/validate-url', requireAuth, validateUrl);
router.get('/assets', requireAuth, getMyMedia);

// Educational Resource Asset Routes (Milestone 1)
router.post('/assets/initiate', requireAuth, initiateAsset);
router.post('/assets/:id/upload', receiveEducationalUpload, uploadAsset);
router.get('/assets/:id/status', requireAuth, getAssetStatus);
router.patch('/assets/:id/status', updateAssetStatus);
router.get('/assets/:id/access', requireAuth, getAssetAccess);
router.get('/assets/:id/content', streamAssetContent);

router.delete('/assets/:id', requireAuth, deleteMyMedia);
router.get('/assets/:id/:variant?', getAsset);

export default router;
