import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const target = process.argv[2];
if (!MONGO_URI) throw new Error('MONGO_URI is required');
if (!target) throw new Error('Pass the target user email or username as the first argument');

async function makeAdmin() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to the configured MongoDB database.');

  const users = mongoose.connection.db.collection('users');
  const user = await users.findOne({
    $or: [{ email: target.toLowerCase() }, { username: target.toLowerCase() }],
  });

  if (!user) {
    console.error(`User '${target}' not found.`);
    process.exit(1);
  }

  await users.updateOne(
    { _id: user._id, role: { $ne: 'admin' } },
    [{ $set: {
      role: 'admin',
      refreshToken: null,
      tokenVersion: { $add: [{ $ifNull: ['$tokenVersion', 0] }, 1] },
    } }]
  );
  console.log(`✅ User ${user.email} (@${user.username}) is now an ADMIN (role: 'admin')!`);

  process.exit(0);
}

makeAdmin().catch(console.error);
