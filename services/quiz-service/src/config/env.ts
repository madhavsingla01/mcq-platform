import dotenv from 'dotenv';
dotenv.config();

const env = {
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV || '',
  MONGO_URI: process.env.MONGO_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || '',
  CLIENT_URL: (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  PARSER_SERVICE_URL: process.env.PARSER_SERVICE_URL || 'http://localhost:5003',
  ATTEMPT_SERVICE_URL: process.env.ATTEMPT_SERVICE_URL || 'http://127.0.0.1:5004',
  MEDIA_SERVICE_URL: process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:5007',
  ATTEMPT_REQUEST_TIMEOUT_MS: Number(process.env.ATTEMPT_REQUEST_TIMEOUT_MS || 15000),
  MAX_IMPORT_ROWS: Number(process.env.MAX_IMPORT_ROWS),
  CACHE_DEFAULT_TTL_MS: Number(process.env.CACHE_DEFAULT_TTL_MS),
  CACHE_SHORT_TTL_MS: Number(process.env.CACHE_SHORT_TTL_MS),
  CACHE_SEARCH_TTL_MS: Number(process.env.CACHE_SEARCH_TTL_MS),
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) throw new Error('PORT must be an integer from 1 to 65535');
for (const key of ['NODE_ENV', 'MONGO_URI'] as const) if (!env[key]) throw new Error(`${key} is required`);
if (!env.CLIENT_URL.length) throw new Error('CLIENT_URL must contain at least one allowed origin');
for (const key of ['MAX_IMPORT_ROWS', 'CACHE_DEFAULT_TTL_MS', 'CACHE_SHORT_TTL_MS', 'CACHE_SEARCH_TTL_MS'] as const) if (!Number.isInteger(env[key]) || env[key] < 1) throw new Error(`${key} must be a positive integer`);

const jwtSecret = env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}

export default env;
