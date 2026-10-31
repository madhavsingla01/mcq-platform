import mongoose from 'mongoose';
import env from './env.js';

export const connectDB = async () => {
  await mongoose.connect(env.MONGO_URI);
  console.log('Connected to media database');
};
