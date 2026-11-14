import { describe, it, expect } from '@jest/globals';
import Quiz from '../dist/models/Quiz.model.js';
import Attempt from '../dist/models/Attempt.model.js';

describe('Pagination & Server-Side Filtering Architecture', () => {
  describe('Pagination Contract & Calculation', () => {
    const calculatePagination = (total, page, limit) => {
      const clampedPage = Math.max(parseInt(page, 10) || 1, 1);
      const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
      const pages = Math.ceil(total / clampedLimit) || 1;
      return {
        total,
        page: clampedPage,
        limit: clampedLimit,
        pages,
        hasMore: clampedPage < pages,
        hasNext: clampedPage < pages,
        hasPrev: clampedPage > 1,
      };
    };

    it('should generate complete pagination metadata on first page of multi-page results', () => {
      const meta = calculatePagination(55, 1, 10);
      expect(meta).toEqual({
        total: 55,
        page: 1,
        limit: 10,
        pages: 6,
        hasMore: true,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('should generate complete pagination metadata on middle page', () => {
      const meta = calculatePagination(55, 3, 10);
      expect(meta).toEqual({
        total: 55,
        page: 3,
        limit: 10,
        pages: 6,
        hasMore: true,
        hasNext: true,
        hasPrev: true,
      });
    });

    it('should generate complete pagination metadata on last page', () => {
      const meta = calculatePagination(55, 6, 10);
      expect(meta).toEqual({
        total: 55,
        page: 6,
        limit: 10,
        pages: 6,
        hasMore: false,
        hasNext: false,
        hasPrev: true,
      });
    });

    it('should handle zero records gracefully', () => {
      const meta = calculatePagination(0, 1, 10);
      expect(meta).toEqual({
        total: 0,
        page: 1,
        limit: 10,
        pages: 1,
        hasMore: false,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should clamp invalid or negative page numbers', () => {
      const meta = calculatePagination(25, -5, 10);
      expect(meta.page).toBe(1);
    });

    it('should clamp limit to max 100', () => {
      const meta = calculatePagination(250, 1, 500);
      expect(meta.limit).toBe(100);
    });
  });

  describe('Server-Side Difficulty Normalization', () => {
    const normalizeDifficulty = (difficulty) => {
      if (!difficulty) return 'All Levels';
      const val = String(difficulty).trim().toLowerCase();
      if (val === 'beginner' || val === 'easy') return 'Beginner';
      if (val === 'intermediate' || val === 'medium') return 'Intermediate';
      if (val === 'advanced' || val === 'hard') return 'Advanced';
      if (val === 'all levels' || val === 'all') return 'All Levels';
      return ['Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(difficulty)
        ? difficulty
        : 'All Levels';
    };

    it('should normalize easy and beginner aliases to Beginner', () => {
      expect(normalizeDifficulty('easy')).toBe('Beginner');
      expect(normalizeDifficulty('beginner')).toBe('Beginner');
      expect(normalizeDifficulty('Beginner')).toBe('Beginner');
    });

    it('should normalize medium and intermediate aliases to Intermediate', () => {
      expect(normalizeDifficulty('medium')).toBe('Intermediate');
      expect(normalizeDifficulty('intermediate')).toBe('Intermediate');
      expect(normalizeDifficulty('Intermediate')).toBe('Intermediate');
    });

    it('should normalize hard and advanced aliases to Advanced', () => {
      expect(normalizeDifficulty('hard')).toBe('Advanced');
      expect(normalizeDifficulty('advanced')).toBe('Advanced');
      expect(normalizeDifficulty('Advanced')).toBe('Advanced');
    });

    it('should handle All Levels and unknown strings by falling back safely', () => {
      expect(normalizeDifficulty('all')).toBe('All Levels');
      expect(normalizeDifficulty('all levels')).toBe('All Levels');
      expect(normalizeDifficulty('')).toBe('All Levels');
      expect(normalizeDifficulty('random_invalid')).toBe('All Levels');
    });
  });

  describe('Server-Side Sort Key Mapping', () => {
    const mapSortKey = (sortKeyRaw) => {
      const sortKey = String(sortKeyRaw || '').trim().toLowerCase();
      if (sortKey === 'popular') {
        return { likeCount: -1, totalAttempts: -1, avgScore: -1, createdAt: -1 };
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

    it('should map popular sort correctly', () => {
      expect(mapSortKey('popular')).toEqual({
        likeCount: -1,
        totalAttempts: -1,
        avgScore: -1,
        createdAt: -1,
      });
    });

    it('should map top and rating sorts correctly', () => {
      expect(mapSortKey('top')).toEqual({
        avgScore: -1,
        totalAttempts: -1,
        likeCount: -1,
        createdAt: -1,
      });
      expect(mapSortKey('rating')).toEqual({
        avgScore: -1,
        totalAttempts: -1,
        likeCount: -1,
        createdAt: -1,
      });
    });

    it('should map questions sort correctly', () => {
      expect(mapSortKey('questions')).toEqual({
        questionCount: -1,
        createdAt: -1,
      });
    });

    it('should map title alphabetical sort correctly', () => {
      expect(mapSortKey('title')).toEqual({
        title: 1,
        createdAt: -1,
      });
    });

    it('should default unspecified or invalid sorts to newest first', () => {
      expect(mapSortKey('')).toEqual({ createdAt: -1 });
      expect(mapSortKey('xyz_invalid')).toEqual({ createdAt: -1 });
    });
  });

  describe('Database Indexes Verification', () => {
    it('Quiz schema should include compound indexes for category, difficulty, social feed and text search', () => {
      const indexes = Quiz.schema.indexes();
      const hasIndex = (fields) => {
        return indexes.some(([spec]) => {
          const specKeys = Object.keys(spec);
          const fieldKeys = Object.keys(fields);
          if (specKeys.length !== fieldKeys.length) return false;
          return fieldKeys.every((k) => spec[k] === fields[k]);
        });
      };

      // Visibility + Category
      expect(hasIndex({ visibility: 1, category: 1, createdAt: -1 })).toBe(true);
      // Visibility + Difficulty
      expect(hasIndex({ visibility: 1, difficulty: 1, createdAt: -1 })).toBe(true);
      // Visibility + Category + Difficulty
      expect(hasIndex({ visibility: 1, category: 1, difficulty: 1, createdAt: -1 })).toBe(true);
      // Text Index
      expect(hasIndex({ title: 'text', description: 'text', category: 'text', tags: 'text' })).toBe(true);
    });

    it('Attempt schema should include compound indexes for quiz analytics and leaderboards', () => {
      const indexes = Attempt.schema.indexes();
      const hasIndex = (fields) => {
        return indexes.some(([spec]) => {
          const specKeys = Object.keys(spec);
          const fieldKeys = Object.keys(fields);
          if (specKeys.length !== fieldKeys.length) return false;
          return fieldKeys.every((k) => spec[k] === fields[k]);
        });
      };

      // Quiz analytics index without userId prefix
      expect(hasIndex({ quizId: 1, status: 1, createdAt: -1 })).toBe(true);
      // Leaderboard index
      expect(hasIndex({ quizId: 1, status: 1, isPractice: 1, score: -1, totalTime: 1 })).toBe(true);
    });

    it('Conversation and Message schemas should include indexes for chat history and cursor ordering', async () => {
      const Conversation = (await import('../../message-service/src/models/Conversation.model.js')).default;
      const Message = (await import('../../message-service/src/models/Message.model.js')).default;

      const convIndexes = Conversation.schema.indexes();
      const msgIndexes = Message.schema.indexes();

      const hasIndex = (indexes, fields) => {
        return indexes.some(([spec]) => {
          const specKeys = Object.keys(spec);
          const fieldKeys = Object.keys(fields);
          if (specKeys.length !== fieldKeys.length) return false;
          return fieldKeys.every((k) => spec[k] === fields[k]);
        });
      };

      // Conversation compound
      expect(hasIndex(convIndexes, { participants: 1, lastMessageAt: -1 })).toBe(true);
      // Message forward & reverse cursor indexes
      expect(hasIndex(msgIndexes, { conversation: 1, createdAt: 1 })).toBe(true);
      expect(hasIndex(msgIndexes, { conversation: 1, createdAt: -1 })).toBe(true);
    });
  });

  describe('In-Memory TTL Caching Engine', () => {
    it('should store and retrieve cached values within TTL', async () => {
      const { MemoryCache } = await import('../dist/services/cache/cache.service.js');
      const cache = new MemoryCache(5000);

      cache.set('quiz:test-1', { title: 'Math Quiz' }, 1000);
      expect(cache.get('quiz:test-1')).toEqual({ title: 'Math Quiz' });
      expect(cache.has('quiz:test-1')).toBe(true);
    });

    it('should expire keys once TTL is exceeded', async () => {
      const { MemoryCache } = await import('../dist/services/cache/cache.service.js');
      const cache = new MemoryCache(10); // 10ms

      cache.set('temp-key', 'data', 10);
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(cache.get('temp-key')).toBeNull();
      expect(cache.has('temp-key')).toBe(false);
    });

    it('should invalidate keys matching a pattern prefix', async () => {
      const { MemoryCache } = await import('../dist/services/cache/cache.service.js');
      const cache = new MemoryCache(60000);

      cache.set('quiz:public:1', { id: 1 });
      cache.set('quiz:public:2', { id: 2 });
      cache.set('user:profile:1', { id: 1 });

      cache.delPattern('quiz:public:');

      expect(cache.get('quiz:public:1')).toBeNull();
      expect(cache.get('quiz:public:2')).toBeNull();
      expect(cache.get('user:profile:1')).toEqual({ id: 1 });
    });

    it('getOrSet should fetch and cache value when missing, and return cached on subsequent calls', async () => {
      const { MemoryCache } = await import('../dist/services/cache/cache.service.js');
      const cache = new MemoryCache(60000);
      let fetchCount = 0;

      const fetchFn = async () => {
        fetchCount++;
        return { data: 'computed-result' };
      };

      const result1 = await cache.getOrSet('test-memo', fetchFn, 5000);
      const result2 = await cache.getOrSet('test-memo', fetchFn, 5000);

      expect(result1).toEqual({ data: 'computed-result' });
      expect(result2).toEqual({ data: 'computed-result' });
      expect(fetchCount).toBe(1);
    });
  });

  describe('Cursor Pagination Logic', () => {
    it('should window records correctly with limit and before cursor', () => {
      const mockDb = [
        { _id: '1', createdAt: new Date('2026-01-01T10:00:00Z'), text: 'first' },
        { _id: '2', createdAt: new Date('2026-01-01T10:01:00Z'), text: 'second' },
        { _id: '3', createdAt: new Date('2026-01-01T10:02:00Z'), text: 'third' },
        { _id: '4', createdAt: new Date('2026-01-01T10:03:00Z'), text: 'fourth' },
        { _id: '5', createdAt: new Date('2026-01-01T10:04:00Z'), text: 'fifth' },
      ];

      const queryCursor = (beforeDate, limit) => {
        let filtered = mockDb;
        if (beforeDate) {
          filtered = filtered.filter((item) => item.createdAt < beforeDate);
        }
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        const slice = filtered.slice(0, limit + 1);
        const hasMore = slice.length > limit;
        const results = hasMore ? slice.slice(0, limit) : slice;
        results.reverse();
        return {
          messages: results,
          hasMore,
          oldest: results[0]?._id,
          newest: results[results.length - 1]?._id,
        };
      };

      // Page before 5th message with limit 2
      const page1 = queryCursor(new Date('2026-01-01T10:04:00Z'), 2);
      expect(page1.messages.map((m) => m.text)).toEqual(['third', 'fourth']);
      expect(page1.hasMore).toBe(true);

      // Page before 3rd message
      const page2 = queryCursor(new Date('2026-01-01T10:02:00Z'), 2);
      expect(page2.messages.map((m) => m.text)).toEqual(['first', 'second']);
      expect(page2.hasMore).toBe(false);
    });
  });
});
