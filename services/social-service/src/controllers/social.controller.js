import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Quiz from '../models/Quiz.model.js';
import Follow from '../models/Follow.model.js';
import QuizInteraction from '../models/QuizInteraction.model.js';
import QuizComment from '../models/QuizComment.model.js';
import QuizShare from '../models/QuizShare.model.js';
import Activity from '../models/Activity.model.js';
import Notification from '../models/Notification.model.js';
import Conversation from '../models/Conversation.model.js';
import Message from '../models/Message.model.js';
import Attempt from '../models/Attempt.model.js';
import { AppError, catchAsync } from '../middleware/error.middleware.js';
import { closestQuizSearch } from '../services/social/closestQuizSearch.js';
import {
  decorateQuizzesForViewer,
  isPublicQuiz,
  notificationVerbs,
  publicQuizFilter,
  recordActivity,
} from '../services/social/activity.service.js';
import { buildCommentTree } from '../services/social/commentTree.js';

const USER_PUBLIC_SELECT = 'name username avatar banner bio quizCount followersCount followingCount activityCount isProfilePublic createdAt socialLinks';
const USER_LIST_SELECT = 'name username avatar bio quizCount followersCount followingCount';
const QUIZ_FEED_SELECT = 'title description category difficulty thumbnail visibility isPublic uploader questionCount totalAttempts avgScore likeCount commentCount bookmarkCount shareCount lastSocialActivityAt createdAt tags isChallenge deadlineAt';
const resultsSealed = quiz => Boolean(quiz?.isChallenge && !(quiz.deadlineAt && new Date(quiz.deadlineAt) <= new Date()));
const MAX_COMMENT_DEPTH = 5;

const toIdString = (value) => (value?._id ? String(value._id) : String(value || ''));
const normalizeUsername = (username = '') => String(username).replace(/^@/, '').toLowerCase().trim();

export const resolveUserByIdentifier = async (identifier, selectFields = USER_PUBLIC_SELECT) => {
  if (!identifier) return null;
  const clean = String(identifier).replace(/^@/, '').trim();
  const isId = mongoose.isValidObjectId(clean);
  const query = isId
    ? { $or: [{ _id: clean }, { username: clean.toLowerCase() }] }
    : { username: clean.toLowerCase() };
  return User.findOne(query).select(selectFields);
};

export const canViewPrivateDetails = async (targetUser, viewer) => {
  if (!targetUser) return false;
  const isPrivate = Boolean(targetUser.isPrivate || targetUser.isProfilePublic === false);
  if (!isPrivate) return true;
  if (!viewer) return false;
  if (toIdString(viewer._id) === toIdString(targetUser._id)) return true;
  if (viewer.role === 'admin') return true;
  const isFollowing = await Follow.exists({ follower: viewer._id, following: targetUser._id });
  return Boolean(isFollowing);
};

const ensurePublicProfileAccess = async (user, viewer) => {
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const allowed = await canViewPrivateDetails(user, viewer);
  if (!allowed) {
    throw new AppError('This profile is private', 403);
  }
};

const clampPagination = (query, defaultLimit = 12, maxLimit = 50) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPublicQuiz = async (quizId, viewer = null) => {
  if (!mongoose.isValidObjectId(quizId)) {
    throw new AppError('Invalid quiz id', 400);
  }

  const quiz = await Quiz.findById(quizId).populate('uploader', USER_LIST_SELECT);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  if (!isPublicQuiz(quiz)) {
    const isOwner = viewer && toIdString(quiz.uploader?._id || quiz.uploader) === toIdString(viewer._id);
    const isAdmin = viewer && viewer.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError('Public quiz not found', 404);
    }
  }

  return quiz;
};

const decorateUsersForViewer = async (users, viewerId) => {
  const plainUsers = users.map((user) => (typeof user.toObject === 'function' ? user.toObject() : user));
  if (!viewerId || plainUsers.length === 0) {
    return plainUsers.map((user) => ({ ...user, isFollowing: false }));
  }

  const userIds = plainUsers.map((user) => user._id);
  const follows = await Follow.find({
    follower: viewerId,
    following: { $in: userIds },
  }).select('following').lean();
  const followedIds = new Set(follows.map((follow) => toIdString(follow.following)));

  return plainUsers.map((user) => ({
    ...user,
    isFollowing: followedIds.has(toIdString(user._id)),
  }));
};

const syncNonNegativeUserCounters = async (userIds) => {
  await Promise.all(
    userIds.filter(Boolean).map((userId) => (
      User.updateOne(
        { _id: userId },
        [
          {
            $set: {
              followersCount: { $max: ['$followersCount', 0] },
              followingCount: { $max: ['$followingCount', 0] },
            },
          },
        ]
      )
    ))
  );
};

const syncNonNegativeQuizCounters = async (quizId) => {
  await Quiz.updateOne(
    { _id: quizId },
    [
      {
        $set: {
          likeCount: { $max: ['$likeCount', 0] },
          bookmarkCount: { $max: ['$bookmarkCount', 0] },
          commentCount: { $max: ['$commentCount', 0] },
          shareCount: { $max: ['$shareCount', 0] },
        },
      },
    ]
  );
};

const buildQuizQuery = async ({ req, publicOnly = true, closestQuery = '' }) => {
  const search = closestQuery || String(req.query.search || req.query.q || '').trim();
  const filters = [publicOnly ? publicQuizFilter : {}];

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const users = await User.find({
      isProfilePublic: { $ne: false },
      'preferences.searchDiscovery': { $ne: false },
      $or: [{ username: regex }, { name: regex }],
    }).select('_id').limit(100).lean();

    filters.push(closestQuery ? closestQuizSearch(search, users.map(user => user._id)).filter : {
      $or: [
        { title: regex },
        { description: regex },
        { category: regex },
        { tags: regex },
        { uploader: { $in: users.map((user) => user._id) } },
      ],
    });
  }

  if (req.query.tag && String(req.query.tag).trim()) {
    const cleanTag = String(req.query.tag).trim().toLowerCase().replace(/^#+/, '');
    if (cleanTag && cleanTag !== 'all') {
      filters.push({ tags: new RegExp('^' + escapeRegex(cleanTag) + '$', 'i') });
    }
  }

  if (req.query.category && String(req.query.category).trim().toLowerCase() !== 'all') {
    filters.push({ category: String(req.query.category).trim() });
  }

  if (req.query.difficulty) {
    const rawDiff = String(req.query.difficulty).trim().toLowerCase();
    if (rawDiff !== 'all' && rawDiff !== 'all levels') {
      const normalized =
        rawDiff === 'beginner' || rawDiff === 'easy' ? 'Beginner'
        : rawDiff === 'intermediate' || rawDiff === 'medium' ? 'Intermediate'
        : rawDiff === 'advanced' || rawDiff === 'hard' ? 'Advanced'
        : 'All Levels';
      filters.push({ difficulty: normalized });
    }
  }

  if (req.query.showVerifiedOnly === 'true' || req.query.filterUnverified === 'true') {
    filters.push({ isVerified: true });
  }

  if ((req.query.hideCompleted === 'true' || req.query.hideCompletedQuizzes === 'true') && req.user?._id) {
    try {
      const completedQuizIds = await Attempt.distinct('quizId', {
        userId: req.user._id,
        status: 'completed',
      });
      if (completedQuizIds.length > 0) {
        filters.push({ _id: { $nin: completedQuizIds } });
      }
    } catch (_) {}
  }


  return filters.length === 1 ? filters[0] : { $and: filters };
};

