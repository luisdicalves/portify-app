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
  `maxPerClass`, `maxPerSector`, `externalWarnings`).
- **Outputs:** `RecommendationResult` (adds `meta`); each `Recommendation` now
  also carries `explanation: RecommendationExplanation` (see
  [lib/recommendationExplanation.ts](../lib/recommendationExplanation.ts)
  below) — purely explanatory, does not feed back into scoring.
- **Consumers:** `app/api/recommendations/route.ts` (→ `app/for-you/page.tsx`).
- **Tests:** `lib/recommendationEngine.test.ts`.
- **Note:** `totalPortfolioValue`/`currentWeight`/`OutOfPlanHolding.value` now
  use `HoldingSnapshot.marketValue` when the caller provides it (via
  `holdingValue()`), falling back to `units × avgPrice` otherwise — see
  [current-state.md](current-state.md). The engine itself stays pure/I/O-free;
  `app/api/recommendations/route.ts` is what fetches quotes and builds
  `portfolioState` before calling `recommend()`. `matchScore`/`qualityScore`/
  `finalScore` and the 60/40 blend are unchanged by this or by the
  explanation layer below.

## `lib/recommendationExplanation.ts` — governed (recommendationEngine), active

- **Function:** `buildRecommendationExplanation()` plus the pure helpers it
  composes (`getPrimaryReason`, `getPortfolioEffect`, `getRiskNote`,
  `inferDataConfidence`, `calcDiversificationImpact`) — builds the
  `RecommendationExplanation` attached to each `Recommendation`. Kept out of
  `lib/recommendationEngine.ts` because it's copy-generation logic, not
  scoring; types (`RecommendationDataConfidence`, `RecommendationExplanation`)
  are declared in `recommendationEngine.ts` itself and imported here
  type-only, so the dependency graph stays one-directional
  (`recommendationEngine.ts` → `recommendationExplanation.ts`).
- **Inputs:** `BuildExplanationInput` (asset, type, matchScore, qualityScore,
  currentWeight, targetWeight, isSubweighted, alreadyOwned, hasMarketValue,
  classHasActiveHoldings, preferredSectors, investmentGoal, tickerWarnings) —
  all plain data already computed by `recommend()`, no I/O.
- **Outputs:** `RecommendationExplanation`.
- **Consumers:** `lib/recommendationEngine.ts` (`recommend()`).
- **Tests:** covered via `lib/recommendationEngine.test.ts`'s
  `describe('recommend — explanation', ...)` block (integration-level,
  through `recommend()`, rather than unit tests calling the helpers
  directly — kept in one file since both cover the same behavior).
- Same purity rules as `recommendationEngine.ts`: no Supabase, no external
  APIs, no React/Next.js, no `lib/marketData.ts`.

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
  `ParsedHolding[]`/`ParsedTransaction[]` (legacy `parseFile()`/
  `parseXlsxFile()`/`parseHoldingsCsv()`, unchanged), and — since this task —
  a richer two-phase preview: `previewFile()` parses + validates every row +
  detects duplicates without saving anything, returning a typed
  `ImportPreview` (`parserVersion: XTB_IMPORT_PARSER_VERSION`, currently
  `1.0.0` — bump it whenever column mapping/type detection/validation rules
  change, see [import-xtb.md](import-xtb.md)). Row-level helpers
  (`mapXtbRowToTransaction`, `parseXtbRows`, `detectImportDuplicates`,
  `normalizeXtbTransactionType`, `normalizeTicker`, `normalizeMoney`,
  `normalizeDate`) are exported and independently testable. Still pure — no
  Supabase, no external API, no React/Next.js (asserted by a source-inspection
  test in `lib/holdingsImport.test.ts`).
- **Inputs:** a `File` (browser) or raw buffer/text, plus optionally the
  caller's already-saved transactions (`ExistingTransactionLike[]`) for
  cross-referencing duplicates — the caller fetches these (e.g. via
  `lib/db/transactions.ts`'s `getTransactions()`); the module itself does no I/O.
- **Outputs:** `ParseResult` (legacy) or `ImportPreview` (new — includes
  `rows: ImportPreviewRow[]` with per-row `status`/`issues`, `summary`,
  and the derived `holdings` snapshot).
- **Consumers:** `app/profile/settings/page.tsx` — now a two-phase flow
  (`previewFile()` on "Analisar ficheiro", then a manual write of only
  `'valid'`/`'warning'` rows on "Importar" — see
  [current-state.md](current-state.md)/[import-xtb.md](import-xtb.md)).
- **Tests:** `lib/holdingsImport.test.ts`.
- **Still pure after the audit-log task too** — does not import from
  `lib/db/importAudit.ts` or know about `import_id`/audit logs at all.
  Persistence is entirely the settings page's/`lib/db/importAudit.ts`'s
  concern; see below.

## `lib/db/importAudit.ts` — active (support module, not a model)

- **Function:** persists one row per *confirmed* import in
  `public.import_audit_logs` (schema: `supabase-migration-import-audit-log.sql`,
  consolidated into `supabase-schema.sql`) and tags the transactions it
  writes with `import_id`. `createImportAuditLog`/`completeImportAuditLog`/
  `failImportAuditLog`/`listImportAuditLogs`/`getImportAuditLog`, plus pure
  helpers: `determineImportStatus` (status lifecycle logic),
  `computeImportFileHash` (reuses `lib/models/modelMeta.ts`'s
  `createInputHash()` — non-cryptographic, content-based, never touches raw
  file bytes), and `buildImportAuditLogInsert` (payload builder, split out
  specifically so it's unit-testable without a Supabase client).
- **Inputs:** a `SupabaseClient<AppDatabase>` (browser or server, same
  convention as `lib/db/holdings.ts`/`transactions.ts`/`plans.ts`) plus
  plain data (`userId`, `filename`, an `ImportPreview`, etc.) — no parsing,
  no file I/O.
- **Outputs:** raw Supabase responses (`{ data, error }`), same convention
  as the rest of `lib/db/*` — callers check `.error` themselves.
- **Consumers:** `app/profile/settings/page.tsx`'s `confirmImport()` (create
  → write holdings/transactions → complete/fail) and its "Últimas
  importações" read-only history list.
- **Tests:** `lib/db/importAudit.test.ts` — the three pure functions only
  (`determineImportStatus`, `computeImportFileHash`,
  `buildImportAuditLogInsert`); the DB-client-dependent functions
  (`createImportAuditLog` etc.) aren't unit-tested — no existing
  Supabase-client mock pattern exists elsewhere in this repo's unit tests to
  follow (only `e2e/*.spec.ts` mocks Supabase, at the network/Playwright
  level, not the JS client level).

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
