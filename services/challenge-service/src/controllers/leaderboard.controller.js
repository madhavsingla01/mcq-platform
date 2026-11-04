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
  }).select('uploader title deadlineAt isChallenge');
  if (!challenge) {
    throw new AppError('Challenge not found', 404);
  }

  const now = new Date();
  const deadlinePassed = challenge.deadlineAt && new Date(challenge.deadlineAt) <= now;

  // Quarantine enforcement: Standings sealed until deadline
  if (!deadlinePassed) {
    return res.json({
      success: true,
      data: {
        quarantined: true,
        deadlineAt: challenge.deadlineAt,
        leaderboard: [],
        message: 'Leaderboard and ranks are quarantined until the finalization deadline.',
      },
    });
  }

  // Check localized cache
  const cacheKey = `challenge_leaderboard:${challenge._id}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: {
        quarantined: false,
        cached: true,
        leaderboard: cached,
      },
    });
  }

  // Fetch all completed attempts
  const attempts = await Attempt.find({
    quizId: challenge._id,
    status: 'completed',
    userId: { $ne: null },
    isPractice: { $ne: true },
  })
    .populate('userId', 'name username avatar')
    .lean();

  const rankedLeaderboard = RankingService.calculateRankings(attempts, 'competition');

  // Cache for 15 seconds to handle post-reveal traffic spikes
  memoryCache.set(cacheKey, rankedLeaderboard, env.LEADERBOARD_CACHE_TTL_SECONDS);

  res.json({
    success: true,
    data: {
      quarantined: false,
      leaderboard: rankedLeaderboard,
      totalParticipants: rankedLeaderboard.length,
    },
  });
});
