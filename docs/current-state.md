# Current state — financial calculations

This is a technical snapshot of where portfolio-value math lives today, written as background for [dev-quality.md](dev-quality.md) (quality gates), the canonical portfolio-state layer (`lib/portfolio/portfolioState.ts`), and [model-governance.md](model-governance.md) (versioning/meta/coverage/confidence — see below).

## The problem: duplicated valuation logic

There was no single place that answered "what is this user's portfolio worth right now." Three independent implementations computed overlapping numbers, from different inputs, with different fallback rules. **Dashboard, Portfolio, and the recommendation engine (For You) have all since been migrated to the shared layer (see "Current status" below).**

### 1. Dashboard — migrated ✅

Previously used `calcTotalValue(holdings, getPrice)` / `calcTotalInvested(holdings)` from [lib/portfolioMetrics.ts](../lib/portfolioMetrics.ts) directly, which fell back from live price to `avg_price` silently with no signal when a quote was missing.

[app/dashboard/page.tsx](../app/dashboard/page.tsx) now calls `buildPortfolioState()` (via [lib/portfolio/portfolioStateAdapters.ts](../lib/portfolio/portfolioStateAdapters.ts)) and reads `marketValue` / `costBasis` / `unrealizedGainPct` off the result. `lib/portfolioMetrics.ts` itself is untouched and still used for the performance chart series and annualized-return math on `app/dashboard/performance`, which `portfolioState.ts` doesn't model.

### 2. Portfolio tab — migrated ✅

[lib/hooks/usePortfolioData.ts](../lib/hooks/usePortfolioData.ts) fetches holdings and quotes and now maps them into the UI-shaped `Asset` type (`value`, `cost`, `dayChange`, `gainPct`, `gain`) using `buildPortfolioState()` for `value`/`cost`/`gainPct`, instead of the inline `price ?? avg_price` fallback it used to duplicate. [app/portfolio/page.tsx](../app/portfolio/page.tsx) itself needed no changes — it already derived its totals by summing over `assets`, so those sums now reflect the canonical calculation automatically.

`dayChange` is intentionally **not** sourced from `portfolioState.ts` — it's a live intraday quote concern (`quote.change`), not a state-of-holdings concern, and is still computed the same way as before in both Dashboard and `usePortfolioData`. Dividends/transactions history (used for the dividends and history tabs) also still comes straight from `transactions`, unchanged — `portfolioState.ts` only reports aggregate dividend totals, not a per-transaction breakdown.

**Design choice — holdings snapshot only, no transaction replay:** both call sites pass `transactions: []` to `buildPortfolioState()`, so it derives `marketValue`/`costBasis` from the `holdings` table snapshot rather than replaying full buy/sell history. This matches exactly what both pages did before (they already read `avg_price` straight from `holdings`, which `useTrade.ts` keeps updated on every trade) and keeps Dashboard and Portfolio guaranteed-consistent with each other. It's also the safer choice: `usePortfolioData`'s `removeTxn` deletes a transaction row without touching `holdings`, so `holdings` and `transactions` can drift apart — feeding transactions into the ledger replay here could silently produce different totals than the `holdings` table shows, which would be a behavior change, not just a refactor. Wiring the ledger-replay path in is a possible follow-up once that drift is addressed.

### 3. Recommendation engine — migrated ✅

[lib/recommendationEngine.ts](../lib/recommendationEngine.ts) / [app/api/recommendations/route.ts](../app/api/recommendations/route.ts)

`recommend()`'s `HoldingSnapshot` now accepts an optional `marketValue`, and a new internal `holdingValue(h)` helper reads it (falling back to `units × avgPrice` when absent) everywhere a holding's current financial value feeds into the model: `totalPortfolioValue`, `currentWeight` (both in the overweight-filtering pass during candidate selection and in the final recommendation loop), and `OutOfPlanHolding.value`. `matchScore`, `qualityScore`, `finalScore`, and the 60/40 blend are untouched — this only changes what "how much of this do I already own, in €" means.

`app/api/recommendations/route.ts` now builds the market value the same conceptual way as Dashboard/Portfolio:

```ts
const portfolioState = buildPortfolioState({
  holdings: holdingsToPortfolioInput(holdingsRaw),
  transactions: [],
  latestQuotes: quotesToLatestQuotes(quoteByTicker),
  userCurrency: DEFAULT_CURRENCY,
});
```

