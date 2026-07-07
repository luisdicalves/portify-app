# Current state — financial calculations

This is a technical snapshot of where portfolio-value math lives today, written as background for [dev-quality.md](dev-quality.md) (quality gates) and the new canonical portfolio-state layer (`lib/portfolio/portfolioState.ts`).

## The problem: duplicated valuation logic

There is no single place that answers "what is this user's portfolio worth right now." At least three independent implementations compute overlapping numbers, from different inputs, with different fallback rules:

### 1. Dashboard — [lib/portfolioMetrics.ts](../lib/portfolioMetrics.ts)

`calcTotalValue(holdings, getPrice)` and `calcTotalInvested(holdings)` operate on a minimal `{ ticker, units, avg_price }` shape. Used by [app/dashboard/page.tsx](../app/dashboard/page.tsx):

```ts
const totalValue    = calcTotalValue(holdings, ticker => quotes[ticker]?.price);
const totalInvested = calcTotalInvested(holdings);
```

Live price falls back to `avg_price` silently when a quote is missing — no signal is raised when that happens.

### 2. Portfolio tab — [lib/hooks/usePortfolioData.ts](../lib/hooks/usePortfolioData.ts) + [app/portfolio/page.tsx](../app/portfolio/page.tsx)

`usePortfolioData` fetches holdings and quotes itself and maps them into a UI-shaped `Asset` type (`value`, `cost`, `dayChange`, `gainPct`, `gain`), duplicating the same `price ?? avg_price` fallback inline:

```ts
const price = quote?.price ?? h.avg_price;
const gainPct = h.avg_price > 0 ? (price - h.avg_price) / h.avg_price : 0;
```

The page then re-derives portfolio totals from that array (`assets.reduce((sum, a) => sum + a.value, 0)`, etc.) rather than from a shared source. Dividends and transactions are loaded and shaped separately in the same hook, with no realized-gain or net-of-tax dividend calculation — the page only sums raw dividend `amount`.

### 3. Recommendation engine — [lib/recommendationEngine.ts](../lib/recommendationEngine.ts)

`recommend()` computes `totalPortfolioValue` from `HoldingSnapshot[]` using **cost**, not market value:

```ts
const totalPortfolioValue = holdings.reduce((s, h) => s + h.units * h.avgPrice, 0);
```

This is a third, independent definition of "portfolio value" — it never looks at live quotes at all, so current weights used to detect "overweight" positions are computed against cost basis rather than market value. On a position with a large unrealized gain or loss, this can misclassify it as under/overweight relative to its true market weight.

## Consequences

- No single, tested definition of market value, cost basis, average cost, or realized/unrealized gain.
- No consistent handling of missing quotes (silent fallback in two places, no fallback at all — i.e. cost-basis-only — in the third).
- No modeling of cash balance (deposits, interest, taxes) as part of portfolio value anywhere.
- No dividend gross/net/withholding-tax split; dividends are just summed as raw transaction amounts.
- No data-quality signal when a ticker, currency, or price is missing or a transaction is malformed.

## Direction

[lib/portfolio/portfolioState.ts](../lib/portfolio/portfolioState.ts) introduces `buildPortfolioState()`, a single pure function that takes holdings + transactions + latest quotes and returns a canonical `PortfolioState` (market value, cost basis, average cost, realized/unrealized gain, dividend gross/net/tax split, cash balance, allocations, and explicit data-quality warnings instead of silent fallbacks). It does not yet replace any of the three call sites above — that migration is intentionally out of scope for this change so the new layer can be reviewed and tested in isolation first.
