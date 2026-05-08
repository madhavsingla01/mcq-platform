import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/mcq-platform';
mongoose.connect(uri).then(async () => {
  const quizzes = await mongoose.connection.db.collection('quizzes').find({}).toArray();
  for (const q of quizzes) {
     const stats = await mongoose.connection.db.collection('attempts').aggregate([
        { $match: { quizId: q._id, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalAttempts: { $sum: 1 },
            avgScore: { $avg: '$score' },
            highestScore: { $max: '$score' },
            lowestScore: { $min: '$score' },
            passCount: {
              $sum: { $cond: [{ $gte: ['$percentage', 50] }, 1, 0] }
            }
          }
        }
      ]).toArray();
      console.log('Quiz:', q.title, 'Stats:', stats);
  }
  process.exit(0);
}).catch(console.error);
