import dotenv from 'dotenv';

dotenv.config();

const env = {
  PORT: Number(process.env.PORT) || 5007,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/mcq_media',
  JWT_SECRET: process.env.JWT_SECRET || '',
  MEDIA_STORAGE_PATH: process.env.MEDIA_STORAGE_PATH || './media-storage',
  MEDIA_MAX_FILE_SIZE: Number(process.env.MEDIA_MAX_FILE_SIZE) || 12 * 1024 * 1024,
};

const jwtSecret = env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}

export default env;
