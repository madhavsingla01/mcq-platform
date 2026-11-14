import { Router } from 'express';
import { aiStatusController } from '../controllers/ai-status.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { GetCurrentUser } from '../../../application/use-cases/get-current-user.js';

export function createAiRoutes(getCurrentUser: GetCurrentUser): Router {
  const router = Router();
  router.get('/status', authenticate(getCurrentUser), aiStatusController);
  return router;
}
