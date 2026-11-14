import 'dotenv/config';

export interface ServiceConfig {
  port: number;
  nodeEnv: string;
  clientOrigins: string[];
  authServiceUrl: string;
  internalApiTimeoutMs: number;
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

export const config: ServiceConfig = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: [...new Set(origins)],
  authServiceUrl: readOrigin('AUTH_SERVICE_URL', required('AUTH_SERVICE_URL')),
  internalApiTimeoutMs: readPositiveInteger('INTERNAL_API_TIMEOUT_MS', process.env.INTERNAL_API_TIMEOUT_MS, 5000, 30000),
};
