import { Router } from 'express';

const router = Router();

const probeHandler = (req, res) => {
  res.status(200).json({
    service: 'marketplace-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};

// Health and readiness endpoints under domain prefix
router.get('/health', probeHandler);
router.get('/ready', probeHandler);

// Return structured 404 for unimplemented Phase 2 business endpoints
router.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Marketplace business routes are not yet implemented in Phase 1',
    data: null,
    errors: [],
  });
});

export default router;
