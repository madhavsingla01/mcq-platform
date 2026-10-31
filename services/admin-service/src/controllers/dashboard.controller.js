import { getAuthDb, getQuizDb, getAttemptDb } from '../config/db.js';
import ModerationReport from '../models/ModerationReport.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import { catchAsync } from '../middleware/error.middleware.js';

export const getDashboardOverview = catchAsync(async (req, res) => {
  const authDb = getAuthDb();
  const quizDb = getQuizDb();
  const attemptDb = getAttemptDb();

  const usersCollection = authDb?.collection('users');
  const quizzesCollection = quizDb?.collection('quizzes');
  const attemptsCollection = attemptDb?.collection('attempts');

  // Parallel counts across collections
  const [
    totalUsers,
    suspendedUsers,
    totalQuizzes,
    activeChallenges,
    totalAttempts,
    pendingReports,
    recentAuditLogs,
  ] = await Promise.all([
    usersCollection ? usersCollection.countDocuments({ isDeleted: { $ne: true } }) : 0,
    usersCollection ? usersCollection.countDocuments({ isSuspended: true }) : 0,
    quizzesCollection ? quizzesCollection.countDocuments({}) : 0,
    quizzesCollection
      ? quizzesCollection.countDocuments({
          isChallenge: true,
          challengeStatus: 'active',
          $or: [{ deadlineAt: { $exists: false } }, { deadlineAt: null }, { deadlineAt: { $gt: new Date() } }],
        })
      : 0,
    attemptsCollection ? attemptsCollection.countDocuments({}) : 0,
    ModerationReport.countDocuments({ status: { $in: ['pending', 'in_review'] } }),
    AdminAuditLog.find({}).sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  // Aggregation: Last 7 days user registrations
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let userGrowth = [];
  if (usersCollection) {
    userGrowth = await usersCollection
      .aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();
  }

  res.json({
    success: true,
    data: {
      metrics: {
        totalUsers,
        suspendedUsers,
        totalQuizzes,
        activeChallenges,
        totalAttempts,
        pendingReports,
      },
      userGrowth,
      recentAuditLogs,
      timestamp: new Date().toISOString(),
    },
  });
});
