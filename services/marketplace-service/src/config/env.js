import dotenv from 'dotenv';

dotenv.config();

/**
 * Validate and normalize environment configuration.
 * @param {Object} source - Environment variables map (defaults to process.env)
 * @returns {Object} Validated environment configuration
 */
export function validateEnv(source = process.env) {
  const portRaw = source.PORT !== undefined && source.PORT !== '' ? source.PORT : 5013;
  const PORT = Number(portRaw);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }

  const NODE_ENV = source.NODE_ENV || '';
  if (!NODE_ENV) {
    throw new Error('NODE_ENV is required');
  }

  const clientUrlRaw = source.CLIENT_URL || '';
  const CLIENT_URL = (Array.isArray(clientUrlRaw) ? clientUrlRaw : clientUrlRaw.split(','))
    .map((origin) => (typeof origin === 'string' ? origin.trim() : ''))
    .filter(Boolean);
  if (!CLIENT_URL.length) {
    throw new Error('CLIENT_URL must contain at least one allowed origin');
  }

  const jwtSecret = source.JWT_SECRET || '';
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }
  if (Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes');
  }

  const isProd = NODE_ENV === 'production';
  const isDev = NODE_ENV === 'development';

  if (
    isProd &&
    /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)
  ) {
    throw new Error('JWT_SECRET must be a configured, non-placeholder secret in production');
  }

  let mongoUri = source.MONGO_URI;
  if (mongoUri === undefined) {
    if (isProd && process.env.NODE_ENV === 'production') {
      mongoUri = process.env.MONGO_URI;
      if (!mongoUri) {
        throw new Error('MONGO_URI is required in production');
      }
    } else {
      mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform';
    }
  }

  if (source.MONGO_URI === '') {
    throw new Error('MONGO_URI is required');
  }

  if (!mongoUri) {
    if (isProd) {
      throw new Error('MONGO_URI is required');
    }
    mongoUri = 'mongodb://127.0.0.1:27017/mcq-platform';
  }

  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    throw new Error('MONGO_URI must be a valid MongoDB connection string');
  }

  return {
    PORT,
    NODE_ENV,
    CLIENT_URL,
    JWT_SECRET: jwtSecret,
    MONGO_URI: mongoUri,
    isDev,
    isProd,
  };
}

export const env = validateEnv();
export default env;
