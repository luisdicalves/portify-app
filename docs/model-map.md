# Model map

Every model/calculation module in `lib/`, what it does, and who actually
calls it today. See [model-governance.md](model-governance.md) for the
meta/versioning/coverage/confidence layer that sits on top of the six models
marked **governed** below.

**Status legend:**
- **active** — wired into a real page/API route a user hits today.
- **experimental** — wired into a real API route, but no UI reads its output yet.
- **legacy** — superseded by something else but still in use by at least one call site (kept, not dead code).
- **deprecated** — none currently; nothing in this map has been fully retired.

---

## `lib/portfolio/portfolioState.ts` — governed, active

- **Function:** `buildPortfolioState(input)` — canonical, pure computation of
  a user's portfolio financial state (market value, cost basis, realized/
  unrealized gain, dividend gross/net/tax split, cash balance, allocations,
  data-quality warnings) from holdings + transactions + latest quotes.
- **Inputs:** `PortfolioStateInput` (`holdings`, `transactions`,
  `latestQuotes`, `userCurrency`).
- **Outputs:** `PortfolioState`.
- **Consumers:** `app/dashboard/page.tsx`, `lib/hooks/usePortfolioData.ts`
  (→ `app/portfolio/page.tsx`), both via `lib/portfolio/portfolioStateAdapters.ts`.
- **Tests:** `lib/portfolio/portfolioState.test.ts` (315 lines — normalization,
  ledger replay, allocations, warnings, determinism/purity).