const sortForQuery = (query) => {
  const sortKey = String(query.sort || '').trim().toLowerCase();
  if (sortKey === 'popular') {
    return { likeCount: -1, totalAttempts: -1, commentCount: -1, createdAt: -1 };
  }
  if (sortKey === 'top' || sortKey === 'rating') {
    return { avgScore: -1, totalAttempts: -1, likeCount: -1, createdAt: -1 };
  }
  if (sortKey === 'newest' || sortKey === 'recent') {
    return { createdAt: -1 };
  }
  if (sortKey === 'oldest') {
    return { createdAt: 1 };
  }
  if (sortKey === 'questions') {
    return { questionCount: -1, createdAt: -1 };
  }
  if (sortKey === 'title' || sortKey === 'alphabetical') {
    return { title: 1, createdAt: -1 };
  }
  if (sortKey === 'active') {
    return { lastSocialActivityAt: -1, createdAt: -1 };
  }
  return { createdAt: -1 };
};

const sortedQuizPage = (filter, sort, skip, limit, searchScore) => {
  const uploader = { path: 'uploader', select: USER_LIST_SELECT, options: { lean: true } };
  if (!sort.avgScore && !searchScore) {
    return Quiz.find(filter).select(QUIZ_FEED_SELECT).sort(sort).skip(skip).limit(limit).populate(uploader).lean();
  }
  return Quiz.aggregate([
    { $match: filter },
    { $project: Object.fromEntries(QUIZ_FEED_SELECT.split(' ').map(field => [field, 1])) },
    { $set: { avgScore: { $cond: [
      { $and: [{ $eq: ['$isChallenge', true] }, { $or: [
        { $ne: [{ $type: '$deadlineAt' }, 'date'] }, { $gt: ['$deadlineAt', '$$NOW'] },
      ] }] },
      0,
      '$avgScore',
    ] } } },
    ...(searchScore ? [{ $set: { searchScore } }] : []),
    { $sort: searchScore ? { searchScore: -1, ...sort, _id: 1 } : sort }, { $skip: skip }, { $limit: limit },
    ...(searchScore ? [{ $unset: 'searchScore' }] : []),
  ]).option(searchScore ? { maxTimeMS: 5000 } : {}).then(rows => Quiz.populate(rows, uploader));
};

export const getFeed = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 12, 40);
  const scope = req.query.scope === 'following' ? 'following' : 'all';
  const filters = [await buildQuizQuery({ req, publicOnly: true })];

  if (scope === 'following') {
    if (!req.user) {
      throw new AppError('Log in to view following feed', 401);
    }

    const followingIds = await Follow.distinct('following', { follower: req.user._id });
    const allowedUploaders = [...followingIds, req.user._id];

    if (!allowedUploaders.length) {
      return res.json({
        success: true,
        data: {
          items: [],
          pagination: { total: 0, page, limit, pages: 0 },
        },
      });
    }

    filters.push({ uploader: { $in: allowedUploaders } });
  }

  const filter = filters.length === 1 ? filters[0] : { $and: filters };
  const [quizzes, total] = await Promise.all([
    sortedQuizPage(filter, sortForQuery({ ...req.query, sort: req.query.sort || 'active' }), skip, limit),
    Quiz.countDocuments(filter),
  ]);

  const decorated = await decorateQuizzesForViewer(quizzes, req.user?._id);

  const feedPages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      items: decorated.map((quiz) => ({ type: 'quiz', quiz })),
      pagination: {
        total,
        page,
        limit,
        pages: feedPages,
        hasMore: page < feedPages,
        hasNext: page < feedPages,
        hasPrev: page > 1,
      },
    },
  });
});

