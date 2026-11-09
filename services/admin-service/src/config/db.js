import mongoose from 'mongoose';
import env from './env.js';

let authDbConn = null;
let quizDbConn = null;
let attemptDbConn = null;

const MONGO_OPTIONS = {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  family: 4,
};

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, MONGO_OPTIONS);
    console.log(`✅ Admin Service connected to primary MongoDB: ${conn.connection.host}/${conn.connection.name}`);

    // If URIs point to the same database (standard monorepo setup), reuse main connection
    // This avoids creating 30 redundant idle connections to MongoDB
    authDbConn = env.AUTH_MONGO_URI && env.AUTH_MONGO_URI !== env.MONGO_URI
      ? mongoose.createConnection(env.AUTH_MONGO_URI, { ...MONGO_OPTIONS, maxPoolSize: 5 })
      : conn.connection;

    quizDbConn = env.QUIZ_MONGO_URI && env.QUIZ_MONGO_URI !== env.MONGO_URI
      ? mongoose.createConnection(env.QUIZ_MONGO_URI, { ...MONGO_OPTIONS, maxPoolSize: 5 })
      : conn.connection;

    attemptDbConn = env.ATTEMPT_MONGO_URI && env.ATTEMPT_MONGO_URI !== env.MONGO_URI
      ? mongoose.createConnection(env.ATTEMPT_MONGO_URI, { ...MONGO_OPTIONS, maxPoolSize: 5 })
      : conn.connection;

    return conn;
  } catch (error) {
    console.error('❌ Admin Service MongoDB connection failed:', error.message);
    throw error;
  }
};

export const getAuthDb = () => authDbConn;
export const getQuizDb = () => quizDbConn;
export const getAttemptDb = () => attemptDbConn;
