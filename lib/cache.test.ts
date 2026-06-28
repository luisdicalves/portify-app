import { describe, it, expect, vi } from 'vitest';

// Without UPSTASH_REDIS_REST_URL/TOKEN set, lib/cache.ts must fall back to calling
// the fetcher directly on every call (no caching, no crash) — this is the real
// behavior in local dev and in this test environment, where those vars aren't set.
describe('getCached (no Upstash configured)', () => {
  it('calls the fetcher and returns its result', async () => {
    const { getCached } = await import('./cache');
    const fetcher = vi.fn().mockResolvedValue({ price: 42 });

    const result = await getCached('quote:AAPL', 45, fetcher);

    expect(result).toEqual({ price: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('calls the fetcher again on a second call since there is no cache', async () => {
    const { getCached } = await import('./cache');
    const fetcher = vi.fn().mockResolvedValue('fresh');

    await getCached('some:key', 45, fetcher);
    await getCached('some:key', 45, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('propagates a null result from the fetcher', async () => {
    const { getCached } = await import('./cache');
    const fetcher = vi.fn().mockResolvedValue(null);

    const result = await getCached('missing:AAPL', 45, fetcher);

    expect(result).toBeNull();
  });
});
