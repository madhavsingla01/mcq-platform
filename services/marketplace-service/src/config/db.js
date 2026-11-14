import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import env from './env.js';

let isListening = false;

/**
 * Connect to MongoDB with standard QuizFocus connection pooling options.
 * @param {string} [uri] - Optional MongoDB connection URI override
 * @returns {Promise<typeof mongoose>}
 */
export const connectDB = async (uri) => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const connectionUri = uri || env.MONGO_URI;

  try {
    const conn = await mongoose.connect(connectionUri, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE ?? 10),
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    if (!isListening) {
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err.message);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected.');
      });
      isListening = true;
    }

    return conn;
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

/**
 * Disconnect cleanly from MongoDB.
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected cleanly.');
  }
};

export default connectDB;
