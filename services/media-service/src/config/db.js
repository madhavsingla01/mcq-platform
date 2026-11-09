import mongoose from 'mongoose';
import env from './env.js';

export const connectDB = async () => {
  const conn = await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  console.log('Connected to media database');
  return conn;
};