export const getExplore = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 12, 50);
  const closestQuery = req.query.match === 'closest' ? String(req.query.search || req.query.q || '').trim().slice(0, 100) : '';
  const filter = await buildQuizQuery({ req, publicOnly: true, closestQuery });
  const mode = String(req.query.mode || req.query.sort || 'foryou').trim().toLowerCase();
  const userId = req.user?._id;

  // 1. Explicit Non-Algorithmic Sorts (Newest, Top Attempts, Oldest, Popular, etc.)
  const explicitModes = ['newest', 'recent', 'oldest', 'questions', 'popular', 'top', 'rating', 'active', 'title', 'alphabetical'];
  if (closestQuery || explicitModes.includes(mode)) {
    const searchScore = closestQuery ? closestQuizSearch(closestQuery).score : null;
    const count = Quiz.countDocuments(filter);
    if (closestQuery) count.maxTimeMS(5000);
    const [quizzes, total] = await Promise.all([
      sortedQuizPage(filter, sortForQuery({ ...req.query, sort: req.query.sort || mode }), skip, limit, searchScore),
      count,
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const decorated = await decorateQuizzesForViewer(quizzes, userId);

    const reasonMap = {
      newest: '✨ Newly added',
      recent: '✨ Newly added',
      top: '⭐ Top Rated',
      rating: '⭐ Top Rated',
      popular: '🔥 Most Popular',
      active: '⚡ Recently Active',
      questions: '📝 Comprehensive Exam',
      title: '🔤 Alphabetical',
      alphabetical: '🔤 Alphabetical',
    };

    return res.json({
      success: true,
      data: {
        quizzes: decorated.map((q) => ({
          ...q,
          recommendationReason: closestQuery ? 'Search match' : reasonMap[mode] || '⭐ Recommended',
        })),
        pagination: {
          total,
          page,
          limit,
          pages: totalPages,
          hasMore: page < totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        meta: {
          mode,
          algorithm: closestQuery ? 'search-relevance' : 'explicit-sort',
          hasUserContext: Boolean(userId),
        },
      },
    });
  }

  // 2. INSTAGRAM-STYLE ALGORITHMIC DISCOVERY ENGINE ('foryou' or 'trending' mode)
  let lastQuizTags = [];
  let lastQuizTitle = '';
  const userTagFrequency = {};
  const followedCreatorIds = new Set();

  if (userId) {
    try {
      const [lastAttempt, lastBookmark, userFollows, userAttempts] = await Promise.all([
        Attempt.findOne({ $or: [{ userId }, { user: userId }] })
          .sort({ createdAt: -1 })
          .populate('quizId', 'title tags category')
          .lean(),
        QuizInteraction.findOne({ user: userId, type: 'bookmark' })
          .sort({ createdAt: -1 })
          .populate('quiz', 'title tags category')
          .lean(),
        Follow.find({ follower: userId }).select('following').lean(),
        Attempt.find({ $or: [{ userId }, { user: userId }] })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate('quizId', 'tags')
          .lean(),
      ]);

      const lastEngaged = lastAttempt?.quizId || lastBookmark?.quiz;
      if (lastEngaged) {
        lastQuizTags = (lastEngaged.tags || []).map((t) => String(t).toLowerCase());
        lastQuizTitle = lastEngaged.title || '';
      }

      // Build User Tag Frequency Map from past attempts
      for (const a of userAttempts || []) {
        const qDoc = a.quizId;
        for (const t of qDoc?.tags || []) {
          const norm = String(t).toLowerCase();
          userTagFrequency[norm] = (userTagFrequency[norm] || 0) + 1;
        }
      }


      // Followed Creators Set
      for (const f of userFollows || []) {
        followedCreatorIds.add(String(f.following));
      }
    } catch (profileErr) {
      console.error('[getExplore profile lookup error]:', profileErr);
    }

  }


  // Signal C: Engagement Momentum
  const viralityScoreExpr = {
    $min: [
      30,
      {
        $multiply: [
          {
            $log10: {
              $add: [
                1,
                {
                  $add: [
                    { $multiply: [{ $ifNull: ['$likeCount', 0] }, 4] },
                    { $multiply: [{ $ifNull: ['$totalAttempts', 0] }, 2] },
                    { $multiply: [{ $ifNull: ['$bookmarkCount', 0] }, 3] },
                  ],
                },
              ],
            },
          },
          10,
        ],
      },
    ],
  };

  // Signal E: Freshness & Serendipity (Decay)
  const freshnessScoreExpr = {
    $max: [
      0,
      {
        $subtract: [
          10,
          {
            $multiply: [
              {
                $divide: [
                  { $subtract: [new Date(), '$createdAt'] },
                  86400000,
                ],
              },
              0.7,
            ],
          },
        ],
      },
    ],
  };

  // Signal D: Creator Following Affinity
  const followedObjectIds = Array.from(followedCreatorIds)
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const followingScoreExpr = followedObjectIds.length > 0
    ? { $cond: [{ $in: ['$uploader', followedObjectIds] }, 20, 0] }
    : 0;

  // Signal A: Topic Continuity
  const topicScoreExpr = lastQuizTags.length > 0
    ? {
        $let: {
          vars: {
            matchedCount: {
              $size: {
                $setIntersection: [
                  {
                    $map: {
                      input: { $ifNull: ['$tags', []] },
                      as: 't',
                      in: { $toLower: '$$t' },
                    },
                  },
                  lastQuizTags,
                ],
              },
            },
          },
          in: {
            $switch: {
              branches: [
                { case: { $gte: ['$$matchedCount', 2] }, then: 40 },
                { case: { $gte: ['$$matchedCount', 1] }, then: 25 },
              ],
              default: 0,
            },
          },
        },
      }
    : 0;

  // Signal B: Historical Tag Affinity
  const topUserTags = Object.keys(userTagFrequency).slice(0, 8);
  const historyScoreExpr = topUserTags.length > 0
    ? {
        $min: [
          25,
          {
            $multiply: [
              {
                $size: {
                  $setIntersection: [
                    {
                      $map: {
                        input: { $ifNull: ['$tags', []] },
                        as: 't',
                        in: { $toLower: '$$t' },
                      },
                    },
                    topUserTags,
                  ],
                },
              },
              5,
            ],
          },
        ],
      }
    : 0;

  // Composite Algo Score
  const algoScoreExpr = {
    $round: [
      {
        $add: [
          viralityScoreExpr,
          freshnessScoreExpr,
          followingScoreExpr,
          topicScoreExpr,
          historyScoreExpr,
        ],
      },
      1,
    ],
  };

  const pipeline = [
    { $match: filter },
    {
      $addFields: {
        rawEngagement: {
          $add: [
            { $multiply: [{ $ifNull: ['$likeCount', 0] }, 4] },
            { $multiply: [{ $ifNull: ['$totalAttempts', 0] }, 2] },
            { $multiply: [{ $ifNull: ['$bookmarkCount', 0] }, 3] },
          ],
        },
        ageDays: {
          $max: [
            0,
            {
              $divide: [
                { $subtract: [new Date(), '$createdAt'] },
                86400000,
              ],
            },
          ],
        },
        algoScore: algoScoreExpr,
      },
    },
    {
      $sort: {
        algoScore: -1,
        likeCount: -1,
        createdAt: -1,
      },
    },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'uploader',
              foreignField: '_id',
              as: 'uploader',
              pipeline: [
                {
                  $project: {
                    name: 1,
                    username: 1,
                    avatar: 1,
                    bio: 1,
                    quizCount: 1,
                    followersCount: 1,
                    followingCount: 1,
                  },
                },
              ],
            },
          },
          {
            $unwind: {
              path: '$uploader',
              preserveNullAndEmptyArrays: true,
            },
          },
        ],
      },
    },
  ];

  const aggregationResult = await Quiz.aggregate(pipeline).allowDiskUse(true);
  const total = aggregationResult[0]?.metadata[0]?.total || 0;
  const pagedQuizzes = aggregationResult[0]?.data || [];

  for (const quiz of pagedQuizzes) {
    const qTags = (quiz.tags || []).map((t) => String(t).toLowerCase());
    const uploaderId = String(quiz.uploader?._id || '');
    const matchingLastTags = qTags.filter((t) => lastQuizTags.includes(t));

    let reason = '';
    if (matchingLastTags.length >= 2) {
      reason = `🎯 Based on your last quiz #${matchingLastTags[0]}`;
    } else if (matchingLastTags.length === 1) {
      reason = `🎯 Similar to last quiz #${matchingLastTags[0]}`;
    } else if (followedCreatorIds.has(uploaderId)) {
      reason = `👤 From creator you follow: @${quiz.uploader?.username || 'creator'}`;
    } else if ((quiz.rawEngagement || 0) >= 6) {
      reason = '🔥 Trending with community';
    } else if ((quiz.ageDays || 999) <= 4) {
      reason = '✨ Freshly added';
    } else {
      reason = qTags[0] ? `🏷️ Explore #${qTags[0]}` : '⭐ Popular Pick';
    }

    quiz.recommendationReason = reason;
  }

  const totalPages = Math.ceil(total / limit) || 1;
  const decorated = await decorateQuizzesForViewer(pagedQuizzes, userId);

  res.json({
    success: true,
    data: {
      quizzes: decorated,
      pagination: {
        total,
        page,
        limit,
        pages: totalPages,
        hasMore: page < totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      meta: {
        mode,
        algorithm: 'qf-instagram-v1',
        hasUserContext: Boolean(userId),
        lastQuizContext: lastQuizTitle || null,
      },
    },
  });
});


