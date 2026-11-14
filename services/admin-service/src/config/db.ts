import mongoose, { type Connection, type ConnectOptions, type Types } from 'mongoose';
import env from './env.js';

let authDbConn: Connection | null = null;
let quizDbConn: Connection | null = null;
let attemptDbConn: Connection | null = null;

const MONGO_OPTIONS: ConnectOptions = {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE ?? 10),
  minPoolSize: 0,
  maxIdleTimeMS: 30000,
  waitQueueTimeoutMS: 5000,
  bufferCommands: false,
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
    console.error('❌ Admin Service MongoDB connection failed:', error instanceof Error ? error.message : error);
    throw error;
  }
};

export const getAuthDb = () => authDbConn;
export const getQuizDb = () => quizDbConn;
export const getAttemptDb = () => attemptDbConn;

// Local projections of records owned by the Auth and Quiz services.
export interface AccountRecord {
  _id: Types.ObjectId;
  email?: string;
  username?: string;
  role?: string | null;
  isDeleted?: boolean;
  isSuspended?: boolean;
  suspendedAt?: Date | null;
  suspensionReason?: string | null;
  suspendedBy?: Types.ObjectId | null;
  refreshToken?: string | null;
}

export interface ContentRecord {
  _id: Types.ObjectId;
  title?: string;
  quizCode?: string;
  uploader?: Types.ObjectId | null;
  uploaderDetails?: AccountRecord | null;
  visibility?: string;
  isChallenge?: boolean;
  isRestricted?: boolean;
  restrictedAt?: Date | null;
  restrictedReason?: string | null;
  restrictedBy?: Types.ObjectId | null;
}
