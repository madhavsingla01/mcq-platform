import dotenv from 'dotenv';

dotenv.config();

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const integer = (name) => {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

const jwtSecret = required('JWT_SECRET');
if (Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}

const clientUrl = required('CLIENT_URL');
const serviceUrls = {
  gateway: required('GATEWAY_URL'),
  auth: required('AUTH_SERVICE_URL'),
  quiz: required('QUIZ_SERVICE_URL'),
  parser: required('PARSER_SERVICE_URL'),
  attempt: required('ATTEMPT_SERVICE_URL'),
  social: required('SOCIAL_SERVICE_URL'),
  message: required('MESSAGE_SERVICE_URL'),
  media: required('MEDIA_SERVICE_URL'),
  challenge: required('CHALLENGE_SERVICE_URL'),
};

export default {
  PORT: integer('PORT'),
  NODE_ENV: required('NODE_ENV'),
  MONGO_URI: required('MONGO_URI'),
  AUTH_MONGO_URI: required('AUTH_MONGO_URI'),
  QUIZ_MONGO_URI: required('QUIZ_MONGO_URI'),
  ATTEMPT_MONGO_URI: required('ATTEMPT_MONGO_URI'),
  JWT_SECRET: jwtSecret,
  CLIENT_URL: clientUrl.split(',').map((origin) => origin.trim()).filter(Boolean),
  ADMIN_EMAIL: required('ADMIN_EMAIL'),
  HEALTH_CHECK_TIMEOUT_MS: integer('HEALTH_CHECK_TIMEOUT_MS'),
  SERVICES: serviceUrls,
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};
