import { Router } from 'express';
import { z } from 'zod';
import { draftEventTypes } from '../../../application/draft-events.js';
import type { DraftBudget } from '../../../application/draft-rate-limit.js';
import type { GetCurrentUser } from '../../../application/use-cases/get-current-user.js';
import type { Webhooks } from '../../../infrastructure/storage/webhooks.js';
import { authenticate } from '../middleware/authenticate.js';
import { bearerOnly } from '../middleware/integration-auth.js';
import { limitPerUser, parse, route } from './draft.routes.js';

const id = z.uuid();
const subscription = z.strictObject({
  url: z.string().url().max(2048),
  events: z.array(z.enum(draftEventTypes)).min(1).max(draftEventTypes.length),
});
export function createWebhookRoutes(identity: GetCurrentUser, webhooks: Webhooks, budget: DraftBudget) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(bearerOnly, authenticate(identity));
  router.get('/', limitPerUser(budget.read), route((_req, context) => webhooks.list(context.userId)));
  router.post('/', limitPerUser(budget.write), route((req, context) => {
    const { url, events } = parse(subscription, req.body, 'webhook subscription');
    return webhooks.create(context.userId, url, [...new Set(events)]);
  }, 201));
  router.get('/:id/deliveries', limitPerUser(budget.read), route((req, context) =>
    webhooks.history(context.userId, parse(id, req.params.id, 'subscription ID'))));
  router.delete('/:id', limitPerUser(budget.write), route((req, context) =>
    webhooks.disable(context.userId, parse(id, req.params.id, 'subscription ID'))));
  return router;
}
