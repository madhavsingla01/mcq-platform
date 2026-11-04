import env from '../../config/env.js';

/**
 * Lightweight, high-throughput in-memory TTL cache with pattern invalidation.
 * Optimized for hot public read endpoints (quizzes, leaderboards, feeds).
 */
export class MemoryCache {
  constructor(defaultTtlMs = env.CACHE_DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  del(key) {
    this.cache.delete(key);
  }

  delPattern(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async getOrSet(key, fetchFn, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await fetchFn();
    if (fresh !== undefined && fresh !== null) {
      this.set(key, fresh, ttlMs);
    }
    return fresh;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    // Purge expired keys before reporting size
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}

export const memoryCache = new MemoryCache(env.CACHE_DEFAULT_TTL_MS);
export default memoryCache;
