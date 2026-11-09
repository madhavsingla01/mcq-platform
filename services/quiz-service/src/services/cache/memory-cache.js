// Bounded process-local cache. This is deliberately not a cross-replica cache.
export class MemoryCache {
  constructor(defaultTtlMs = 30000, maxEntries = 1000, now = Date.now) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('CACHE_MAX_ENTRIES must be a positive integer');
    this.cache = new Map();
    this.pending = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }
  set(key, value, ttlMs = this.defaultTtlMs) {
    const pending = this.pending.get(key);
    if (pending) pending.valid = false;
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    this.cache.delete(key);
    if (this.now() >= entry.expiresAt) return null;
    this.cache.set(key, entry);
    return entry.value;
  }
  has(key) { return this.get(key) !== null; }
  del(key) {
    this.cache.delete(key);
    const pending = this.pending.get(key);
    if (pending) pending.valid = false;
  }
  delPattern(prefix) {
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
    for (const [key, pending] of this.pending) if (key.startsWith(prefix)) pending.valid = false;
  }
  async getOrSet(key, fetchFn, ttlMs = this.defaultTtlMs) {
    const value = this.get(key);
    if (value !== null) return value;
    const running = this.pending.get(key);
    if (running?.valid) return running.promise;
    // Unique search strings cannot grow the pending map without bound.
    if (this.pending.size >= this.maxEntries) return fetchFn();
    const pending = { valid: true };
    pending.promise = Promise.resolve().then(fetchFn).then(result => {
      if (pending.valid && result != null) this.set(key, result, ttlMs);
      return result;
    }).finally(() => { if (this.pending.get(key) === pending) this.pending.delete(key); });
    this.pending.set(key, pending);
    return pending.promise;
  }
  clear() {
    this.cache.clear();
    for (const pending of this.pending.values()) pending.valid = false;
  }
  size() {
    for (const [key, entry] of this.cache) if (this.now() >= entry.expiresAt) this.cache.delete(key);
    return this.cache.size;
  }
}
