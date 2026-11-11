import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL_DOMAIN_SERVICES = new Set([
  'social-feed-service',
  'social-interactions-service',
  'social-comments-service',
]);

export const SERVICE_PORTS = {
  'api-gateway': 5000,
  'auth-service': 5001,
  'quiz-service': 5002,
  'parser-service': 5003,
  'attempt-service': 5004,
  'social-service': 5005,
  'message-service': 5006,
  'media-service': 5007,
  'admin-service': 5008,
  'challenge-service': 5009,
  'social-feed-service': 5010,
  'social-interactions-service': 5011,
  'social-comments-service': 5012,
  'marketplace-service': 5013,
};
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptDirectory, '..');
const requireFromSocialService = createRequire(path.join(projectRoot, 'services', 'social-service', 'package.json'));
const { parse: parseDotenv } = requireFromSocialService('dotenv');

export function readServicePort(serviceName, root) {
  const serviceDirectory = path.join(root, 'services', serviceName);
  const envPath = path.join(serviceDirectory, '.env');
  const examplePath = path.join(serviceDirectory, '.env.example');
  const configPath = fs.existsSync(envPath)
    ? envPath
    : (SOCIAL_DOMAIN_SERVICES.has(serviceName) || serviceName === 'marketplace-service')
      ? examplePath
      : envPath;
  if (!fs.existsSync(configPath)) {
    if (SERVICE_PORTS[serviceName]) {
      return SERVICE_PORTS[serviceName];
    }
    throw new Error(`Missing ${envPath}; copy the service .env.example and configure it first.`);
  }

  const parsed = parseDotenv(fs.readFileSync(configPath));
  const port = Number(parsed.PORT || SERVICE_PORTS[serviceName]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${serviceName} requires a valid PORT in its .env file.`);
  }
  return port;
}

export function createServiceEnvironment(service, services, root, processEnv = process.env) {
  const serviceDirectory = path.join(root, 'services', service.name);
  const serviceEnvPath = path.join(serviceDirectory, '.env');
  const serviceEnv = fs.existsSync(serviceEnvPath)
    ? parseDotenv(fs.readFileSync(serviceEnvPath))
    : {};
  const socialServiceEnvPath = path.join(root, 'services', 'social-service', '.env');
  const socialServiceEnv = fs.existsSync(socialServiceEnvPath)
    ? parseDotenv(fs.readFileSync(socialServiceEnvPath))
    : null;

  if (SOCIAL_DOMAIN_SERVICES.has(service.name) && !socialServiceEnv) {
    throw new Error(`Missing ${socialServiceEnvPath}; configure the existing Social service first.`);
  }

  const childEnv = {
    ...(SOCIAL_DOMAIN_SERVICES.has(service.name) ? socialServiceEnv : {}),
    ...serviceEnv,
    ...processEnv,
    PORT: String(service.port),
  };

  if (service.name === 'api-gateway') {
    const serviceRoutes = [
      ['SOCIAL_FEED_SERVICE_URL', 'social-feed-service'],
      ['SOCIAL_INTERACTIONS_SERVICE_URL', 'social-interactions-service'],
      ['SOCIAL_COMMENTS_SERVICE_URL', 'social-comments-service'],
      ['MARKETPLACE_SERVICE_URL', 'marketplace-service'],
    ];
    for (const [key, name] of serviceRoutes) {
      const domainService = services.find(candidate => candidate.name === name);
      if (domainService) {
        childEnv[key] = processEnv[key] || serviceEnv[key] || `http://127.0.0.1:${domainService.port}`;
      } else if (name !== 'marketplace-service') {
        throw new Error(`Missing ${name} in the service list.`);
      }
    }
  }

  return childEnv;
}
