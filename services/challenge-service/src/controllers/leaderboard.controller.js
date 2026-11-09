import mongoose from 'mongoose';
import Challenge from '../models/Challenge.model.js';
import Attempt from '../models/Attempt.model.js';
import { RankingService } from '../services/ranking.service.js';
import memoryCache from '../services/cache.service.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import env from '../config/env.js';

export const getChallengeLeaderboard = catchAsync(async (req, res) => {
  const { idOrCode } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrCode);

  const query = isObjectId
    ? { _id: new mongoose.Types.ObjectId(idOrCode), isChallenge: true }
    : {
        $or: [
          { challengeCode: idOrCode.toUpperCase() },
          { quizCode: idOrCode.toUpperCase() },
        ],
        isChallenge: true,
      };

  const challenge = await Challenge.findOne({
    ...query,
    isRestricted: { $ne: true },
    accessType: 'public',
    visibility: 'public',
    challengeStatus: { $in: ['active', 'ended'] },
  }).select('title deadlineAt');
  if (!challenge) {
    throw new AppError('Challenge not found', 404);
  }

  const now = new Date();
  const deadlinePassed = challenge.deadlineAt && new Date(challenge.deadlineAt) <= now;
  const submitted = req.user ? await Attempt.findOne({
    quizId: challenge._id,
    userId: req.user._id,
    status: 'completed',
  }).sort({ completedAt: -1, _id: -1 }).select('completedAt isPractice').lean() : null;

  const context = {
    title: challenge.title,
    deadlineAt: challenge.deadlineAt,
    serverTime: now.toISOString(),
    viewerSubmission: submitted ? {
      attemptId: submitted._id,
      completedAt: submitted.completedAt,
      kind: submitted.isPractice ? 'practice' : 'ranked',
    } : null,
  };
  res.set('Cache-Control', 'private, no-store');

  // Quarantine enforcement: Standings sealed until deadline
  if (!deadlinePassed) {
    return res.json({
      success: true,
      data: {
        ...context,
        quarantined: true,
        leaderboard: [],
        message: 'Leaderboard and ranks are quarantined until the finalization deadline.',
      },
    });
  }

  const competitive = { quizId: challenge._id, userId: { $ne: null }, isPractice: { $ne: true } };
  if (await Attempt.exists({ ...competitive, status: 'in_progress' })) {
    // The deadline worker can still be settling timed attempts. Show the same
    // state to every viewer until the final standings include all submissions.
    return res.json({
      success: true,
      data: { ...context, quarantined: false, finalizing: true, leaderboard: [] },
    });
  }

  const cacheKey = `challenge_leaderboard:${challenge._id}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: {
        ...context,
        quarantined: false,
        cached: true,
        leaderboard: cached,
        totalParticipants: cached.length,
      },
    });
  }

  // Fetch all completed attempts
  const attempts = await Attempt.find({
    ...competitive,
    status: 'completed',
  })
    .select('userId score totalMarks percentage totalTime totalTimeMs completedAt')
    .populate('userId', 'name username avatar preferences.showOnLeaderboard preferences.challenges.showOnLeaderboards')
    .lean();

  const rankedLeaderboard = RankingService.calculateRankings(attempts, 'competition');

  // Cache for 15 seconds to handle post-reveal traffic spikes
  if (rankedLeaderboard.length) memoryCache.set(cacheKey, rankedLeaderboard, env.LEADERBOARD_CACHE_TTL_SECONDS);

  res.json({
    success: true,
    data: {
      ...context,
      quarantined: false,
      leaderboard: rankedLeaderboard,
      totalParticipants: rankedLeaderboard.length,
    },
  });
});
