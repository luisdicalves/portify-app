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

// ── Fetch helpers ──────────────────────────────────────────────────────────────

export async function fetchQuote(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d.price !== 'number') return null;
    return {
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
  } catch {
    return null;
  }
}

export async function fetchHistory(
  ticker: string,
  outputsize: number,
): Promise<HistoryPoint[] | null> {
  try {
    const res = await fetch(
      `/api/history?symbol=${encodeURIComponent(ticker)}&outputsize=${outputsize}`,
    );
    if (!res.ok) return null;
    const d = await res.json();
    return Array.isArray(d.points) && d.points.length > 1 ? d.points : null;
  } catch {
    return null;
  }
}
