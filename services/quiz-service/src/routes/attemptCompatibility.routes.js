import { Router } from 'express';
import env from '../config/env.js';
import { createAttemptRelay } from '../infrastructure/attemptClient.js';

const router = Router();
const relay = createAttemptRelay({ origin: env.ATTEMPT_SERVICE_URL, timeoutMs: env.ATTEMPT_REQUEST_TIMEOUT_MS });
router.get('/attempts/:attemptId/result', relay);
router.get('/:id/attempt/active', relay);
router.post('/:id/attempt', relay);
router.put('/:id/attempt/:attemptId', relay);
router.put('/:id/attempt/:attemptId/sync-progress', relay);
router.post('/:id/attempt/:attemptId/sync-progress', relay);
router.get('/:id/attempt/:attemptId/result', relay);
export default router;
