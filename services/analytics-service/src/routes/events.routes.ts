import { Router } from 'express';
import { ingestEvent } from '../controllers/events.controller.js';

const router = Router();

// POST /api/v1/analytics/events/ingest
router.post('/ingest', ingestEvent);
router.post('/', ingestEvent);

export default router;
