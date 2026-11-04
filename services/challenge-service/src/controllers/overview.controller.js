import Challenge from '../models/Challenge.model.js';
import Attempt from '../models/Attempt.model.js';
import User from '../models/User.model.js';
import { catchAsync } from '../middleware/error.middleware.js';

export const getChallengesOverview = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  const now = new Date();
  const publicActiveChallenge = {
    isChallenge: true,
    deadlineAt: { $gt: now },
    challengeStatus: 'active',
    isRestricted: { $ne: true },
    accessType: 'public',
    visibility: 'public',
  };

  const [trendingChallenges, featuredChallenge, activeAttempts, topCreators, completedAttempts] = await Promise.all([
    Challenge.find(publicActiveChallenge)
      .populate('uploader', 'name username avatar')
      .sort({ totalAttempts: -1, createdAt: -1 })
      .limit(6)
      .select('-questions.correctOption -questions.explanation')
      .lean(),

    Challenge.findOne(publicActiveChallenge)
      .populate('uploader', 'name username avatar bio')
      .sort({ totalAttempts: -1, likeCount: -1 })
      .select('-questions.correctOption -questions.explanation')
      .lean(),

    userId
      ? Attempt.find({
          userId,
          status: 'in_progress',
          isPractice: { $ne: true },
        })
          .populate({
            path: 'quizId',
            model: Challenge,
            match: {
              isChallenge: true,
              deadlineAt: { $gt: now },
              challengeStatus: 'active',
              isRestricted: { $ne: true },
              accessType: 'public',
              visibility: 'public',
            },
            select: 'title category durationMinutes deadlineAt isChallenge challengeCode quizCode',
          })
          .sort({ updatedAt: -1 })
          .limit(3)
          .lean()
      : [],

    User.find({
      role: { $in: ['user', 'admin'] },
      isDeleted: { $ne: true },
      isProfilePublic: { $ne: false },
      isPrivate: { $ne: true },
    })
      .sort({ quizCount: -1 })
      .limit(5)
      .select('name username avatar quizCount')
      .lean(),

    userId
      ? Attempt.find({
          userId,
          status: 'completed',
          isPractice: { $ne: true },
          completedAt: { $ne: null },
        })
          .populate({ path: 'quizId', model: Challenge, match: { isChallenge: true }, select: 'isChallenge' })
          .select('completedAt')
          .lean()
      : [],
  ]);

  const validActiveAttempts = (activeAttempts || []).filter((attempt) => attempt.quizId);
  const validCompletedAttempts = (completedAttempts || []).filter((attempt) => attempt.quizId && attempt.completedAt);
  const activeDays = new Set(validCompletedAttempts.map((attempt) => new Date(attempt.completedAt).toISOString().slice(0, 10)));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!activeDays.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let dayStreak = 0;
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    dayStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  res.json({
    success: true,
    data: {
      stats: {
        dayStreak,
        quizzesDone: validCompletedAttempts.length,
        globalRank: null,
      },
      featuredChallenge: featuredChallenge || null,
      activeAttempts: validActiveAttempts,
      trendingChallenges: trendingChallenges || [],
      topCreators: topCreators || [],
      suggestedCreators: topCreators || [],
    },
  });
});