- **Holdings snapshot + `latestQuotes`, `transactions: []`** — same design choice as Dashboard/Portfolio (see above): no ledger replay, `marketValue`/`costBasis` derive from the `holdings` table snapshot. This keeps all three surfaces (Dashboard, Portfolio, For You) guaranteed-consistent and sidesteps the same `holdings`/`transactions` drift risk (`removeTxn` deletes a transaction without touching `holdings`) already documented above.
- **Quotes fetched per ticker via `getQuote()` (`lib/marketData.ts`)**, cached under the same `quote:${ticker}` key/TTL as `app/api/quote/route.ts` (so the two routes share cache entries instead of each fetching independently), wrapped in a per-ticker `try/catch` — one ticker's quote failing (network error, unsupported exchange) degrades only that holding to the average-cost fallback; it does not fail the whole `/api/recommendations` request.
- **Fallback for a missing quote is unchanged from before this task**: `buildPortfolioState()` already falls back to `averageCost` and raises a `missing_quote` data-quality warning (see `PortfolioDataQualityWarning`) — that behavior is reused as-is, not reimplemented.
- `portfolioState.dataQualityWarnings` messages are passed into `recommend()`'s new `externalWarnings` option and surface in `RecommendationResult.meta.warnings` (see [model-governance.md](model-governance.md) for the policy on this).

## Consequences (remaining)

- No dividend gross/net/withholding-tax split surfaces in the UI yet; Dashboard/Portfolio still sum raw dividend `amount` for the dividends tab and yield figure (`portfolioState.ts` computes the gross/net/tax split, it's just not read by these pages).
- `dataQualityWarnings` are surfaced as a dev-console warning on Dashboard/Portfolio (`logPortfolioStateWarnings`) and as `meta.warnings` on the recommendations API response — still no dedicated in-app UI for them.

## Current status

[lib/portfolio/portfolioState.ts](../lib/portfolio/portfolioState.ts) provides `buildPortfolioState()`, a single pure function that takes holdings + transactions + latest quotes and returns a canonical `PortfolioState` (market value, cost basis, average cost, realized/unrealized gain, dividend gross/net/tax split, cash balance, allocations, and explicit data-quality warnings instead of silent fallbacks). [lib/portfolio/portfolioStateAdapters.ts](../lib/portfolio/portfolioStateAdapters.ts) adapts the project's existing DB-row/quote shapes into its input types.

**Dashboard, Portfolio, and the recommendation engine (For You) all consume it now** (see above) — the three surfaces share the same conceptual notion of portfolio value: holdings snapshot + latest quotes, no transaction replay, average-cost fallback with an explicit warning when a quote is missing.

## Recommendation explainability

Every `Recommendation` from `lib/recommendationEngine.ts` now carries an `explanation: RecommendationExplanation` field (built by the pure helpers in [lib/recommendationExplanation.ts](../lib/recommendationExplanation.ts)):

- `primaryReason` / `portfolioEffect` / `riskNote` — short, prudent, educational PT copy (no "you'll gain X", no guarantees, no personalized financial advice) covering why the recommendation appears, what it does to the portfolio, and its main risk.
- `dataConfidence: 'high' | 'medium' | 'low'` — **purely informative, does not affect ranking or `finalScore`**. A simple, documented heuristic (no `confidence`/`coverageStatus` field exists yet on `CandidateAsset`): downgrades one level each for a stock without `pillarHealthScore` (no `RiskReport` was available — ETFs/bond ETFs aren't penalized for this, since they never carry pillar data by design), an owned position priced via the average-cost fallback rather than a live quote, and a data-quality warning that specifically mentions this ticker.
- `scoreBreakdown: { profileMatch, fundamentalQuality, diversificationImpact }` — `profileMatch`/`fundamentalQuality` are just `matchScore`/`qualityScore` decomposed for display; `diversificationImpact` (0–100) is a new, simple, deterministic band on `currentWeight`/`targetWeight` — **explanatory only, never fed into `finalScore`**.
- `reasons`/`warnings` — itemized supporting points and recommendation-specific caveats (e.g. "Cotação indisponível; foi usado preço médio como fallback.").

**`finalScore = matchScore × 0.6 + qualityScore × 0.4` is unchanged** — this task only adds explanatory copy and signals on top of the existing scoring, never inputs into it. `app/for-you/page.tsx` reuses its existing expand-on-tap card detail section (no new modal/sheet): the collapsed "Razão" line now shows `explanation.primaryReason` instead of the old joined `reason` string (which still exists, unchanged, on `Recommendation.reason`), and the expanded section gained a "Confiança dos dados" row plus `portfolioEffect`/`riskNote` text lines. `scoreBreakdown` numbers are not rendered in the UI in this task — kept API-only, to limit UI risk (see [model-map.md](model-map.md)).

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
