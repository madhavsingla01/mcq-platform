import dotenv from 'dotenv';

dotenv.config();

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const port = Number(required('PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}

const positiveInteger = (name: string) => {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

const jwtSecret = required('JWT_SECRET');
if (Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}

const clientUrl = required('CLIENT_URL');
const allowedOrigins = clientUrl.split(',').map((origin) => origin.trim()).filter(Boolean);
if (allowedOrigins.length === 0) throw new Error('CLIENT_URL must contain at least one allowed origin');

export default {
  PORT: port,
  CHALLENGE_LIST_DEFAULT_PAGE_SIZE: positiveInteger('CHALLENGE_LIST_DEFAULT_PAGE_SIZE'),
  CHALLENGE_LIST_MAX_PAGE_SIZE: positiveInteger('CHALLENGE_LIST_MAX_PAGE_SIZE'),
  LEADERBOARD_CACHE_TTL_SECONDS: positiveInteger('LEADERBOARD_CACHE_TTL_SECONDS'),
  NODE_ENV: required('NODE_ENV'),
  MONGO_URI: required('MONGO_URI'),
  JWT_SECRET: jwtSecret,
  CLIENT_URL: allowedOrigins,
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};
