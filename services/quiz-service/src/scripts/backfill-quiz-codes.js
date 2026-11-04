import mongoose from 'mongoose';
import { randomInt } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI is required');
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const generateQuizCode = () => {
  let code = '!QZ-';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return code;
};

async function backfill() {
  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  const quizzesColl = db.collection('quizzes');

  const missingQuizzes = await quizzesColl.find({
    $or: [{ quizCode: { $exists: false } }, { quizCode: null }, { quizCode: '' }],
  }).toArray();

  console.log(`Found ${missingQuizzes.length} quizzes needing quizCode.`);

  let updatedCount = 0;
  const usedCodes = new Set(
    (await quizzesColl.distinct('quizCode')).filter(Boolean)
  );

  for (const quiz of missingQuizzes) {
    let newCode;
    do {
      newCode = generateQuizCode();
    } while (usedCodes.has(newCode));

    usedCodes.add(newCode);

    await quizzesColl.updateOne(
      { _id: quiz._id },
      { $set: { quizCode: newCode } }
    );
    updatedCount++;
    console.log(`[${updatedCount}/${missingQuizzes.length}] Quiz "${quiz.title || quiz._id}" -> ${newCode}`);
  }

  try {
    await quizzesColl.createIndex({ quizCode: 1 }, { unique: true, sparse: true });
    console.log('Unique sparse index on quizCode ensured.');
  } catch (idxErr) {
    console.warn('Index note:', idxErr.message);
  }

  console.log(`\n🎉 Backfill complete! Updated ${updatedCount} quizzes.`);
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