export const getBookmarks = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 12, 40);
  const [interactions, total] = await Promise.all([
    QuizInteraction.find({ user: req.user._id, type: 'bookmark' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'quiz',
        match: publicQuizFilter,
        select: QUIZ_FEED_SELECT,
        populate: { path: 'uploader', select: USER_LIST_SELECT },
      })
      .lean(),
    QuizInteraction.countDocuments({ user: req.user._id, type: 'bookmark' }),
  ]);

  const quizzes = interactions.map((item) => item.quiz).filter(Boolean);

  res.json({
    success: true,
    data: {
      quizzes: await decorateQuizzesForViewer(quizzes, req.user._id),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const calculateStreak = (dateList) => {
  if (!dateList || !dateList.length) return 0;

  const uniqueDates = new Set(
    dateList.map((d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    })
  );

  const now = new Date();
  const formatDay = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  const todayStr = formatDay(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDay(yesterday);

  let checkDate = new Date(now);
  let streak = 0;

  if (uniqueDates.has(todayStr)) {
    streak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
  } else if (uniqueDates.has(yesterdayStr)) {
    streak = 1;
    checkDate = yesterday;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    return 0;
  }

  while (uniqueDates.has(formatDay(checkDate))) {
    streak += 1;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
};

const formatRelativeTime = (date) => {
  if (!date) return '';
  const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
};

export const getChallengesOverview = catchAsync(async (req, res) => {
  const viewerId = req.user?._id;
  const challengePublicFilter = { ...publicQuizFilter, isChallenge: true };

  // 1. Featured Challenge: Highest total attempts public challenge
  const featuredQuizDoc = await Quiz.findOne(challengePublicFilter)
    .sort({ totalAttempts: -1, likeCount: -1, createdAt: -1 })
    .populate('uploader', USER_LIST_SELECT)
    .lean();

  let featuredChallenge = null;
  if (featuredQuizDoc) {
    const [decoratedFeatured] = await decorateQuizzesForViewer([featuredQuizDoc], viewerId);
    featuredChallenge = {
      _id: decoratedFeatured._id,
      title: decoratedFeatured.title,
      description: decoratedFeatured.description,
      questionCount: decoratedFeatured.questionCount || 10,
      difficulty: decoratedFeatured.difficulty || 'All Levels',
      duration: `${decoratedFeatured.durationMinutes || decoratedFeatured.settings?.timeLimit || Math.ceil((decoratedFeatured.questionCount || 10) * 1.5)} min`,
      joinedCount: decoratedFeatured.totalAttempts || 0,
      thumbnail: decoratedFeatured.thumbnail || '',
      category: decoratedFeatured.category || 'General',
      isBookmarked: Boolean(decoratedFeatured.social?.bookmarkedByMe),
    };
  }

  // 2. In-Progress Challenge Attempts for viewer
  let activeAttempts = [];
  if (viewerId) {
    const rawAttempts = await Attempt.find({
      userId: viewerId,
      status: 'in_progress',
      completed: false,
    })
      .sort({ updatedAt: -1 })
      .limit(6)
      .populate({
        path: 'quizId',
        match: { isChallenge: true },
        select: 'title questionCount settings difficulty thumbnail isChallenge durationMinutes',
      })
      .lean();

    activeAttempts = rawAttempts
      .filter((att) => att.quizId && att.quizId.isChallenge)
      .map((att) => ({
        _id: att._id,
        quizId: att.quizId._id,
        title: att.quizId.title || 'Untitled Challenge',
        questionsCount: att.quizId.questionCount || att.totalQuestions || 10,
        timeAgoText: `Started ${formatRelativeTime(att.updatedAt || att.createdAt)}`,
        percentage: att.percentage || 0,
      }));
  }

  // 3. User Stats & Progress
  let stats = {
    dayStreak: 0,
    quizzesDone: 0,
    globalRank: '#-',
    accuracy: 0,
    correctAnswers: 0,
  };

  if (viewerId) {
    const releasedQuiz = { isChallenge: true, deadlineAt: { $lte: new Date() } };
    const completedAttempts = await Attempt.find({
      userId: viewerId,
      status: 'completed',
      isPractice: { $ne: true },
    })
      .select('quizId createdAt score percentage correctCount totalQuestions')
      .populate({ path: 'quizId', match: releasedQuiz, select: '_id' })
      .sort({ createdAt: -1 })
      .lean()
      .then(attempts => attempts.filter(attempt => attempt.quizId));

    const quizzesDone = completedAttempts.length;
    const correctAnswers = completedAttempts.reduce((acc, curr) => acc + (curr.correctCount || 0), 0);
    const totalQuestions = completedAttempts.reduce((acc, curr) => acc + (curr.totalQuestions || 0), 0);
    const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : (quizzesDone > 0 ? Math.round(completedAttempts.reduce((acc, c) => acc + (c.percentage || 0), 0) / quizzesDone) : 0);

    const dayStreak = calculateStreak(completedAttempts.map((a) => a.createdAt));

    // Global Rank: based on total score or completed count
    const userTotalScore = completedAttempts.reduce((acc, c) => acc + (c.score || 0), 0);
    const higherRankedUsers = await Attempt.aggregate([
      { $match: { status: 'completed', isPractice: { $ne: true }, userId: { $ne: null } } },
      { $lookup: {
        from: Quiz.collection.name, localField: 'quizId', foreignField: '_id',
        pipeline: [{ $match: releasedQuiz }, { $project: { _id: 1 } }], as: 'releasedQuiz',
      } },
      { $match: { 'releasedQuiz.0': { $exists: true } } },
      { $group: { _id: '$userId', totalScore: { $sum: '$score' }, count: { $sum: 1 } } },
      { $match: { $or: [{ totalScore: { $gt: userTotalScore } }, { totalScore: userTotalScore, count: { $gt: quizzesDone } }] } },
      { $count: 'higher' },
    ]);
    const rankNum = (higherRankedUsers[0]?.higher || 0) + 1;
    const globalRank = quizzesDone ? `#${rankNum}` : '#-';

    stats = {
      dayStreak,
      quizzesDone,
      globalRank,
      accuracy,
      correctAnswers,
    };
  }

  // 4. Trending Challenges: ONLY competitive challenges
  const trendingQuizDocs = await Quiz.find(challengePublicFilter)
    .sort({ totalAttempts: -1, likeCount: -1, createdAt: -1 })
    .limit(16)
    .populate('uploader', USER_LIST_SELECT)
    .lean();

  const decoratedTrending = await decorateQuizzesForViewer(trendingQuizDocs, viewerId);
  const trendingChallenges = decoratedTrending.map((q) => ({
    _id: q._id,
    title: q.title,
    difficulty: q.difficulty || 'All Levels',
    duration: `${q.settings?.timeLimit || Math.ceil((q.questionCount || 10) * 1.5)} min`,
    joinedCount: q.totalAttempts || 0,
    category: q.category || 'General',
    contentKind: q.contentKind || 'quiz',
    isBookmarked: Boolean(q.social?.bookmarkedByMe),
    likeCount: q.social?.likeCount || 0,
    createdAt: q.createdAt,
    questionCount: q.questionCount || 10,
  }));

  // 5. Recent Activity
  const rawActivities = await Activity.find({ visibility: 'public' })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('actor', USER_LIST_SELECT)
    .populate('targetUser', USER_LIST_SELECT)
    .populate({
      path: 'quiz',
      match: publicQuizFilter,
      select: 'title questionCount difficulty category thumbnail totalAttempts isChallenge deadlineAt',
    })
    .lean();

  let followingSet = new Set();
  if (viewerId) {
    const myFollows = await Follow.find({ follower: viewerId }).select('following').lean();
    myFollows.forEach((f) => followingSet.add(String(f.following)));
  }

  const recentActivities = rawActivities
    .filter((act) => act.actor && (act.quiz || act.verb === 'followed' || act.targetUser))
    .filter((act) => act.verb !== 'quiz_attempted' || (act.quiz && !resultsSealed(act.quiz)))
    .map((act) => {
      let actionText = 'interacted on the platform';
      let badge = 'Active';
      let badgeType = 'points';

      if (act.verb === 'quiz_attempted') {
        actionText = `completed "${act.quiz?.title || 'a challenge'}"`;
        const score = act.metadata?.score || act.metadata?.percentage;
        badge = score ? `+${score} pts` : 'Completed';
        badgeType = 'points';
      } else if (act.verb === 'quiz_published') {
        actionText = `created a new quiz: "${act.quiz?.title || 'Untitled'}"`;
        badge = 'New';
        badgeType = 'new';
      } else if (act.verb === 'followed') {
        actionText = `followed @${act.targetUser?.username || 'a creator'}`;
        badge = 'Followed';
        badgeType = 'status';
      } else if (act.verb === 'quiz_liked') {
        actionText = `liked "${act.quiz?.title || 'a quiz'}"`;
        badge = 'Liked';
        badgeType = 'status';
      } else if (act.verb === 'commented') {
        actionText = `commented on "${act.quiz?.title || 'a quiz'}"`;
        badge = 'Comment';
        badgeType = 'status';
      }

      return {
        _id: act._id,
        actor: {
          _id: act.actor._id,
          username: act.actor.username || act.actor.name,
          name: act.actor.name,
          avatar: act.actor.avatar || '',
          isFollowing: followingSet.has(String(act.actor._id)),
        },
        action: actionText,
        timeAgo: formatRelativeTime(act.createdAt),
        badge,
        badgeType,
      };
    });

  // 6. Top Creators: Real users sorted by followersCount and quizCount
  const topUsersDocs = await User.find({
    isDeleted: { $ne: true },
    isProfilePublic: true,
    'preferences.searchDiscovery': { $ne: false },
  })
    .select('name username avatar bio quizCount followersCount followingCount')
    .sort({ followersCount: -1, quizCount: -1, createdAt: -1 })
    .limit(5)
    .lean();

  const decoratedTop = await decorateUsersForViewer(topUsersDocs, viewerId);
  const topCreators = decoratedTop.map((u, index) => ({
    rank: index + 1,
    _id: u._id,
    name: u.username || u.name,
    fullName: u.name,
    avatar: u.avatar || '',
    followersCount: u.followersCount || 0,
    followersText: `${u.followersCount || 0} followers`,
    isFollowing: Boolean(u.isFollowing),
  }));

  // 7. Suggested for You: Real users excluding current user and already followed users
  const excludeUserIds = viewerId ? [viewerId, ...Array.from(followingSet)] : [];
  const suggestedDocs = await User.find({
    _id: { $nin: excludeUserIds },
    isDeleted: { $ne: true },
    isProfilePublic: true,
    'preferences.searchDiscovery': { $ne: false },
  })
    .select('name username avatar bio quizCount followersCount followingCount')
    .sort({ quizCount: -1, followersCount: -1, createdAt: -1 })
    .limit(5)
    .lean();

  const decoratedSuggested = await decorateUsersForViewer(suggestedDocs, viewerId);
  const suggestedCreators = decoratedSuggested.map((u) => ({
    _id: u._id,
    name: u.username || u.name,
    fullName: u.name,
    avatar: u.avatar || '',
    followersCount: u.followersCount || 0,
    followersText: `${u.followersCount || 0} followers`,
    isFollowing: Boolean(u.isFollowing),
  }));

  res.status(200).json({
    success: true,
    data: {
      stats,
      featuredChallenge,
      activeAttempts,
      trendingChallenges,
      recentActivities,
      topCreators,
      suggestedCreators,
    },
  });
});

export const followUser = catchAsync(async (req, res) => {
  const target = await resolveUserByIdentifier(req.params.username);
  if (!target) {
    throw new AppError('User not found', 404);
  }

  if (toIdString(target._id) === toIdString(req.user._id)) {
    throw new AppError('You cannot follow yourself', 400);
  }

  const result = await Follow.updateOne(
    { follower: req.user._id, following: target._id },
    { $setOnInsert: { follower: req.user._id, following: target._id } },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: 1 } }),
      User.findByIdAndUpdate(target._id, { $inc: { followersCount: 1 } }),
      recordActivity({
        actorId: req.user._id,
        verb: 'followed',
        targetUserId: target._id,
        visibility: 'public',
      }),
    ]);
  }

  const refreshed = await User.findById(target._id).select(USER_PUBLIC_SELECT).lean();

  res.json({
    success: true,
    data: {
      profile: {
        ...refreshed,
        isFollowing: true,
      },
    },
  });
});

