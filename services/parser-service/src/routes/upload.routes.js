import { Router } from 'express';
import { uploadFile, getUpload, deleteUpload, getMyUploads, checkUploadDuplicate } from '../controllers/upload.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { uploadFile as uploadMiddleware, persistValidatedUpload } from '../middleware/upload.middleware.js';
import { uploadRateLimit } from '../middleware/rateLimit.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';
import { validateFileSecurity } from '../middleware/security.middleware.js';

const router = Router();

router.post('/', uploadRateLimit, optionalAuth, uploadMiddleware('file'), validateFileSecurity, persistValidatedUpload, uploadFile);
router.get('/my', protect, getMyUploads);
router.get('/:id', validateObjectId('id'), optionalAuth, getUpload);
router.get('/:id/duplicate', validateObjectId('id'), optionalAuth, checkUploadDuplicate);
router.delete('/:id', validateObjectId('id'), optionalAuth, deleteUpload);

export default router;
