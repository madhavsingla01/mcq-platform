import Attempt from '../models/Attempt.model.js';
import Quiz from '../models/Quiz.model.js';
import User from '../models/User.model.js';
import { catchAsync } from '../middleware/error.middleware.js';

const clampLimit = (value, fallback = 25) => Math.min(Math.max(parseInt(value, 10) || fallback, 1), 100);

const getLevel = (xp) => Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1);

const getLearnerBadges = (row) => {
  const badges = [];
  if (row.totalAttempts >= 10) badges.push('Dedicated');
  if (row.totalAttempts >= 25) badges.push('Marathon');
  if (row.bestPercentage >= 90) badges.push('High scorer');
  if (row.totalCorrect >= 100) badges.push('Century');
  return badges;
};

const getCreatorBadges = (row) => {
  const badges = [];
  if (row.publicQuizCount >= 5) badges.push('Publisher');
  if (row.totalAttempts >= 25) badges.push('Crowd tested');
  if (row.avgScore >= 80) badges.push('Trusted');
  if (row.trustScore >= 75) badges.push('Top creator');
  return badges;
};

export const getGlobalLeaderboard = catchAsync(async (req, res) => {
  const limit = clampLimit(req.query.limit);

  const rows = await Attempt.aggregate([
    {
      $match: {
        status: 'completed',
        completed: true,
        userId: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$userId',
        totalAttempts: { $sum: 1 },
        avgPercentage: { $avg: '$percentage' },
        bestPercentage: { $max: '$percentage' },
        totalCorrect: { $sum: '$correctCount' },
        totalQuestions: { $sum: '$totalQuestions' },
        totalTimeMs: { $sum: '$totalTimeMs' },
        lastCompletedAt: { $max: '$completedAt' },
        rawXp: {
          $sum: {
            $add: [
              { $multiply: ['$percentage', 2] },
              { $multiply: ['$correctCount', 5] },
              20,
            ],
          },
        },
      },
    },
    { $sort: { rawXp: -1, avgPercentage: -1, totalAttempts: -1 } },
    { $limit: limit },
  ]);

  const users = await User.find({ _id: { $in: rows.map((row) => row._id) } })
    .select('name username avatar')
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  const leaderboard = rows.map((row, index) => {
    const xp = Math.round(row.rawXp || 0);
    const totalTimeMs = Number(row.totalTimeMs || 0);
    return {
      rank: index + 1,
      user: userById.get(row._id.toString()) || null,
      xp,
      level: getLevel(xp),
      badges: getLearnerBadges(row),
      totalAttempts: row.totalAttempts,
      avgPercentage: Math.round((row.avgPercentage || 0) * 10) / 10,
      bestPercentage: Math.round((row.bestPercentage || 0) * 10) / 10,
      totalCorrect: row.totalCorrect || 0,
      totalQuestions: row.totalQuestions || 0,
      totalTimeMs,
      lastCompletedAt: row.lastCompletedAt,
    };
  }).filter((row) => row.user);

  res.json({
    success: true,
    data: { leaderboard },
  });
});

export const getCreatorLeaderboard = catchAsync(async (req, res) => {
  const limit = clampLimit(req.query.limit);

  const rows = await Quiz.aggregate([
    {
      $match: {
        uploader: { $ne: null },
        $or: [{ visibility: 'public' }, { isPublic: true }],
      },
    },
    {
      $group: {
        _id: '$uploader',
        publicQuizCount: { $sum: 1 },
        totalAttempts: { $sum: '$totalAttempts' },
        avgScore: { $avg: '$avgScore' },
        newestQuizAt: { $max: '$createdAt' },
      },
    },
  ]);

  const rankedRows = rows
    .map((row) => {
      const avgScore = Number(row.avgScore || 0);
      const totalAttempts = Number(row.totalAttempts || 0);
      const quizDepth = Math.min(20, Number(row.publicQuizCount || 0) * 3);
      const attemptSignal = Math.min(35, Math.log10(totalAttempts + 1) * 18);
      const trustScore = Math.round(Math.min(100, (avgScore * 0.45) + attemptSignal + quizDepth));
      return {
        ...row,
        avgScore: Math.round(avgScore * 10) / 10,
        trustScore,
      };
    })
    .sort((a, b) => (
      b.trustScore - a.trustScore ||
      b.totalAttempts - a.totalAttempts ||
      b.publicQuizCount - a.publicQuizCount
    ))
    .slice(0, limit);

  const users = await User.find({ _id: { $in: rankedRows.map((row) => row._id) } })
    .select('name username avatar followersCount')
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  const creators = rankedRows.map((row, index) => ({
    rank: index + 1,
    user: userById.get(row._id.toString()) || null,
    trustScore: row.trustScore,
    badges: getCreatorBadges(row),
    publicQuizCount: row.publicQuizCount,
    totalAttempts: row.totalAttempts,
    avgScore: row.avgScore,
    newestQuizAt: row.newestQuizAt,
  })).filter((row) => row.user);

  res.json({
    success: true,
    data: { creators },
  });
});

export default { getGlobalLeaderboard, getCreatorLeaderboard };
