import env from '../../config/env.js';
import { MemoryCache } from './memory-cache.js';
export { MemoryCache } from './memory-cache.js';
export const memoryCache = new MemoryCache(env.CACHE_DEFAULT_TTL_MS, Number(process.env.CACHE_MAX_ENTRIES ?? 1000));
export default memoryCache;
