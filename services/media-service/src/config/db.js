import mongoose from 'mongoose';
import env from './env.js';
let contentConnection;
export const getContentDb = () => contentConnection?.db;
export const contentDbReady = () => contentConnection?.readyState === 1;

export const connectDB = async () => {
  const conn = await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE ?? 10),
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  console.log('Connected to media database');
  contentConnection = env.MEDIA_CONTENT_MONGO_URI === env.MONGO_URI ? conn.connection
    : await mongoose.createConnection(env.MEDIA_CONTENT_MONGO_URI, {
      maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 15000, waitQueueTimeoutMS: 5000,
    }).asPromise();
  return conn;
};
