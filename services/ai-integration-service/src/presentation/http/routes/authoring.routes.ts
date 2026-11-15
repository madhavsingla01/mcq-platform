import { Router } from 'express';
import { generationRequest, importRequest, type ImportDrafts } from '../../../application/authoring-import.js';
import { idempotencyKey } from '../../../application/draft-contracts.js';
import type { DraftBudget } from '../../../application/draft-rate-limit.js';
import type { GetCurrentUser } from '../../../application/use-cases/get-current-user.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { authenticate } from '../middleware/authenticate.js';
import { bearerOnly, type IntegrationHandler } from '../middleware/integration-auth.js';
import { limitPerUser, parse, route } from './draft.routes.js';

export function createAuthoringRoutes(identity: GetCurrentUser, imports: ImportDrafts, budget: DraftBudget) {
  const router = Router();
  const json: IntegrationHandler = (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.is('application/json')) return next(new AppError('Use application/json', 415, 'UNSUPPORTED_MEDIA_TYPE'));
    next();
  };
  const write = [bearerOnly, authenticate(identity), limitPerUser(budget.write), json];
  const key = (value: unknown) => parse(idempotencyKey, value, 'Idempotency-Key');
  router.post('/imports', ...write, route((req, context) =>
    imports.import(context, key(req.get('idempotency-key')), parse(importRequest, req.body, 'import')), 201));
  router.post('/generation', ...write, route((req, context) =>
    imports.generate(context, key(req.get('idempotency-key')), parse(generationRequest, req.body, 'generation request')), 201));
  return router;
}
