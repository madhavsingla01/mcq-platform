import env from '../config/env.js';

class MemoryCache {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, ttlSeconds = env.LEADERBOARD_CACHE_TTL_SECONDS) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
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

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();
export default memoryCache;
