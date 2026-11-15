import express, { Router, type ErrorRequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DraftBudget } from '../../../application/draft-rate-limit.js';
import type { GetCurrentUser } from '../../../application/use-cases/get-current-user.js';
import type { ManageDrafts } from '../../../application/use-cases/manage-drafts.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { Logger } from '../../../shared/logging/logger.js';
import { createDraftToolServer, mcpWriteTools } from '../../mcp/draft-tools.js';
import { READ_SCOPE, WRITE_SCOPE, type McpOAuth } from '../../../infrastructure/auth/mcp-oauth.js';
import { authenticate } from '../middleware/authenticate.js';
import { bearerOnly, type IntegrationHandler } from '../middleware/integration-auth.js';

export function createMcpRoutes(
  identity: GetCurrentUser, drafts: ManageDrafts, budget: DraftBudget, origins: readonly string[], logger: Logger, oauth?: McpOAuth,
) {
  const router = Router();
  const guard: IntegrationHandler = (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    const origin = req.get('origin');
    if (origin !== undefined && !origins.includes(origin)) {
      return next(new AppError('Request origin is not allowed', 403, 'FORBIDDEN'));
    }
    next();
  };

  const handle: IntegrationHandler = async (req, res, next) => {
    const user = res.locals.user;
    if (!user) return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));

    // This endpoint supports one JSON-RPC message per HTTP request.
    if (!req.is('application/json')) {
      return next(new AppError('Use the application/json content type', 415, 'UNSUPPORTED_MEDIA_TYPE'));
    }
    if (req.body == null || Array.isArray(req.body)) {
      return next(new AppError('Provide a single JSON-RPC message', 400, 'INVALID_REQUEST'));
    }

    const scopes = res.locals.oauthScopes;
    const message = req.body;
    if (oauth && scopes && typeof message === 'object' && 'method' in message && message.method === 'tools/call' &&
        'params' in message && typeof message.params === 'object' && message.params !== null &&
        'name' in message.params && typeof message.params.name === 'string') {
      const scope = mcpWriteTools.has(message.params.name) ? WRITE_SCOPE : READ_SCOPE;
      if (!scopes.has(scope)) {
        res.set('WWW-Authenticate', oauth.challenge(scope));
        return next(new AppError('The connected account did not grant this permission', 403, 'INSUFFICIENT_SCOPE'));
      }
    }
    const context = { userId: user.id, requestId: res.locals.requestId, headers: oauth ? {} : req.headers,
      ...(oauth && scopes ? { scopes, delegate: (method: string, target: string) => oauth.delegate(user.id, method, target) } : {}),
    };
    const server = createDraftToolServer(drafts, context, budget, logger);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    const close = () => { void server.close().catch(() => logger.warn('mcp.close_failed', { requestId: context.requestId })); };
    res.once('close', close);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      res.off('close', close);
      close();
      next(error);
    }
  };

  const errors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    const bodyType = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
    const status = error instanceof AppError ? error.statusCode : bodyType === 'entity.too.large' ? 413
      : bodyType === 'entity.parse.failed' ? 400 : 500;
    if (status === 401) res.set('WWW-Authenticate', oauth?.challenge() ?? 'Bearer realm="quizfocus"');
    if (status >= 500) logger.error('mcp.request_failed', { requestId: res.locals.requestId, status });
    res.status(status).json({
      jsonrpc: '2.0',
      error: {
        code: status === 400 ? -32600 : status >= 500 ? -32603 : -32000,
        message: error instanceof AppError ? error.message : status === 413 ? 'Request is too large'
          : status === 400 ? 'Invalid MCP request body' : 'Internal service error',
      },
    });
  };

  const signedIn: IntegrationHandler = oauth ? (req, res, next) => {
    const token = req.headers.authorization?.slice(7) ?? '';
    if (token.length > 8192) return next(new AppError('Invalid access token', 401, 'UNAUTHENTICATED'));
    void oauth.verify(token).then(({ userId, scopes }) => {
      res.locals.user = { id: userId, role: 'user' };
      res.locals.oauthScopes = scopes;
      next();
    }).catch(next);
  } : authenticate(identity);
  router.post('/', guard, bearerOnly, signedIn, express.json({ limit: '64kb' }), handle);
  router.all('/', guard, bearerOnly, signedIn, (_req, res) => {
    // This stateless transport has no server-initiated event stream or session to terminate.
    res.set('Allow', 'POST').status(405).json({
      jsonrpc: '2.0', error: { code: -32000, message: 'Method not supported. Use POST.' },
    });
  });
  router.use(errors);
  return router;
}
