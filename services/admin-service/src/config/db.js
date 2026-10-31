import mongoose from 'mongoose';
import env from './env.js';

let authDbConn = null;
let quizDbConn = null;
let attemptDbConn = null;

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ Admin Service connected to primary MongoDB: ${conn.connection.host}/${conn.connection.name}`);

    // Auxiliary connections for fast cross-service queries and aggregations
    authDbConn = mongoose.createConnection(env.AUTH_MONGO_URI, { maxPoolSize: 10 });
    authDbConn.on('connected', () => {
      console.log(`🔗 Admin Service connected to Auth DB: ${env.AUTH_MONGO_URI}`);
    });

    quizDbConn = mongoose.createConnection(env.QUIZ_MONGO_URI, { maxPoolSize: 10 });
    quizDbConn.on('connected', () => {
      console.log(`🔗 Admin Service connected to Quiz DB: ${env.QUIZ_MONGO_URI}`);
    });

    attemptDbConn = mongoose.createConnection(env.ATTEMPT_MONGO_URI, { maxPoolSize: 10 });
    attemptDbConn.on('connected', () => {
      console.log(`🔗 Admin Service connected to Attempt DB: ${env.ATTEMPT_MONGO_URI}`);
    });

    return conn;
  } catch (error) {
    console.error('❌ Admin Service MongoDB connection failed:', error.message);
    throw error;
  }
};

export const getAuthDb = () => authDbConn;
export const getQuizDb = () => quizDbConn;
export const getAttemptDb = () => attemptDbConn;