- **Note:** no `meta` field on its output by design — see
  [model-governance.md](model-governance.md#portfoliostatets-deliberately-has-no-meta-field).

## `lib/portfolio/portfolioStateAdapters.ts` — active (support module, not a model)

- **Function:** adapters between the project's DB-row/quote shapes and
  `PortfolioStateInput`, plus `logPortfolioStateWarnings()` (dev-only console
  surfacing of `dataQualityWarnings`).
- **Inputs/Outputs:** shape conversion only, no scoring logic.
- **Consumers:** `app/dashboard/page.tsx`, `lib/hooks/usePortfolioData.ts`.
- **Tests:** `lib/portfolio/portfolioStateAdapters.test.ts`.

## `lib/planCalculator.ts` — governed, active

- **Function:** `calcPlan(profile, preferredClasses)` — chains
  `calcRiskScore` → `calcAllocation` → `calcRate`, plus `detectConflicts()`
  and the `calcFV`/`calcPMT`/`calcYears` compound-interest helpers.
- **Inputs:** `UserProfile`, optional `preferredClasses`.
- **Outputs:** `PlanCalcResult` (`riskScore`, `allocation`, `rate`,
  `rateLow`/`rateHigh`, `conflicts`, `meta`).
- **Consumers:** `app/auth/plan-set`, `app/auth/summary`, `app/profile/page.tsx`,
  `lib/recommendationEngine.ts` (calls `calcPlan` internally).
- **Tests:** `lib/planCalculator.test.ts`.

## `lib/riskScore.ts` — governed, active

- **Function:** `fetchRiskReport(ticker, lang)` — deterministic, threshold-based
  fundamental risk report for a single stock, using Finnhub free-tier data
  (US-listed tickers only). Also exports `band()` (generic step-interpolation,
  reused by `lib/engines/*`) and `toFinnhubSymbol()`.
- **Inputs:** `ticker`, `lang`.
- **Outputs:** `RiskReport | null` (adds `coverageStatus`, `coverageReason`,
  `meta` — see [model-governance.md](model-governance.md)).
- **Consumers:** `app/api/risk/route.ts` (→ `lib/hooks/useAssetDetail.ts` →
  `app/portfolio/[id]/page.tsx` via `components/ui/RiskReport.tsx`),
  `app/api/recommendations/route.ts` (RiskReport-based hard filter + input to
  `calcQualityScoreFromReport`).
- **Tests:** `lib/riskScore.test.ts`.

## `lib/qualityScore.ts` — governed, active (two distinct functions — see governance doc)

- **Functions:**
  - `calcQualityScore(metrics)` — metrics-based per-dimension breakdown.
    Gained `confidence`, `missingMetrics`, `availableMetrics`, `coverageRatio`,
    `meta` in this task.
  - `qualityScoreFromMetrics(metrics)` — thin wrapper, returns
    `calcQualityScore(metrics).total` only. Unchanged.
  - `calcQualityScoreFromReport(report, profile)` — separate, personalized
    pipeline from a `RiskReport` + `UserProfile`; returns a plain `number`.
    Unchanged (see governance doc for why).
  - `qualityLabel(score)` — presentation helper (label + color).
- **Inputs:** `StockMetrics`, or `RiskReport` + `UserProfile`.
- **Outputs:** `ScoreBreakdown`, `number`, or `{ label, color }` depending on function.
- **Consumers:** `lib/assetUniverse.ts` (`qualityScoreFromMetrics`),
  `app/api/recommendations/route.ts` (`calcQualityScoreFromReport`).
- **Tests:** `lib/qualityScore.test.ts`.

## `lib/recommendationEngine.ts` — governed, active

- **Function:** `recommend(opts)` — "modelo v3.0": matchScore (assetClass 30%
  + sector 25% + goal 25% + horizon 20%) × 0.6 + qualityScore × 0.4 =
  finalScore; top-N per class with sector diversification; € allocation;
  new-vs-reinforce/subweighted detection; pace-to-goal alert.
- **Inputs:** `RecommendOptions` (`universe`, `profile`, `preferredSectors`,
  `monthlyAmount`, `goalAmount`, `holdings`, `preferredClasses`,
  `maxPerClass`, `maxPerSector`).
- **Outputs:** `RecommendationResult` (adds `meta` in this task).
- **Consumers:** `app/api/recommendations/route.ts` (→ `app/for-you/page.tsx`).
- **Tests:** `lib/recommendationEngine.test.ts`.
- **Note:** `totalPortfolioValue` inside this model is still computed from
  `avgPrice` (cost), not `marketValue` — a known, intentionally out-of-scope
  gap, see [current-state.md](current-state.md).

## `lib/assetUniverse.ts` — active

- **Function:** builds/caches the candidate universe for the recommendation
  engine: `fetchCandidates` (Finnhub `/stock/symbol`) → `filterByQuality` →
  `enrichAssets` (sector, beta, dividend yield, `qualityScoreFromMetrics`).
  Exports `getUniverse()` (7-day cache), `rebuildUniverse()`,
  `filterUniverseForUser()`.
- **Inputs:** none directly (network I/O); `filterUniverseForUser` takes the
  universe + user profile constraints.
- **Outputs:** `CandidateAsset[]`.
- **Consumers:** `app/api/recommendations/route.ts`.
- **Tests:** none dedicated (I/O-heavy; see file header — same pattern as
  `fetchRiskReport`, not unit-tested).

## `lib/sectorMap.ts` — active

- **Function:** maps Finnhub's `finnhubIndustry` string to Portify's 9
  internal sector ids; `sectorMatchScore()` used by the recommendation
  engine's matchScore.
- **Inputs:** `finnhubIndustry` string, or `(sector, preferredSectors[])`.
- **Outputs:** `PortifySector`, match score/boolean.
- **Consumers:** `lib/assetUniverse.ts`, `lib/recommendationEngine.ts`, onboarding sector-selection UI.
- **Tests:** `lib/sectorMap.test.ts`.

## `lib/cashFlowForecast.ts` — governed, active

- **Function:** `buildCashFlowForecast(holdings, history, cash, rate, opts)`
  — infers per-ticker dividend frequency/amount from transaction history,
  projects future payments over a horizon, applies estimated withholding tax
  by ticker suffix, adds expected interest on uninvested cash.
- **Inputs:** holdings, dividend/tax transaction history, uninvested cash,
  free-funds annual rate, optional horizon.
- **Outputs:** `ForecastResult` (`dividends`, `interestMonthly`,
  `interestAnnual`, `meta`).
- **Consumers:** `app/api/dividends/route.ts`.
- **Tests:** none dedicated yet (no `cashFlowForecast.test.ts` existed before
  this task; not added here — out of this task's required test list, which
  only calls out modelMeta/riskScore/qualityScore explicitly).

## `lib/holdingsImport.ts` — active

- **Function:** parses CSV/XLSX broker exports (XTB-style) into
  `ParsedHolding[]`/`ParsedTransaction[]`.
- **Inputs:** raw file text/buffer.
- **Outputs:** `ParseResult`.
- **Consumers:** the holdings-import flow (out of scope for this task — see
  "fora de âmbito").
- **Tests:** `lib/holdingsImport.test.ts`.

## `lib/marketData.ts` — active

- **Function:** low-level quote/history fetchers — Finnhub (`getQuote`),
  Yahoo Finance fallback for exchanges Finnhub's free tier doesn't cover
  (`fetchYahooQuote`/`fetchYahooHistory`), Twelve Data fallback for history.
- **Inputs:** ticker + API keys.
- **Outputs:** raw quote/history objects.
- **Consumers:** `app/api/quote`, `app/api/history` (server routes),
  `lib/engines/riskEngine.ts`.
- **Tests:** `lib/marketData.test.ts`.

## `lib/marketApi.ts` — active

- **Function:** client-side fetch helpers for the internal `/api/quote` and
  `/api/history` routes; degrade to `null` on error rather than throwing.
- **Inputs:** ticker.
- **Outputs:** `Quote | null`, `HistoryPoint[] | null`.
- **Consumers:** portfolio/dashboard client components (`useAssetDetail.ts`,
  `usePortfolioData.ts`, etc).
- **Tests:** none dedicated (thin fetch wrapper).

## `lib/portfolioMetrics.ts` — legacy

- **Function:** pre-`portfolioState.ts` valuation helpers —
  `calcTotalValue`/`calcTotalInvested` (superseded on Dashboard/Portfolio by
  `buildPortfolioState()`, see [current-state.md](current-state.md)),
  `buildPortfolioSeries`/`buildLinePath` (performance chart, not modeled by
  `portfolioState.ts`), `calcWeightedAvgDaysHeld`/`calcAnnualizedReturn`.
- **Inputs:** `Holding[]`, per-ticker `HistoryPoint[]`.
- **Outputs:** numbers / point series.
- **Consumers:** `app/dashboard/performance` (chart + annualized return —
  still active for this), no longer used for Dashboard's headline
  value/invested numbers.
- **Tests:** `lib/portfolioMetrics.test.ts`.

## `lib/engines/classification.ts` — experimental

- **Function:** `classifyHoldingType(ticker, assetClass)` — core vs satellite
  classification (curated broad-index ticker list + bond_etf catch-all).
- **Inputs:** ticker, optional asset class.
- **Outputs:** `HoldingType` (`'core' | 'satellite'`).
- **Consumers:** `app/api/asset-scores/route.ts`. No UI reads
  `/api/asset-scores` yet.
- **Tests:** `lib/engines/classification.test.ts`.

## `lib/engines/qualityEngine.ts` — experimental

- **Function:** "Portify Investment Engine v1.0" quality score — valuation
  35% / financial health 35% / growth 30%, reusing `band()` from
  `riskScore.ts`. A parallel, differently-shaped model from `qualityScore.ts`
  (not currently reconciled with it).
- **Inputs:** `QualityEngineInput`.
- **Outputs:** `QualityEngineResult`.
- **Consumers:** `app/api/asset-scores/route.ts`.
- **Tests:** `lib/engines/qualityEngine.test.ts`.

## `lib/engines/riskEngine.ts` — experimental

- **Function:** "Portify Investment Engine v1.0" market-risk score — beta 25%
  / 1y volatility 25% / max drawdown 20% / debt ratio 15% / liquidity 15%
  (100 = safest). Explicitly documented as *not* reusing `riskScore.ts`,
  since that's a fundamentals/quality score, not a market-risk score.
- **Inputs:** `RiskEngineInput` (beta, daily closes, D/E, market cap).
- **Outputs:** `RiskEngineResult`.
- **Consumers:** `app/api/asset-scores/route.ts`.
- **Tests:** `lib/engines/riskEngine.test.ts`.

## `lib/engines/convictionEngine.ts` — experimental

- **Function:** "Portify Investment Engine v1.0" conviction score — earnings
  surprise consistency 30% / revenue growth stability 25% / margin stability
  20% / analyst consensus 15% / EPS stability 10%, via coefficient-of-variation
  on quarterly series.
- **Inputs:** `ConvictionEngineInput` (quarterly series, analyst counts).
- **Outputs:** `ConvictionEngineResult`.
- **Consumers:** `app/api/asset-scores/route.ts`.
- **Tests:** `lib/engines/convictionEngine.test.ts`.

---

**Not governed by `lib/models/modelMeta.ts` (yet):** `lib/engines/*` and
`lib/assetUniverse.ts`/`lib/sectorMap.ts`/`lib/holdingsImport.ts`/
`lib/marketData.ts`/`lib/marketApi.ts`/`lib/portfolioMetrics.ts` don't carry a
`ModelRunMeta`. The `lib/engines/*` outputs are plain score breakdowns with no
wrapper object of their own yet (`QualityEngineResult`/`RiskEngineResult`/
`ConvictionEngineResult` are the return values directly, not nested under a
`result` key) and aren't consumed by any UI yet, so extending them was left
out of this task's scope rather than guessed at.
