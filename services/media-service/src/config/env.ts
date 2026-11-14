import dotenv from 'dotenv';

dotenv.config();

const env = {
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV || '',
  MONGO_URI: process.env.MONGO_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  CLIENT_URL: (process.env.CLIENT_URL || process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(',').map((origin) => origin.trim()).filter(Boolean),
  MEDIA_STORAGE_PATH: process.env.MEDIA_STORAGE_PATH || '',
  MEDIA_MAX_FILE_SIZE: Number(process.env.MEDIA_MAX_FILE_SIZE),
  MEDIA_CONTENT_MONGO_URI: process.env.MEDIA_CONTENT_MONGO_URI || process.env.MONGO_URI || '',
  MEDIA_CLIP_MAX_FILE_SIZE: Number(process.env.MEDIA_CLIP_MAX_FILE_SIZE || 104857600),
  MEDIA_CLIP_MAX_DURATION_SECONDS: Number(process.env.MEDIA_CLIP_MAX_DURATION_SECONDS || 300),
  MEDIA_CAPTION_MAX_FILE_SIZE: Number(process.env.MEDIA_CAPTION_MAX_FILE_SIZE || 262144),
  MEDIA_PROCESS_TIMEOUT_MS: Number(process.env.MEDIA_PROCESS_TIMEOUT_MS || 120000),
  MEDIA_FFMPEG_PATH: process.env.MEDIA_FFMPEG_PATH || 'ffmpeg',
  MEDIA_FFPROBE_PATH: process.env.MEDIA_FFPROBE_PATH || 'ffprobe',
  MEDIA_ABANDONED_DAYS: Number(process.env.MEDIA_ABANDONED_DAYS || 7),
  MEDIA_CREATOR_MAX_STORAGE_BYTES: Number(process.env.MEDIA_CREATOR_MAX_STORAGE_BYTES || 1073741824),
  MEDIA_CREATOR_MAX_ASSET_COUNT: Number(process.env.MEDIA_CREATOR_MAX_ASSET_COUNT || 100),
  MEDIA_EDUCATIONAL_MAX_FILE_SIZE: Number(process.env.MEDIA_EDUCATIONAL_MAX_FILE_SIZE || 52428800),
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) throw new Error('PORT must be an integer from 1 to 65535');
for (const key of (['NODE_ENV', 'MONGO_URI', 'MEDIA_STORAGE_PATH'] as const)) if (!env[key]) throw new Error(`${key} is required`);
if (!Number.isInteger(env.MEDIA_MAX_FILE_SIZE) || env.MEDIA_MAX_FILE_SIZE < 1) throw new Error('MEDIA_MAX_FILE_SIZE must be a positive integer');
if (!env.CLIENT_URL.length) throw new Error('CLIENT_URL must contain at least one allowed origin');
for (const key of [
  'MEDIA_CLIP_MAX_FILE_SIZE',
  'MEDIA_CLIP_MAX_DURATION_SECONDS',
  'MEDIA_CAPTION_MAX_FILE_SIZE',
  'MEDIA_PROCESS_TIMEOUT_MS',
  'MEDIA_ABANDONED_DAYS',
  'MEDIA_CREATOR_MAX_STORAGE_BYTES',
  'MEDIA_CREATOR_MAX_ASSET_COUNT',
  'MEDIA_EDUCATIONAL_MAX_FILE_SIZE',
] as const) {
  if (!Number.isInteger(env[key]) || env[key] < 1) throw new Error(`${key} must be a positive integer`);
}

const jwtSecret = env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}

export default env;