export const unfollowUser = catchAsync(async (req, res) => {
  const target = await resolveUserByIdentifier(req.params.username);
  if (!target) {
    throw new AppError('User not found', 404);
  }

  if (toIdString(target._id) === toIdString(req.user._id)) {
    throw new AppError('You cannot unfollow yourself', 400);
  }

  const result = await Follow.deleteOne({ follower: req.user._id, following: target._id });
  if (result.deletedCount > 0) {
    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $inc: { followingCount: -1 } }),
      User.findByIdAndUpdate(target._id, { $inc: { followersCount: -1 } }),
    ]);
    await syncNonNegativeUserCounters([req.user._id, target._id]);
  }

  const refreshed = await User.findById(target._id).select(USER_PUBLIC_SELECT).lean();

  res.json({
    success: true,
    data: {
      profile: {
        ...refreshed,
        isFollowing: false,
      },
    },
  });
});

export const listFollowers = catchAsync(async (req, res) => {
  const user = await resolveUserByIdentifier(req.params.username);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const canAccess = await canViewPrivateDetails(user, req.user);
  const { page, limit, skip } = clampPagination(req.query, 20, 60);

  if (!canAccess) {
    return res.json({
      success: true,
      data: {
        users: [],
        isPrivate: true,
        requiresFollow: true,
        pagination: { total: 0, page: 1, limit, pages: 0 },
      },
    });
  }

  const [edges, total] = await Promise.all([
    Follow.find({ following: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('follower', USER_LIST_SELECT)
      .lean(),
    Follow.countDocuments({ following: user._id }),
  ]);

  const users = await decorateUsersForViewer(edges.map((edge) => edge.follower).filter(Boolean), req.user?._id);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const listFollowing = catchAsync(async (req, res) => {
  const user = await resolveUserByIdentifier(req.params.username);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const canAccess = await canViewPrivateDetails(user, req.user);
  const { page, limit, skip } = clampPagination(req.query, 20, 60);

  if (!canAccess) {
    return res.json({
      success: true,
      data: {
        users: [],
        isPrivate: true,
        requiresFollow: true,
        pagination: { total: 0, page: 1, limit, pages: 0 },
      },
    });
  }

  const [edges, total] = await Promise.all([
    Follow.find({ follower: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('following', USER_LIST_SELECT)
      .lean(),
    Follow.countDocuments({ follower: user._id }),
  ]);

  const users = await decorateUsersForViewer(edges.map((edge) => edge.following).filter(Boolean), req.user?._id);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const getUserActivity = catchAsync(async (req, res) => {
  const user = await resolveUserByIdentifier(req.params.username);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const canAccess = await canViewPrivateDetails(user, req.user);
  const { page, limit, skip } = clampPagination(req.query, 20, 100);

  if (!canAccess) {
    return res.json({
      success: true,
      data: {
        activities: [],
        total: 0,
        isPrivate: true,
        requiresFollow: true,
        pagination: { total: 0, page: 1, limit, pages: 0 },
      },
    });
  }

  const isOwner = Boolean(req.user?._id && String(req.user._id) === String(user._id));
  const activityFilter = isOwner
    ? { actor: user._id }
    : { actor: user._id, visibility: { $ne: 'private' } };

  const [rawActivities, activityTotal] = await Promise.all([
    Activity.find(activityFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', USER_LIST_SELECT)
      .populate('targetUser', USER_LIST_SELECT)
      .populate({
        path: 'quiz',
        match: isOwner ? {} : publicQuizFilter,
        select: QUIZ_FEED_SELECT,
        populate: { path: 'uploader', select: USER_LIST_SELECT },
      })
      .lean(),
    Activity.countDocuments(activityFilter),
  ]);

  // Enrich with completed quiz attempts by this user if not already in Activity
  const activities = [...rawActivities];
  const loggedQuizIds = new Set(
    activities
      .filter((a) => a.verb === 'quiz_attempted' && a.quiz?._id)
      .map((a) => String(a.quiz._id))
  );

  try {
    const completedAttempts = await Attempt.find({
      user: user._id,
      status: 'completed',
    })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(limit)
      .populate({
        path: 'quizId',
        match: isOwner ? {} : publicQuizFilter,
        select: QUIZ_FEED_SELECT,
        populate: { path: 'uploader', select: USER_LIST_SELECT },
      })
      .lean();

    for (const attempt of completedAttempts) {
      if (attempt.quizId && !resultsSealed(attempt.quizId) && !loggedQuizIds.has(String(attempt.quizId._id))) {
        activities.push({
          _id: attempt._id,
          actor: {
            _id: user._id,
            name: user.name,
            username: user.username,
            avatar: user.avatar,
          },
          verb: 'quiz_attempted',
          quiz: attempt.quizId,
          targetUser: null,
          comment: null,
          visibility: 'public',
          metadata: {
            attemptId: attempt._id,
            percentage: attempt.percentage,
            score: attempt.score,
            passed: attempt.passed,
          },
          createdAt: attempt.completedAt || attempt.createdAt,
          updatedAt: attempt.updatedAt,
        });
        loggedQuizIds.add(String(attempt.quizId._id));
      }
    }
  } catch (err) {
    console.warn('Attempt enrichment fallback skipped:', err.message);
  }

  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = Math.max(activityTotal, activities.length);
  const formatted = activities
    .filter((act) => act.verb === 'followed' || act.quiz || act.targetUser)
    .filter((act) => act.verb !== 'quiz_attempted' || (act.quiz && !resultsSealed(act.quiz)))
    .map((act) => {
      let actionText = 'interacted on the platform';
      let badge = 'Active';
      let badgeType = 'status';

      if (act.verb === 'quiz_attempted') {
        const title = act.quiz?.title || 'a quiz';
        const pct = act.metadata?.percentage ?? act.metadata?.score;
        actionText = `Completed "${title}"`;
        badge = pct !== undefined ? `${pct}% Score` : 'Completed';
        badgeType = 'score';
      } else if (act.verb === 'quiz_published') {
        actionText = `Published a new quiz: "${act.quiz?.title || 'Untitled'}"`;
        badge = 'Published';
        badgeType = 'published';
      } else if (act.verb === 'quiz_liked') {
        actionText = `Liked "${act.quiz?.title || 'a quiz'}"`;
        badge = 'Liked';
        badgeType = 'social';
      } else if (act.verb === 'quiz_bookmarked') {
        actionText = `Bookmarked "${act.quiz?.title || 'a quiz'}"`;
        badge = 'Saved';
        badgeType = 'social';
      } else if (act.verb === 'quiz_shared') {
        actionText = `Shared "${act.quiz?.title || 'a quiz'}"`;
        badge = 'Shared';
        badgeType = 'social';
      } else if (act.verb === 'followed') {
        actionText = `Followed @${act.targetUser?.username || 'a creator'}`;
        badge = 'Followed';
        badgeType = 'social';
      } else if (act.verb === 'commented') {
        actionText = `Commented on "${act.quiz?.title || 'a quiz'}"`;
        badge = 'Comment';
        badgeType = 'status';
      }

      const diff = Math.max(0, Date.now() - new Date(act.createdAt).getTime());
      const minutes = Math.floor(diff / 60000);
      let timeAgo = 'Just now';
      if (minutes >= 60 * 24 * 30) {
        timeAgo = new Date(act.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } else if (minutes >= 60 * 24) {
        const d = Math.floor(minutes / (60 * 24));
        timeAgo = `${d}d ago`;
      } else if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        timeAgo = `${h}h ago`;
      } else if (minutes >= 1) {
        timeAgo = `${minutes}m ago`;
      }

      return {
        ...act,
        ...(resultsSealed(act.quiz) ? { quiz: { ...act.quiz, avgScore: 0 } } : {}),
        action: actionText,
        actionText,
        badge,
        badgeType,
        timeAgo,
      };
    });

  res.json({
    success: true,
    data: {
      activities: formatted,
      total,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

const setInteraction = async ({ req, res, type, active }) => {
  const quiz = await getPublicQuiz(req.params.quizId, req.user);
  const filter = { user: req.user._id, quiz: quiz._id, type };
  const countField = type === 'like' ? 'likeCount' : 'bookmarkCount';

  if (active) {
    const result = await QuizInteraction.updateOne(
      filter,
      { $setOnInsert: filter },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      await Quiz.findByIdAndUpdate(quiz._id, {
        $inc: { [countField]: 1 },
        $set: { lastSocialActivityAt: new Date() },
      });

      if (type === 'like') {
        await recordActivity({
          actorId: req.user._id,
          verb: 'quiz_liked',
          quizId: quiz._id,
          notifyRecipientId: quiz.uploader?._id,
          visibility: 'public',
        });
      }
    }
  } else {
    const result = await QuizInteraction.deleteOne(filter);
    if (result.deletedCount > 0) {
      await Quiz.findByIdAndUpdate(quiz._id, { $inc: { [countField]: -1 } });
      await syncNonNegativeQuizCounters(quiz._id);
    }
  }

  const updatedQuiz = await Quiz.findById(quiz._id)
    .select(QUIZ_FEED_SELECT)
    .populate('uploader', USER_LIST_SELECT)
    .lean();
  const [decorated] = await decorateQuizzesForViewer([updatedQuiz], req.user._id);

  res.json({
    success: true,
    data: { quiz: decorated },
  });
};

export const likeQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'like', active: true }));
export const unlikeQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'like', active: false }));
export const bookmarkQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'bookmark', active: true }));
export const unbookmarkQuiz = catchAsync(async (req, res) => setInteraction({ req, res, type: 'bookmark', active: false }));

export const shareQuiz = catchAsync(async (req, res) => {
  const quiz = await getPublicQuiz(req.params.quizId, req.user);
  await QuizShare.create({
    quiz: quiz._id,
    user: req.user._id,
    channel: String(req.body.channel || 'copy_link').slice(0, 40),
    clientSessionId: String(req.get('x-client-session-id') || '').slice(0, 120),
  });

  await Quiz.findByIdAndUpdate(quiz._id, {
    $inc: { shareCount: 1 },
    $set: { lastSocialActivityAt: new Date() },
  });

  await recordActivity({
    actorId: req.user._id,
    verb: 'quiz_shared',
    quizId: quiz._id,
    visibility: 'public',
  });

  const updatedQuiz = await Quiz.findById(quiz._id)
    .select(QUIZ_FEED_SELECT)
    .populate('uploader', USER_LIST_SELECT)
    .lean();
  const [decorated] = await decorateQuizzesForViewer([updatedQuiz], req.user._id);

  res.status(201).json({
    success: true,
    data: { quiz: decorated },
  });
});

export const getShareContacts = catchAsync(async (req, res) => {
  const currentUserId = req.user._id;
  const search = String(req.query.search || '').trim();

  // Find users the current user follows
  const followingDocs = await Follow.find({ follower: currentUserId }).select('following createdAt').lean();
  const followingIds = followingDocs.map((f) => String(f.following));

  // Find users who follow the current user
  const followerDocs = await Follow.find({ following: currentUserId }).select('follower createdAt').lean();
  const followerIds = followerDocs.map((f) => String(f.follower));

  // Unique contact user IDs (followers and following)
  const allContactIdSet = new Set([...followingIds, ...followerIds]);
  const allContactIds = Array.from(allContactIdSet);

  if (allContactIds.length === 0) {
    const communityUsers = await User.find({ _id: { $ne: currentUserId } })
      .select('name username avatar bio followersCount followingCount')
      .limit(10)
      .lean();

    return res.json({
      success: true,
      data: {
        frequentlyConnected: communityUsers.slice(0, 4),
        contacts: communityUsers,
      },
    });
  }

  // Filter if search query exists
  const userQuery = {
    _id: { $in: allContactIds },
  };

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    userQuery.$or = [
      { name: searchRegex },
      { username: searchRegex },
    ];
  }

  const users = await User.find(userQuery)
    .select('name username avatar bio followersCount followingCount')
    .lean();

  const followingSet = new Set(followingIds);
  const followerSet = new Set(followerIds);

  const enrichedUsers = users.map((u) => {
    const uid = String(u._id);
    const isMutual = followingSet.has(uid) && followerSet.has(uid);
    const followsYou = followerSet.has(uid);
    const youFollow = followingSet.has(uid);
    return {
      ...u,
      isMutual,
      followsYou,
      youFollow,
    };
  });

  // Frequently connected: Mutual connections first, then recent
  const frequentlyConnected = [...enrichedUsers]
    .sort((a, b) => (b.isMutual ? 1 : 0) - (a.isMutual ? 1 : 0))
    .slice(0, 8);

  // All contacts
  const contacts = [...enrichedUsers].sort((a, b) => {
    if (a.isMutual && !b.isMutual) return -1;
    if (!a.isMutual && b.isMutual) return 1;
    return (a.name || a.username || '').localeCompare(b.name || b.username || '');
  });

  res.json({
    success: true,
    data: {
      frequentlyConnected,
      contacts,
    },
  });
});

// Compatibility endpoint: the message service owns all direct-message writes.
export const shareQuizDirect = catchAsync(async (req, res) => {
  const { recipientId, recipientUsername, message, clientMessageId } = req.body;
  if (!recipientId && !recipientUsername) throw new AppError('Recipient is required', 400);
  if (!mongoose.isValidObjectId(req.params.quizId)) throw new AppError('Invalid quiz id', 400);
  const headers = { 'content-type': 'application/json' };
  for (const key of ['cookie', 'authorization', 'x-csrf-token', 'x-request-id']) {
    if (req.headers[key]) headers[key] = req.headers[key];
  }
  let upstream;
  try {
    upstream = await fetch((process.env.MESSAGE_SERVICE_URL || 'http://127.0.0.1:5006') + '/api/v1/messages/start', {
      method: 'POST', headers, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ recipientId, recipientUsername, initialMessage: message,
        quizId: req.params.quizId, clientMessageId }),
    });
  } catch { throw new AppError('Messaging is temporarily unavailable', 503); }
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new AppError(payload.message || 'Could not share this quiz', upstream.status);
  res.status(201).json({ success: true, message: 'Quiz shared', data: {
    conversationId: payload.data?.conversation?._id, messageId: payload.data?.message?._id,
  } });
});

export const listComments = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.quizId)) {
    return res.json({
      success: true,
      data: {
        comments: [],
        totalComments: 0,
        pagination: { total: 0, page: 1, limit: 20, pages: 0 },
      },
    });
  }

  const quiz = await Quiz.findById(req.params.quizId).lean();
  if (!quiz) {
    return res.json({
      success: true,
      data: {
        comments: [],
        totalComments: 0,
        pagination: { total: 0, page: 1, limit: 20, pages: 0 },
      },
    });
  }

  const isPub = isPublicQuiz(quiz);
  const isOwner = req.user && toIdString(quiz.uploader?._id || quiz.uploader) === toIdString(req.user._id);
  const isAdmin = req.user && req.user.role === 'admin';

  if (!isPub && !isOwner && !isAdmin) {
    return res.json({
      success: true,
      data: {
        comments: [],
        totalComments: 0,
        pagination: { total: 0, page: 1, limit: 20, pages: 0 },
      },
    });
  }

  const { page, limit, skip } = clampPagination(req.query, 20, 100);

  const [topLevelComments, totalTopLevel, totalAll] = await Promise.all([
    QuizComment.find({
      quiz: req.params.quizId,
      status: { $in: ['active', 'deleted'] },
      $or: [{ parentComment: null }, { parentComment: { $exists: false } }],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', USER_LIST_SELECT)
      .lean(),
    QuizComment.countDocuments({
      quiz: req.params.quizId,
      $or: [{ parentComment: null }, { parentComment: { $exists: false } }],
    }),
    QuizComment.countDocuments({ quiz: req.params.quizId }),
  ]);

  let parentIds = topLevelComments.map((comment) => comment._id);
  const replies = [];
  for (let depth = 1; depth <= MAX_COMMENT_DEPTH && parentIds.length; depth += 1) {
    const children = await QuizComment.find({
      quiz: req.params.quizId,
      parentComment: { $in: parentIds },
    })
      .sort({ createdAt: 1 })
      .populate('author', USER_LIST_SELECT)
      .populate('replyToUser', 'name username')
      .lean();
    replies.push(...children);
    parentIds = children.map((comment) => comment._id);
  }

  const viewerId = req.user?._id;

  const decorateComment = (c) => ({
    ...c,
    likeCount: c.likeCount ?? c.likes?.length ?? 0,
    isLiked: viewerId ? Boolean(c.likes?.some((id) => toIdString(id) === toIdString(viewerId))) : false,
    isOwner: viewerId ? toIdString(c.author?._id || c.author) === toIdString(viewerId) : false,
  });

  const paginatedTop = buildCommentTree(
    topLevelComments.map(decorateComment),
    replies.map(decorateComment)
  );

  const totalPages = Math.ceil(totalTopLevel / limit) || 1;

  res.json({
    success: true,
    data: {
      comments: paginatedTop,
      totalComments: totalAll,
      pagination: {
        total: totalTopLevel,
        page,
        limit,
        pages: totalPages,
        hasMore: page < totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
  });
});

export const createComment = catchAsync(async (req, res) => {
  const quiz = await getPublicQuiz(req.params.quizId, req.user);
  const body = String(req.body.body || req.body.content || '').trim();

  if (body.length < 1) {
    throw new AppError('Comment cannot be empty', 400);
  }

  if (body.length > 1000) {
    throw new AppError('Comment must be at most 1000 characters', 400);
  }

  let parentCommentId = null;
  let replyToUserId = null;

  if (req.body.parentComment) {
    const parent = await QuizComment.findOne({
      _id: req.body.parentComment,
      quiz: quiz._id,
    });
    if (!parent) {
      throw new AppError('Parent comment not found', 404);
    }

    let parentDepth = 0;
    let ancestor = parent;
    const visited = new Set([toIdString(parent._id)]);
    while (ancestor.parentComment) {
      const ancestorId = toIdString(ancestor.parentComment);
      if (visited.has(ancestorId)) {
        throw new AppError('Invalid comment thread', 400);
      }
      visited.add(ancestorId);
      ancestor = await QuizComment.findOne({ _id: ancestorId, quiz: quiz._id });
      if (!ancestor) {
        throw new AppError('Invalid comment thread', 400);
      }
      parentDepth += 1;
    }
    if (parentDepth >= MAX_COMMENT_DEPTH) {
      throw new AppError(`Replies can be nested up to ${MAX_COMMENT_DEPTH} levels`, 400);
    }

    parentCommentId = parent._id;
    replyToUserId = parent.status === 'active' ? parent.author : null;
    await QuizComment.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } });
  }

  const comment = await QuizComment.create({
    quiz: quiz._id,
    author: req.user._id,
    body,
    parentComment: parentCommentId,
    replyToUser: replyToUserId,
    likes: [],
    likeCount: 0,
    replyCount: 0,
  });

  await Quiz.findByIdAndUpdate(quiz._id, {
    $inc: { commentCount: 1 },
    $set: { lastSocialActivityAt: new Date() },
  });

  const recipientId = replyToUserId || quiz.uploader?._id;
  await recordActivity({
    actorId: req.user._id,
    verb: 'commented',
    quizId: quiz._id,
    commentId: comment._id,
    notifyRecipientId: recipientId,
    visibility: 'public',
  });

  const populated = await QuizComment.findById(comment._id)
    .populate('author', USER_LIST_SELECT)
    .populate('replyToUser', 'name username')
    .lean();

  res.status(201).json({
    success: true,
    data: {
      comment: {
        ...populated,
        likeCount: 0,
        isLiked: false,
        isOwner: true,
        replies: [],
      },
    },
  });
});

