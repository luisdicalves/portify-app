# Current state — financial calculations

This is a technical snapshot of where portfolio-value math lives today, written as background for [dev-quality.md](dev-quality.md) (quality gates), the canonical portfolio-state layer (`lib/portfolio/portfolioState.ts`), and [model-governance.md](model-governance.md) (versioning/meta/coverage/confidence — see below).

## The problem: duplicated valuation logic

There was no single place that answered "what is this user's portfolio worth right now." Three independent implementations computed overlapping numbers, from different inputs, with different fallback rules. **Dashboard and Portfolio have since been migrated to the shared layer (see "Current status" below); the recommendation engine has not.**

### 1. Dashboard — migrated ✅

Previously used `calcTotalValue(holdings, getPrice)` / `calcTotalInvested(holdings)` from [lib/portfolioMetrics.ts](../lib/portfolioMetrics.ts) directly, which fell back from live price to `avg_price` silently with no signal when a quote was missing.

[app/dashboard/page.tsx](../app/dashboard/page.tsx) now calls `buildPortfolioState()` (via [lib/portfolio/portfolioStateAdapters.ts](../lib/portfolio/portfolioStateAdapters.ts)) and reads `marketValue` / `costBasis` / `unrealizedGainPct` off the result. `lib/portfolioMetrics.ts` itself is untouched and still used for the performance chart series and annualized-return math on `app/dashboard/performance`, which `portfolioState.ts` doesn't model.

### 2. Portfolio tab — migrated ✅

[lib/hooks/usePortfolioData.ts](../lib/hooks/usePortfolioData.ts) fetches holdings and quotes and now maps them into the UI-shaped `Asset` type (`value`, `cost`, `dayChange`, `gainPct`, `gain`) using `buildPortfolioState()` for `value`/`cost`/`gainPct`, instead of the inline `price ?? avg_price` fallback it used to duplicate. [app/portfolio/page.tsx](../app/portfolio/page.tsx) itself needed no changes — it already derived its totals by summing over `assets`, so those sums now reflect the canonical calculation automatically.

`dayChange` is intentionally **not** sourced from `portfolioState.ts` — it's a live intraday quote concern (`quote.change`), not a state-of-holdings concern, and is still computed the same way as before in both Dashboard and `usePortfolioData`. Dividends/transactions history (used for the dividends and history tabs) also still comes straight from `transactions`, unchanged — `portfolioState.ts` only reports aggregate dividend totals, not a per-transaction breakdown.

**Design choice — holdings snapshot only, no transaction replay:** both call sites pass `transactions: []` to `buildPortfolioState()`, so it derives `marketValue`/`costBasis` from the `holdings` table snapshot rather than replaying full buy/sell history. This matches exactly what both pages did before (they already read `avg_price` straight from `holdings`, which `useTrade.ts` keeps updated on every trade) and keeps Dashboard and Portfolio guaranteed-consistent with each other. It's also the safer choice: `usePortfolioData`'s `removeTxn` deletes a transaction row without touching `holdings`, so `holdings` and `transactions` can drift apart — feeding transactions into the ledger replay here could silently produce different totals than the `holdings` table shows, which would be a behavior change, not just a refactor. Wiring the ledger-replay path in is a possible follow-up once that drift is addressed.

### 3. Recommendation engine — not migrated

[lib/recommendationEngine.ts](../lib/recommendationEngine.ts)

`recommend()` computes `totalPortfolioValue` from `HoldingSnapshot[]` using **cost**, not market value:

```ts
const totalPortfolioValue = holdings.reduce((s, h) => s + h.units * h.avgPrice, 0);
```

This is still an independent, un-migrated definition of "portfolio value" — it never looks at live quotes at all, so current weights used to detect "overweight" positions are computed against cost basis rather than market value. On a position with a large unrealized gain or loss, this can misclassify it as under/overweight relative to its true market weight. **Intentionally left alone** — migrating the recommendation engine changes its scoring behavior, not just where the arithmetic lives, so it's out of scope until it can be reviewed on its own.

## Consequences (remaining)

- The recommendation engine still values holdings at cost, not market value — its notion of "current weight" can diverge from Dashboard/Portfolio's.
- No dividend gross/net/withholding-tax split surfaces in the UI yet; Dashboard/Portfolio still sum raw dividend `amount` for the dividends tab and yield figure (`portfolioState.ts` computes the gross/net/tax split, it's just not read by these pages).
- `dataQualityWarnings` are only surfaced as a dev-console warning (`logPortfolioStateWarnings`) — no in-app UI for them yet.

## Current status

[lib/portfolio/portfolioState.ts](../lib/portfolio/portfolioState.ts) provides `buildPortfolioState()`, a single pure function that takes holdings + transactions + latest quotes and returns a canonical `PortfolioState` (market value, cost basis, average cost, realized/unrealized gain, dividend gross/net/tax split, cash balance, allocations, and explicit data-quality warnings instead of silent fallbacks). [lib/portfolio/portfolioStateAdapters.ts](../lib/portfolio/portfolioStateAdapters.ts) adapts the project's existing DB-row/quote shapes into its input types.

**Dashboard and Portfolio both consume it now** (see above). The recommendation engine does not, and updating it is a separate, deliberately out-of-scope change.

## Model governance, versioning, coverage & confidence

A separate pass added governance metadata to the core models — see
[model-governance.md](model-governance.md) for the full policy and
[model-map.md](model-map.md) for a per-file inventory of every model in
`lib/`. Summary of what changed:

- **`lib/models/modelMeta.ts`** now exists: `ModelName`/`ModelVersion`/
  `ModelRunMeta` types, `createModelRunMeta()`, and a deterministic
  (non-cryptographic) `createInputHash()`.
- **`planCalculator`, `riskScore`, `qualityScore`, `recommendationEngine`,
  `cashFlowForecast`** now each attach an optional `meta: ModelRunMeta` to
  their output (modelName, modelVersion, generatedAt, dataAsOf, inputHash,
  assumptions, warnings). `portfolioState` does **not** — attaching a
  live-timestamped `meta` to a pure, synchronous function would break the
  "same input → same output" determinism `portfolioState.test.ts` explicitly
  tests for, so it keeps a registered version for bookkeeping only (see
  model-governance.md for the full reasoning).
- **`riskScore.ts`** (`fetchRiskReport()`) now exposes
  `coverageStatus: 'full' | 'partial' | 'unavailable'` and a
  `coverageReason` explaining why (`US_EQUITY`, `NON_US_EQUITY`,
  `NO_FUNDAMENTALS`, `API_ERROR`, `ETF_LIMITED_DATA` reserved, `UNKNOWN`),
  computed from how many of the 9 core fundamentals the model scores on were
  actually returned by Finnhub. It still returns `null` unchanged for total
  failures (no API key, failed fetch, unknown ticker) — `coverageStatus` only
  describes partial degradation within a report that was produced.
- **`qualityScore.ts`**'s `calcQualityScore()` (the metrics-based
  `ScoreBreakdown`, not `calcQualityScoreFromReport()` — see
  model-governance.md for why only one of the two got this) now exposes
  `confidence: 'high' | 'medium' | 'low'`, `missingMetrics`/`availableMetrics`,
  and `coverageRatio`. Confidence is informative only for now — no score or
  recommendation weight changes based on it yet.
- All of the above are additive/optional fields — no existing field was
  renamed or removed, and no API response shape changed incompatibly.
