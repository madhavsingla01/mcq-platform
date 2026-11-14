import env from '../config/env.js';

import type { RankingService } from './ranking.service.js';

type Standings = ReturnType<typeof RankingService.calculateRankings>;

class MemoryCache {
  private readonly cache = new Map<string, { value: Standings; expiresAt: number }>();

  set(key: string, value: Standings, ttlSeconds = env.LEADERBOARD_CACHE_TTL_SECONDS) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiresAt });
  }

  get(key: string) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  del(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();
export default memoryCache;
