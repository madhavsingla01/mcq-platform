import 'dotenv/config';
import type { OAuthConfig } from '../infrastructure/auth/mcp-oauth.js';

export interface ServiceConfig {
  port: number;
  nodeEnv: string;
  clientOrigins: string[];
  authServiceUrl: string;
  internalApiTimeoutMs: number;
  quizServiceUrl: string;
  challengeServiceUrl: string;
  integrationMongoUri: string;
  draftRate: { reads: number; writes: number };
  oauth?: OAuthConfig;
  webhooks?: { secret: string; origins: string[] };
  generation?: { url: string; token: string; dailyLimit: number };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOrigin(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTP(S) origin`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials or a path`);
  }
  return url.origin;
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be an integer from 1 to ${max}`);
  }
  return parsed;
}

const port = readPositiveInteger('PORT', process.env.PORT, 5014, 65535);
const origins = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => readOrigin('CLIENT_URL entry', origin.trim()));

if (origins.length === 0) throw new Error('CLIENT_URL must contain at least one allowed origin');

function secureUrl(value: string, name: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS URL without credentials, query or fragment`);
  }
  return url;
}

function oauthConfig(): OAuthConfig | undefined {
  if (!process.env.MCP_OAUTH_ISSUER) return undefined;
  const publicUrl = secureUrl(required('MCP_PUBLIC_ORIGIN'), 'MCP_PUBLIC_ORIGIN');
  if (publicUrl.pathname !== '/') throw new Error('MCP_PUBLIC_ORIGIN must be an origin');
  const issuer = required('MCP_OAUTH_ISSUER');
  secureUrl(issuer, 'MCP_OAUTH_ISSUER');
  const introspectionUrl = secureUrl(required('MCP_OAUTH_INTROSPECTION_URL'), 'MCP_OAUTH_INTROSPECTION_URL');
  const delegationSecret = required('INTEGRATION_DELEGATION_SECRET');
  if (Buffer.byteLength(delegationSecret) < 32 || delegationSecret === process.env.JWT_SECRET) {
    throw new Error('INTEGRATION_DELEGATION_SECRET must be a separate secret of at least 32 bytes');
  }
  return { publicOrigin: publicUrl.origin, issuer, introspectionUrl: introspectionUrl.href,
    clientId: required('MCP_OAUTH_INTROSPECTION_CLIENT_ID'), clientSecret: required('MCP_OAUTH_INTROSPECTION_CLIENT_SECRET'),
    delegationSecret };
}

const oauth = oauthConfig();
const webhookOrigins = process.env.INTEGRATION_WEBHOOK_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
const webhookSecret = webhookOrigins.length ? required('INTEGRATION_WEBHOOK_SECRET') : '';
if (webhookSecret && (Buffer.byteLength(webhookSecret) < 32 || webhookSecret === oauth?.delegationSecret ||
    webhookSecret === process.env.JWT_SECRET)) throw new Error('INTEGRATION_WEBHOOK_SECRET must be a separate secret of at least 32 bytes');
const webhookConfig = webhookSecret ? { secret: webhookSecret, origins: webhookOrigins.map(value => {
  const url = secureUrl(value, 'INTEGRATION_WEBHOOK_ORIGINS');
  if (url.pathname !== '/') throw new Error('Webhook allowlist entries must be origins');
  return url.origin;
}) } : undefined;
const generation = process.env.INTEGRATION_GENERATION_URL ? {
  url: secureUrl(required('INTEGRATION_GENERATION_URL'), 'INTEGRATION_GENERATION_URL').href,
  token: required('INTEGRATION_GENERATION_TOKEN'),
  dailyLimit: readPositiveInteger('INTEGRATION_GENERATION_DAILY_LIMIT', process.env.INTEGRATION_GENERATION_DAILY_LIMIT || undefined, 10, 500),
} : undefined;

export const config: ServiceConfig = {
  port,
  ...(oauth ? { oauth } : {}),
  ...(webhookConfig ? { webhooks: webhookConfig } : {}),
  ...(generation ? { generation } : {}),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: [...new Set(origins)],
  authServiceUrl: readOrigin('AUTH_SERVICE_URL', required('AUTH_SERVICE_URL')),
  quizServiceUrl: readOrigin('QUIZ_SERVICE_URL', process.env.QUIZ_SERVICE_URL || 'http://127.0.0.1:5002'),
  challengeServiceUrl: readOrigin('CHALLENGE_SERVICE_URL', process.env.CHALLENGE_SERVICE_URL || 'http://127.0.0.1:5009'),
  integrationMongoUri: process.env.AI_INTEGRATION_MONGO_URI || process.env.MONGO_URI ||
    (process.env.NODE_ENV === 'production' ? required('AI_INTEGRATION_MONGO_URI') : 'mongodb://127.0.0.1:27017/quizfocus_integration'),
  draftRate: {
    reads: readPositiveInteger('DRAFT_READS_PER_MINUTE', process.env.DRAFT_READS_PER_MINUTE, 120, 1000),
    writes: readPositiveInteger('DRAFT_WRITES_PER_MINUTE', process.env.DRAFT_WRITES_PER_MINUTE, 30, 1000),
  },
  internalApiTimeoutMs: readPositiveInteger('INTERNAL_API_TIMEOUT_MS', process.env.INTERNAL_API_TIMEOUT_MS, 12000, 30000),
};
