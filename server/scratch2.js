import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/mcq-platform';
mongoose.connect(uri).then(async () => {
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  console.log('Users in DB:');
  for (const u of users) {
     console.log('User:', u.email, 'has refreshToken:', !!u.refreshToken);
  }
  process.exit(0);
}).catch(console.error);
