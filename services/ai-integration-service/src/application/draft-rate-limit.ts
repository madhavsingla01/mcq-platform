import { AppError } from '../shared/errors/app-error.js';

export class DraftRateLimitError extends AppError {
  constructor(readonly retryAfter: number) {
    super('Too many draft requests', 429, 'RATE_LIMITED');
  }
}

function perAccount(max: number) {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  let cleanupAt = 0;
  return (userId: string) => {
    const now = Date.now();
    if (cleanupAt <= now) {
      cleanupAt = now + 60000;
      for (const [key, bucket] of buckets) if (bucket.expiresAt <= now) buckets.delete(key);
    }
    let bucket = buckets.get(userId);
    if (!bucket || bucket.expiresAt <= now) {
      if (!bucket && buckets.size >= 20000) throw new AppError('Draft service is busy', 503, 'SERVICE_UNAVAILABLE');
      bucket = { count: 0, expiresAt: now + 60000 };
      buckets.set(userId, bucket);
    }
    if (++bucket.count > max) {
      throw new DraftRateLimitError(Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)));
    }
  };
}

export type DraftBudget = ReturnType<typeof createDraftBudget>;
export function createDraftBudget(rate: { reads: number; writes: number }) {
  return { read: perAccount(rate.reads), write: perAccount(rate.writes) };
}
