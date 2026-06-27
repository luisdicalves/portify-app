import { Redis } from '@upstash/redis';

// Optional: if Upstash isn't configured, getCached() just calls the fetcher directly
// every time (no caching, no error) — useful for local dev without a Redis account.
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

export async function getCached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  if (!redis) return fetcher();

  const cached = await redis.get<T>(key);
  if (cached !== null && cached !== undefined) return cached;

  const fresh = await fetcher();
  if (fresh !== null && fresh !== undefined) {
    await redis.set(key, fresh, { ex: ttlSeconds });
  }
  return fresh;
}
