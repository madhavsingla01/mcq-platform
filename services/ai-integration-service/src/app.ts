import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { ServiceConfig } from './config/env.js';
import type { IdentityProvider } from './application/ports/identity-provider.js';
import { GetCurrentUser } from './application/use-cases/get-current-user.js';
import { createAiRoutes } from './presentation/http/routes/ai.routes.js';
import { createErrorHandler, notFoundHandler } from './presentation/http/middleware/error-handler.js';
import { requestContext } from './presentation/http/middleware/request-context.js';
import type { Logger } from './shared/logging/logger.js';

export function createApp(config: ServiceConfig, identityProvider: IdentityProvider, logger: Logger) {
  const app = express();
  const getCurrentUser = new GetCurrentUser(identityProvider);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true, exposedHeaders: ['X-Request-ID'] }));
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
  app.use(express.json({ limit: '32kb' }));

  const health = (_req: express.Request, res: express.Response) => res.json({
    service: 'ai-integration-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
  app.get(['/api/v1/health', '/api/v1/livez'], health);
  app.use('/api/v1/ai', createAiRoutes(getCurrentUser));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