export const likeComment = catchAsync(async (req, res) => {
  const comment = await QuizComment.findById(req.params.commentId);
  if (!comment || comment.status !== 'active') {
    throw new AppError('Comment not found', 404);
  }
  await getPublicQuiz(String(comment.quiz), req.user);

  const userId = req.user._id;
  const alreadyLiked = comment.likes?.some((id) => toIdString(id) === toIdString(userId));

  if (!alreadyLiked) {
    if (!comment.likes) comment.likes = [];
    comment.likes.push(userId);
    comment.likeCount = comment.likes.length;
    await comment.save();
  }

  res.json({
    success: true,
    data: {
      commentId: comment._id,
      isLiked: true,
      likeCount: comment.likeCount,
    },
  });
});

export const unlikeComment = catchAsync(async (req, res) => {
  const comment = await QuizComment.findById(req.params.commentId);
  if (!comment || comment.status !== 'active') {
    throw new AppError('Comment not found', 404);
  }
  await getPublicQuiz(String(comment.quiz), req.user);

  const userId = req.user._id;
  comment.likes = (comment.likes || []).filter((id) => toIdString(id) !== toIdString(userId));
  comment.likeCount = comment.likes.length;
  await comment.save();

  res.json({
    success: true,
    data: {
      commentId: comment._id,
      isLiked: false,
      likeCount: comment.likeCount,
    },
  });
});

