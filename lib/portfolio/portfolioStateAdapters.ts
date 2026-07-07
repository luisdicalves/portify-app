// Adapters between the project's existing data shapes (DB rows, market
// quotes) and PortfolioStateInput — kept separate from portfolioState.ts so
// that module stays free of any project-specific shape assumptions.

import type { PortfolioDataQualityWarning, PortfolioHoldingInput, PortfolioQuoteLike, PortfolioTransactionLike } from '@/lib/portfolio/portfolioState';

// The app has no multi-currency support yet — every page formats amounts
// with a fixed pt-PT/EUR Intl.NumberFormat regardless of the holding's real
// currency. Defaulting holdings and userCurrency to the same value keeps
// buildPortfolioState() from raising unknown/multi-currency warnings that
// would just be noise given the current, EUR-only UI.
export const DEFAULT_CURRENCY = 'EUR';

export interface HoldingLike {
  ticker: string;
  units: number;
  avg_price: number;
}

export function holdingsToPortfolioInput(holdings: HoldingLike[]): PortfolioHoldingInput[] {
  return holdings.map(h => ({
    ticker: h.ticker,
    units: h.units,
    avg_price: h.avg_price,
    currency: DEFAULT_CURRENCY,
  }));
}

export interface TransactionRowLike {
  id: string;
  ticker: string | null;
  type: string;
  units: number | null;
  price: number | null;
  amount: number;
  executed_at: string | null;
}

export function transactionsToPortfolioInput(rows: TransactionRowLike[]): PortfolioTransactionLike[] {
  return rows.map(r => ({
    id: r.id,
    ticker: r.ticker,
    type: r.type,
    units: r.units,
    price: r.price,
    amount: r.amount,
    executed_at: r.executed_at,
  }));
}

export interface QuoteLike {
  price: number;
}

// Keyed by ticker. Missing/null/undefined entries are dropped rather than
// kept as null, since PortfolioQuoteLike callers only check for presence.
export function quotesToLatestQuotes(quotes: Record<string, QuoteLike | null | undefined>): Record<string, PortfolioQuoteLike | undefined> {
  const out: Record<string, PortfolioQuoteLike | undefined> = {};
  for (const ticker of Object.keys(quotes)) {
    const q = quotes[ticker];
    if (q) out[ticker] = { price: q.price };
  }
  return out;
}

// Discrete, dev-only surfacing of data-quality issues (missing quote, unknown
// ticker/currency, ...) — intentionally just a console warning rather than
// new UI, per this task's scope.
export function logPortfolioStateWarnings(context: string, warnings: PortfolioDataQualityWarning[]): void {
  if (warnings.length === 0 || process.env.NODE_ENV === 'production') return;
  console.warn(`[portfolioState:${context}]`, warnings);
}
