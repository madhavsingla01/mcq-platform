import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { AuthServiceIdentityProvider } from './infrastructure/auth/auth-service-identity-provider.js';
import { InternalApiClient } from './infrastructure/http/internal-api-client.js';
import { logger } from './shared/logging/logger.js';

const identityProvider = new AuthServiceIdentityProvider(
  new InternalApiClient(config.internalApiTimeoutMs),
  config.authServiceUrl,
);
const app = createApp(config, identityProvider, logger);
const server = createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
  logger.error('service.server_error', { code: error.code || error.name });
  process.exitCode = 1;
});

server.listen(config.port, () => {
  logger.info('service.started', { port: config.port, environment: config.nodeEnv });
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info('service.stopping', { signal });
  const deadline = setTimeout(() => {
    logger.error('service.shutdown_timeout');
    server.closeAllConnections();
  }, 10000);
  deadline.unref();
  server.close((error) => {
    clearTimeout(deadline);
    if (error) {
      logger.error('service.shutdown_failed', { code: error.name });
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
