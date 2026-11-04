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
    const all = await users.find({}, { projection: { email: 1, username: 1, role: 1 } }).toArray();
    console.log('Available users:', all);
    process.exit(1);
  }

  await users.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
  console.log(`✅ User ${user.email} (@${user.username}) is now an ADMIN (role: 'admin')!`);

  // Also seed AdminMembership in mcq-platform
  const memberships = mongoose.connection.db.collection('adminmemberships');
  await memberships.updateOne(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        userEmail: user.email,
        userName: user.name || user.username,
        roleSlugs: ['super_admin'],
        assignedAt: new Date(),
        notes: 'Promoted via make-admin script',
      },
    },
    { upsert: true }
  );

  console.log(`🛡️ Assigned 'super_admin' membership.`);
  process.exit(0);
}

makeAdmin().catch(console.error);
