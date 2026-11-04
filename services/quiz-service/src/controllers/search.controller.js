import Quiz from '../models/Quiz.model.js';
import User from '../models/User.model.js';
import { catchAsync } from '../middleware/error.middleware.js';
import memoryCache from '../services/cache/cache.service.js';
import env from '../config/env.js';

/**
 * Normalizes an array or comma-separated string of tags.
 * Strips leading '#' characters, trims whitespace, converts to lowercase,
 * enforces length limits, and deduplicates.
 */
export const normalizeTags = (rawTags) => {
  if (!rawTags) return [];
  const list = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags).split(/[,\s]+/);

  const seen = new Set();
  const normalized = [];

  for (const item of list) {
    const clean = String(item || '')
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/[^a-z0-9_-]/g, '');

    if (clean.length > 0 && clean.length <= 35 && !seen.has(clean)) {
      seen.add(clean);
      normalized.push(clean);
      if (normalized.length >= 12) break;
    }
  }

  return normalized;
};

/**
 * Escapes regex special characters to prevent ReDoS / injection.
 */
const escapeRegex = (string) => {
  return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * GET /api/v1/search/universal
 * Unified search across Quizzes, Accounts (Creators), and Hashtags.
 * Supports symbol-driven fast-path searching:
 * - '!' or 'QZ-': Fast-path quizCode B-tree lookup (skips user/tag aggregation)
 * - '@': Fast-path username B-tree lookup (skips quiz/tag aggregation)
 * - '#': Fast-path hashtag aggregation & tagged quiz lookup (skips user search)
 * Accessible to both authenticated users and guests.
 */
export const universalSearch = catchAsync(async (req, res) => {
  const rawQuery = String(req.query.q || req.query.query || '').trim();
  const type = String(req.query.type || 'all').toLowerCase();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 30);

  if (!rawQuery) {
    return res.json({
      success: true,
      data: {
        query: '',
        type,
        quizzes: [],
        creators: [],
        tags: [],
        directMatch: null,
      },
    });
  }

  const isQuizCodeSearch = rawQuery.startsWith('!') || /^QZ-[A-Z0-9]/i.test(rawQuery);
  const isUserSearch = rawQuery.startsWith('@');
  const isHashtagSearch = rawQuery.startsWith('#');

  // Strip prefix symbol for general matching
  let cleanTerm = rawQuery;
  if (isQuizCodeSearch) {
    cleanTerm = rawQuery.replace(/^!+/, '').trim();
  } else if (isUserSearch) {
    cleanTerm = rawQuery.replace(/^@+/, '').trim();
  } else if (isHashtagSearch) {
    cleanTerm = rawQuery.replace(/^#+/, '').trim();
  }

  const escaped = escapeRegex(cleanTerm);
  const regex = new RegExp(escaped, 'i');

  const canonicalPublicQuizFilter = {
    visibility: 'public',
    'metadata.savedAsDraft': { $ne: true },
    isRestricted: { $ne: true },
  };

  const results = {
    query: rawQuery,
    type,
    quizzes: [],
    creators: [],
    tags: [],
    directMatch: null,
  };

  const promises = [];

  // 1. Search Quizzes (Fast-path if '!' or QZ-, or if 'all'/'quizzes' and not '@' user search)
  const shouldSearchQuizzes =
    (type === 'all' && !isUserSearch) ||
    type === 'quizzes' ||
    isQuizCodeSearch;

  if (shouldSearchQuizzes) {
    let quizFilter;

    if (isQuizCodeSearch) {
      // High-performance prefix or exact match on indexed quizCode
      const normalizedCode = cleanTerm.toUpperCase();
      const codeRegex = new RegExp(`^!?${escapeRegex(normalizedCode)}`, 'i');

      quizFilter = {
        ...canonicalPublicQuizFilter,
        $or: [
          { quizCode: codeRegex },
          { title: regex },
        ],
      };
    } else if (isHashtagSearch) {
      quizFilter = {
        ...canonicalPublicQuizFilter,
        $or: [
          { tags: regex },
          { title: regex },
        ],
      };
    } else {
      quizFilter = {
        ...canonicalPublicQuizFilter,
        $or: [
          { quizCode: regex },
          { title: regex },
          { tags: regex },
          { category: regex },
          { description: regex },
        ],
      };
    }

    promises.push(
      Quiz.find(quizFilter)
        .sort({ likeCount: -1, totalAttempts: -1, createdAt: -1 })
        .limit(limit)
        .populate('uploader', 'name username avatar bio followersCount quizCount')
        .lean()
        .then((quizzes) => {
          results.quizzes = quizzes || [];

          // Identify direct quiz match if quizCode is an exact match
          if (isQuizCodeSearch && results.quizzes.length > 0) {
            const normalizedTarget = (cleanTerm.startsWith('QZ-') ? `!${cleanTerm}` : cleanTerm).toUpperCase();
            const exactQuiz = results.quizzes.find(
              (q) => q.quizCode?.toUpperCase() === normalizedTarget || q.quizCode?.toUpperCase() === cleanTerm.toUpperCase()
            );
            if (exactQuiz) {
              results.directMatch = {
                type: 'quiz',
                quiz: exactQuiz,
              };
            }
          }
        })
    );
  }

  // 2. Search Creators / Accounts (Fast-path if '@', or 'all'/'creators' and not '!'/'#')
  const shouldSearchCreators =
    (type === 'all' && !isQuizCodeSearch && !isHashtagSearch) ||
    type === 'creators' ||
    type === 'accounts' ||
    isUserSearch;

  if (shouldSearchCreators) {
    const userFilter = {
      isDeleted: { $ne: true },
      isProfilePublic: { $ne: false },
      $or: isUserSearch
        ? [
            { username: new RegExp(`^${escaped}`, 'i') },
            { userCode: new RegExp(`^${escaped}`, 'i') },
            { name: regex },
          ]
        : [
            { username: regex },
            { name: regex },
            { bio: regex },
          ],
    };

    promises.push(
      User.find(userFilter)
        .select('_id name username avatar bio followersCount quizCount userCode')
        .sort({ followersCount: -1, quizCount: -1, createdAt: -1 })
        .limit(limit)
        .lean()
        .then((creators) => {
          results.creators = creators || [];

          // Identify direct creator match if exact username
          if (isUserSearch && results.creators.length > 0) {
            const exactUser = results.creators.find(
              (u) => u.username?.toLowerCase() === cleanTerm.toLowerCase()
            );
            if (exactUser) {
              results.directMatch = {
                type: 'creator',
                creator: exactUser,
              };
            }
          }
        })
    );
  }

  // 3. Search Hashtags (Tags Aggregation with Quiz Counts) - Skip if '!' quiz search or '@' user search
  const shouldSearchTags =
    ((type === 'all' && !isQuizCodeSearch && !isUserSearch) ||
    type === 'tags' ||
    isHashtagSearch);

  if (shouldSearchTags) {
    promises.push(
      Quiz.aggregate([
        {
          $match: {
            ...canonicalPublicQuizFilter,
            tags: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$tags' },
        {
          $match: {
            tags: regex,
          },
        },
        {
          $group: {
            _id: { $toLower: '$tags' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]).then((tagDocs) => {
        results.tags = (tagDocs || []).map((doc) => ({
          tag: doc._id,
          count: doc.count,
        }));
      })
    );
  }

  await Promise.all(promises);

  res.json({
    success: true,
    data: results,
  });
});

/**
 * GET /api/v1/search/trending-tags
 * Retrieves most popular hashtags across public quizzes.
 * Results are cached in memory for 60 seconds.
 */
export const getTrendingTags = catchAsync(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 30);
  const cacheKey = `search:trending-tags:${limit}`;

  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
    });
  }

  const tags = await Quiz.aggregate([
    {
      $match: {
        visibility: 'public',
        'metadata.savedAsDraft': { $ne: true },
        tags: { $exists: true, $ne: [] },
      },
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: { $toLower: '$tags' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const payload = {
    tags: tags.map((t) => ({
      tag: t._id,
      count: t.count,
    })),
  };

  memoryCache.set(cacheKey, payload, env.CACHE_SEARCH_TTL_MS);

  res.json({
    success: true,
    data: payload,
  });
});

/**
 * GET /api/v1/search/tags/:tag
 * Returns public quizzes matching a specific hashtag with pagination.
 */
export const getQuizzesByTag = catchAsync(async (req, res) => {
  const rawTag = String(req.params.tag || '').trim().toLowerCase().replace(/^#+/, '');
  if (!rawTag) {
    return res.status(400).json({
      success: false,
      message: 'A valid tag is required',
    });
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const skip = (page - 1) * limit;

  const escapedTag = escapeRegex(rawTag);
  const tagRegex = new RegExp(`^${escapedTag}$`, 'i');

  const filter = {
    visibility: 'public',
    'metadata.savedAsDraft': { $ne: true },
    tags: tagRegex,
  };

  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .sort({ likeCount: -1, totalAttempts: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploader', 'name username avatar bio followersCount quizCount')
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    success: true,
    data: {
      tag: rawTag,
      quizzes: quizzes || [],
      pagination: {
        total,
        page,
        limit,
        pages: totalPages,
        hasMore: page < totalPages,
      },
    },
  });
});
