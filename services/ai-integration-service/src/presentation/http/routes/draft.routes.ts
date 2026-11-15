import { Router } from 'express';
import type { z } from 'zod';
import { createDraft, draftId, idempotencyKey, listDrafts, patchDraft } from '../../../application/draft-contracts.js';
import type { DraftContext } from '../../../application/ports/draft-core.js';
import type { ManageDrafts } from '../../../application/use-cases/manage-drafts.js';
import type { GetCurrentUser } from '../../../application/use-cases/get-current-user.js';
import { DraftRateLimitError, type DraftBudget } from '../../../application/draft-rate-limit.js';
import { bearerOnly, type IntegrationHandler as DraftHandler } from '../middleware/integration-auth.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { authenticate } from '../middleware/authenticate.js';

export function parse<T extends z.ZodType>(schema: T, value: unknown, label: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.slice(0, 12).map(issue => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new AppError('Invalid ' + label, 400, 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export function limitPerUser(consume: DraftBudget['read']): DraftHandler {
  return (_req, res, next) => {
    const user = res.locals.user;
    if (!user) return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
    try {
      consume(user.id);
      next();
    } catch (error) {
      if (error instanceof DraftRateLimitError) res.set('Retry-After', String(error.retryAfter));
      next(error);
    }
  };
}

export function route(handler: (req: Parameters<DraftHandler>[0], context: DraftContext) => Promise<unknown>, status = 200): DraftHandler {
  return (req, res, next) => {
    const user = res.locals.user;
    if (!user) return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
    const context = { userId: user.id, requestId: res.locals.requestId, headers: req.headers };
    Promise.resolve().then(() => handler(req, context)).then(data => {
      res.status(status).json({ success: true, data, requestId: context.requestId });
    }).catch(next);
  };
}

export function createDraftRoutes(identity: GetCurrentUser, drafts: ManageDrafts, budget: DraftBudget) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(bearerOnly, authenticate(identity));
  const reads = limitPerUser(budget.read);
  const writes = limitPerUser(budget.write);
  router.get('/', reads, route((req, context) => drafts.list(context, parse(listDrafts, req.query, 'query'))));
  router.get('/:id', reads, route((req, context) => drafts.get(context, parse(draftId, req.params.id, 'draft ID'))));
  const jsonBody: DraftHandler = (req, _res, next) => {
    if (!req.is('application/json')) return next(new AppError('Use application/json', 415, 'UNSUPPORTED_MEDIA_TYPE'));
    next();
  };
  router.post('/', writes, jsonBody, route((req, context) => drafts.create(
    context, parse(idempotencyKey, req.get('idempotency-key'), 'Idempotency-Key'),
    parse(createDraft, req.body, 'draft'),
  ), 201));
  router.patch('/:id', writes, jsonBody, route((req, context) => drafts.update(
    context, parse(idempotencyKey, req.get('idempotency-key'), 'Idempotency-Key'),
    parse(draftId, req.params.id, 'draft ID'), parse(patchDraft, req.body, 'draft'),
  )));
  return router;
}
