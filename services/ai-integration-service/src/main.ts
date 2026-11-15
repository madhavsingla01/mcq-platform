import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { AuthServiceIdentityProvider } from './infrastructure/auth/auth-service-identity-provider.js';
import { InternalApiClient } from './infrastructure/http/internal-api-client.js';
import { DraftCoreClient } from './infrastructure/http/draft-core-client.js';
import { connectDraftReplay } from './infrastructure/storage/draft-replay.js';
import { ManageDrafts } from './application/use-cases/manage-drafts.js';
import { logger } from './shared/logging/logger.js';
import { Webhooks } from './infrastructure/storage/webhooks.js';
import { ImportDrafts } from './application/authoring-import.js';
import { HttpQuizGenerator, MongoGenerationUsage } from './infrastructure/http/quiz-generator.js';

const identityProvider = new AuthServiceIdentityProvider(
  new InternalApiClient(config.internalApiTimeoutMs),
  config.authServiceUrl,
);
const storage = await connectDraftReplay(config.integrationMongoUri).catch((error: unknown) => {
  logger.error('service.storage_unavailable', { category: error instanceof Error ? error.name : 'Unknown' });
  process.exit(1);
});
const draftClient = new DraftCoreClient(
  new InternalApiClient(config.internalApiTimeoutMs), config.quizServiceUrl, config.challengeServiceUrl,
);
const webhooks = config.webhooks ? new Webhooks(storage.db, storage.operations, config.webhooks.secret, config.webhooks.origins) : undefined;
await webhooks?.initialize();
let deliveries: Promise<void> | undefined;
const timer = webhooks ? setInterval(() => {
  if (deliveries) return;
  deliveries = webhooks.tick().catch(() => logger.error('webhooks.worker_failed')).finally(() => { deliveries = undefined; });
}, 3000) : undefined;
timer?.unref();
const generationUsage = config.generation ? new MongoGenerationUsage(storage.db, config.generation.dailyLimit) : undefined;
await generationUsage?.initialize();
const generation = config.generation && generationUsage
  ? { provider: new HttpQuizGenerator(config.generation.url, config.generation.token), usage: generationUsage } : undefined;
const app = createApp(config, identityProvider, logger, new ManageDrafts(draftClient, storage.replay), webhooks,
  new ImportDrafts(draftClient, storage.replay, draftClient, generation));
const server = createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
  logger.error('service.server_error', { code: error.code || error.name });
  process.exitCode = 1;
  storage.close().catch(() => {});
});

server.listen(config.port, () => {
  logger.info('service.started', { port: config.port, environment: config.nodeEnv });
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  logger.info('service.stopping', { signal });
  const deadline = setTimeout(() => {
    logger.error('service.shutdown_timeout');
    server.closeAllConnections();
  }, 10000);
  deadline.unref();
  server.close(async (error) => {
    clearTimeout(deadline);
    await deliveries;
    await storage.close().catch(() => { process.exitCode = 1; });
    if (error) {
      logger.error('service.shutdown_failed', { code: error.name });
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
