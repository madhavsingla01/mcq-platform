import { Router, type RequestHandler } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import eventsRoutes from './events.routes.js';

const router = Router();

const probeHandler: RequestHandler = (_req, res) => {
  res.status(200).json({
    service: 'analytics-service',
    status: 'healthy',
    ready: true,
    timestamp: new Date().toISOString(),
  });
};

// Health and readiness endpoints under domain prefix (public probes)
router.get('/health', probeHandler);
router.get('/ready', probeHandler);

// Public / Microservice Ingestion Route (Unauthenticated & Deduplicated)
router.use('/events', eventsRoutes);

// Protected creator business routes (require authentication)
router.use(protect);

// Return structured 404 for unimplemented Phase 2 business endpoints
router.all('*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Analytics business routes are not yet implemented in Phase 2',
    data: null,
    errors: [],
  });
});

export default router;
