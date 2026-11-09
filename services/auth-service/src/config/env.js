import dotenv from 'dotenv';
dotenv.config();

const env = {
  PORT: Number(process.env.PORT),
  AUTH_TRUST_PROXY_HOPS: Number(process.env.AUTH_TRUST_PROXY_HOPS ?? 0),
  NODE_ENV: process.env.NODE_ENV || '',
  MONGO_URI: process.env.MONGO_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '',
  CLIENT_URL: (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) throw new Error('PORT must be an integer from 1 to 65535');
if (!Number.isInteger(env.AUTH_TRUST_PROXY_HOPS) || env.AUTH_TRUST_PROXY_HOPS < 0 || env.AUTH_TRUST_PROXY_HOPS > 1) {
  throw new Error('AUTH_TRUST_PROXY_HOPS must be 0 or 1');
}
for (const key of ['NODE_ENV', 'MONGO_URI', 'JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN']) if (!env[key]) throw new Error(`${key} is required`);
if (!env.CLIENT_URL.length) throw new Error('CLIENT_URL must contain at least one allowed origin');

const jwtSecret = env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}
if (!env.JWT_REFRESH_SECRET || Buffer.byteLength(env.JWT_REFRESH_SECRET) < 32 || /default-refresh-secret|mcq-platform-refresh-secret-change-in-production|replace-with-/i.test(env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_REFRESH_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}
if (env.JWT_REFRESH_SECRET === env.JWT_SECRET) throw new Error('Access and refresh tokens require distinct signing secrets');

export default env;
