/**
 * lib/marketApi.ts
 *
 * Client-side helpers for the internal market-data API routes.
 * All functions return null on error so callers can degrade gracefully.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Quote {
  price:        number;
  change:       number;
  changePercent: number;
  open:         number;
  high:         number;
  low:          number;
  prevClose:    number;
  companyName:  string | null;
  industry:     string | null;
  exchange:     string | null;
}

export interface HistoryPoint {
  date:  string; // ISO date string
  close: number;
}

// ── Client-side cache (TTL: 30s for quotes, 5min for history) ─────────────────
// Stale entries are kept indefinitely and returned when a live fetch fails,
// so the UI always shows the last known value instead of going blank.

const QUOTE_TTL   = 30_000;
const HISTORY_TTL = 5 * 60_000;

interface CacheEntry<T> { data: T; expiresAt: number }

const quoteCache   = new Map<string, CacheEntry<Quote>>();
const historyCache = new Map<string, CacheEntry<HistoryPoint[]>>();

// ── Fetch helpers ──────────────────────────────────────────────────────────────

export async function fetchQuote(ticker: string): Promise<Quote | null> {
  const cached = quoteCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return cached?.data ?? null;
    const d = await res.json();
    if (typeof d.price !== 'number') return cached?.data ?? null;
    const quote: Quote = {
      price:         d.price,
      change:        d.change        ?? 0,
      changePercent: d.changePercent ?? 0,
      open:          d.open          ?? d.price,
      high:          d.high          ?? d.price,
      low:           d.low           ?? d.price,
      prevClose:     d.prevClose     ?? d.price,
      companyName:   d.companyName   ?? null,
      industry:      d.industry      ?? null,
      exchange:      d.exchange      ?? null,
    };
    quoteCache.set(ticker, { data: quote, expiresAt: Date.now() + QUOTE_TTL });
    return quote;
  } catch {
    return cached?.data ?? null;
  }
}

export async function fetchHistory(
  ticker: string,
  outputsize: number,
): Promise<HistoryPoint[] | null> {
  const key = `${ticker}:${outputsize}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const res = await fetch(
      `/api/history?symbol=${encodeURIComponent(ticker)}&outputsize=${outputsize}`,
    );
    if (!res.ok) return cached?.data ?? null;
    const d = await res.json();
    const points: HistoryPoint[] | null = Array.isArray(d.points) && d.points.length > 1 ? d.points : null;
    if (points) historyCache.set(key, { data: points, expiresAt: Date.now() + HISTORY_TTL });
    return points ?? cached?.data ?? null;
  } catch {
    return cached?.data ?? null;
  }
}
