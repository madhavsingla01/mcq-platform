import dotenv from 'dotenv';
dotenv.config();

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5008,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform',
  AUTH_MONGO_URI: process.env.AUTH_MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform',
  QUIZ_MONGO_URI: process.env.QUIZ_MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform',
  ATTEMPT_MONGO_URI: process.env.ATTEMPT_MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform',
  JWT_SECRET: process.env.JWT_SECRET || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@quizfocus.com',
  SERVICES: {
    gateway: process.env.GATEWAY_URL || 'http://localhost:5000',
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:5001',
    quiz: process.env.QUIZ_SERVICE_URL || 'http://localhost:5002',
    parser: process.env.PARSER_SERVICE_URL || 'http://localhost:5003',
    attempt: process.env.ATTEMPT_SERVICE_URL || 'http://localhost:5004',
    social: process.env.SOCIAL_SERVICE_URL || 'http://localhost:5005',
    message: process.env.MESSAGE_SERVICE_URL || 'http://localhost:5006',
    media: process.env.MEDIA_SERVICE_URL || 'http://localhost:5007',
  },
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};

const jwtSecret = env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || /default-jwt-secret|mcq-platform-jwt-secret-change-in-production|quizfocus-local-development-secret|replace-with-/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a configured, non-placeholder secret of at least 32 bytes');
}

export default env;
