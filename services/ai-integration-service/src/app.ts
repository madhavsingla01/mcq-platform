import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createDraftBudget } from './application/draft-rate-limit.js';
import { createMcpRoutes } from './presentation/http/routes/mcp.routes.js';
import type { ServiceConfig } from './config/env.js';
import { createDraftRoutes } from './presentation/http/routes/draft.routes.js';
import type { ManageDrafts } from './application/use-cases/manage-drafts.js';
import type { IdentityProvider } from './application/ports/identity-provider.js';
import { GetCurrentUser } from './application/use-cases/get-current-user.js';
import { createAiRoutes } from './presentation/http/routes/ai.routes.js';
import { createErrorHandler, notFoundHandler } from './presentation/http/middleware/error-handler.js';
import { requestContext } from './presentation/http/middleware/request-context.js';
import type { Logger } from './shared/logging/logger.js';
import { McpOAuth, MCP_PATH } from './infrastructure/auth/mcp-oauth.js';
import { createWebhookRoutes } from './presentation/http/routes/webhook.routes.js';
import type { Webhooks } from './infrastructure/storage/webhooks.js';
import type { ImportDrafts } from './application/authoring-import.js';
import { createAuthoringRoutes } from './presentation/http/routes/authoring.routes.js';

export function createApp(config: ServiceConfig, identityProvider: IdentityProvider, logger: Logger, drafts?: ManageDrafts,
  webhooks?: Webhooks, imports?: ImportDrafts) {
  const app = express();
  const getCurrentUser = new GetCurrentUser(identityProvider);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true, exposedHeaders: ['X-Request-ID', 'Retry-After', 'WWW-Authenticate'] }));
  app.use(requestContext);
  app.use((req, res, next) => {
    const startedAt = performance.now();
    res.once('finish', () => {
      logger.info('http.request', {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });
  const budget = drafts ? createDraftBudget(config.draftRate) : undefined;
  if (drafts && budget) {
    const oauth = config.oauth ? new McpOAuth(config.oauth) : undefined;
    if (oauth) {
      app.get(['/.well-known/oauth-protected-resource' + MCP_PATH, '/.well-known/oauth-protected-resource'],
        (_req, res) => res.json(oauth.metadata()));
    }
    app.use(MCP_PATH, createMcpRoutes(getCurrentUser, drafts, budget, config.clientOrigins, logger, oauth));
  }
  app.use(express.json({ limit: '32kb' }));

  const health = (_req: express.Request, res: express.Response) => res.json({
    service: 'ai-integration-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
  app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      service: 'ai-integration-service', message: 'QuizFocus AI Integration Service. This port serves the API.',
      health: '/api/v1/health',
    });
  });
  app.get(['/api/v1/health', '/api/v1/livez'], health);
  app.use('/api/v1/ai', createAiRoutes(getCurrentUser));
  if (drafts && budget) app.use('/api/v1/ai/drafts', createDraftRoutes(getCurrentUser, drafts, budget));
  if (imports && budget) app.use('/api/v1/ai', createAuthoringRoutes(getCurrentUser, imports, budget));
  if (webhooks && budget) app.use('/api/v1/ai/webhooks', createWebhookRoutes(getCurrentUser, webhooks, budget));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
