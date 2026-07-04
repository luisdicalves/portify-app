// In-memory per-user rate limiter. Each server instance keeps its own Map —
// fine for a single Vercel serverless function; for multi-region deployments
// replace with Redis (Upstash).

interface Entry { firstAt: number; count: number }

const store = new Map<string, Entry>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Check whether `userId` is within the allowed quota.
 * @param userId    Supabase user UUID
 * @param maxCalls  Maximum calls allowed in the window
 * @param windowMs  Rolling window in milliseconds
 */
export function checkRateLimit(
  userId: string,
  maxCalls: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(userId);

  if (!entry || now - entry.firstAt >= windowMs) {
    store.set(userId, { firstAt: now, count: 1 });
    return { allowed: true };
  }

  if (entry.count < maxCalls) {
    entry.count++;
    return { allowed: true };
  }

  const retryAfterSeconds = Math.ceil((entry.firstAt + windowMs - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}

// Prune stale entries every hour to avoid unbounded growth.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    store.forEach((entry, key) => {
      if (now - entry.firstAt > ONE_HOUR) store.delete(key);
    });
  }, 60 * 60 * 1000);
}