export const updateComment = catchAsync(async (req, res) => {
  const comment = await QuizComment.findById(req.params.commentId);
  if (!comment || comment.status !== 'active') {
    throw new AppError('Comment not found', 404);
  }

  const isOwner = toIdString(comment.author) === toIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new AppError('Not authorized to edit this comment', 403);
  }

  const body = String(req.body.body || req.body.content || '').trim();
  if (!body || body.length > 1000) {
    throw new AppError('Comment must be between 1 and 1000 characters', 400);
  }

  comment.body = body;
  comment.editedAt = new Date();
  await comment.save();

  const populated = await QuizComment.findById(comment._id)
    .populate('author', USER_LIST_SELECT)
    .populate('replyToUser', 'name username')
    .lean();

  res.json({
    success: true,
    data: { comment: populated },
  });
});

export const deleteComment = catchAsync(async (req, res) => {
  const comment = await QuizComment.findById(req.params.commentId).populate('quiz', 'uploader');
  if (!comment || comment.status !== 'active') {
    throw new AppError('Comment not found', 404);
  }

  const isOwner = toIdString(comment.author) === toIdString(req.user._id);
  const isQuizOwner = toIdString(comment.quiz?.uploader) === toIdString(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isQuizOwner && !isAdmin) {
    throw new AppError('Not authorized to delete this comment', 403);
  }

  comment.status = 'deleted';
  comment.body = 'Comment is deleted';
  comment.likes = [];
  comment.likeCount = 0;
  await comment.save();

  await Promise.all([
    Activity.deleteMany({ comment: comment._id }),
    Notification.deleteMany({ comment: comment._id }),
  ]);

  res.json({
    success: true,
    data: {
      comment: {
        _id: comment._id,
        status: comment.status,
        body: comment.body,
      },
    },
  });
});

