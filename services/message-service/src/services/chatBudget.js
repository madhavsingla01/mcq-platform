import { AppError } from '../middleware/error.middleware.js';

const WINDOW_MS = 60_000;
const MAX_ACTIVE_BUCKETS = 20_000;
const budgets = new Map();
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of budgets) if (entry.resetAt <= now) budgets.delete(key);
}, WINDOW_MS);
cleanup.unref();

// Per account, shared across REST and socket sends in this process.
export function consumeChatBudget(userId, operation, max) {
  const now = Date.now();
  const key = `${userId}:${operation}`;
  const previous = budgets.get(key);
  if (previous && previous.resetAt > now) {
    if (previous.count >= max) throw new AppError('Too many messaging requests. Please wait a minute.', 429);
    previous.count++;
    return;
  }
  if (!previous && budgets.size >= MAX_ACTIVE_BUCKETS) throw new AppError('Messaging is busy. Please try again shortly.', 429);
  budgets.set(key, { count: 1, resetAt: now + WINDOW_MS });
}