export const getNotifications = catchAsync(async (req, res) => {
  const { page, limit, skip } = clampPagination(req.query, 20, 60);
  
  const filter = {
    recipient: req.user._id,
    verb: { $in: notificationVerbs(req.user.preferences?.notifications) },
  };

  const [notifications, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', USER_LIST_SELECT)
      .populate('quiz', 'title uploader visibility isPublic accessType isRestricted metadata.savedAsDraft isChallenge challengeStatus')
      .populate('comment', 'body status')
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);

  res.json({
    success: true,
    data: {
      notifications: notifications.map(({ quiz, comment, metadata, ...notification }) => {
        const canReadQuiz = quiz && (String(quiz.uploader) === String(req.user._id) || isPublicQuiz(quiz));
        const canReadComment = canReadQuiz && comment?.status === 'active';
        return {
          ...notification,
          quiz: canReadQuiz ? { _id: quiz._id, title: quiz.title } : null,
          comment: canReadComment ? { _id: comment._id, body: comment.body } : null,
          metadata: canReadQuiz && (notification.verb === 'quiz_liked' || canReadComment) ? metadata : {},
        };
      }),
      unread,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const getUnreadNotificationCount = catchAsync(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    verb: { $in: notificationVerbs(req.user.preferences?.notifications) },
    readAt: null,
  });

  res.json({
    success: true,
    data: { unreadCount },
  });
});

export const markNotificationRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { readAt: new Date() },
    { new: true, projection: { _id: 1, readAt: 1 } }
  );

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  res.json({
    success: true,
    data: { notification },
  });
});

export const markAllNotificationsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { readAt: new Date() }
  );

  res.json({
    success: true,
    data: null,
  });
});
