# Model map

Every model/calculation module in `lib/`, what it does, and who actually
calls it today. See [model-governance.md](model-governance.md) for the
meta/versioning/coverage/confidence layer that sits on top of the six models
marked **governed** below.

**Status legend:**
- **active** — wired into a real page/API route a user hits today.
- **experimental** — wired into a real API route, but no UI reads its output yet.
- **legacy** — superseded by something else but still in use by at least one call site (kept, not dead code).
- **library** — implemented, tested and governed, but no route/UI wired to it yet (a pure calculation module awaiting a data-collection layer — e.g. new onboarding/settings screens to gather its inputs). Different from **experimental**: there isn't even a route yet, not just a missing UI.
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
  consolidated into `supabase-schema.sql` — see
  [import-audit-migration-runbook.md](import-audit-migration-runbook.md) for
  how/when to apply that migration to a real environment) and tags the transactions it
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

## `lib/models/safetyReserve.ts` — library

- **Function:** `evaluateSafetyReserve(input)` — Safety Gate & Reserve Engine:
  `calcTargetReserveMonths`/`calcImmediateMonths` (add-on tables) →
  `calcRiskFundingCapFromCoverage` (MODEL-018 continuous restriction) → hard
  gates (payment arrears, immediate/near-term coverage floors, high-cost
  revolving debt, no-reliable-income without a sustainable source, critical
  data status) → `gateResult`/`riskFundingCap`.
- **Inputs:** `SafetyReserveInput` (income stability, dependents, debt ratio,
  essential outlays, reserve/liquidity amounts in €, hard-gate flags).
- **Outputs:** `SafetyReserveResult` (adds `meta`).
- **Consumers:** none yet — no onboarding/settings screen collects its
  inputs (income €, debt, essential outlays, dependents, liquid assets) in
  this app today. See PORTIFY-KNOWLEDGE
  `04-financial-models/SAFETY/SAFETY-RESERVE-V1.md` for the full spec;
  maturity there is "CALIBRATED — structural core", not `PRODUCTION_APPROVED`.
- **Tests:** `lib/models/safetyReserve.test.ts`.
- **Scope note:** §6.6 Liquidity Runway Matching (per-asset L0-L3
  eligibility) and §6.8/§6.9 (intra-contribution reevaluation, stress model)
  are not implemented — this v1 uses direct € amounts instead of the
  per-asset liquidity sub-engine. See the file header for the full list.

## `lib/models/debtAdapter.ts` — library

- **Function:** `evaluateDebtAdapter(input)` — Debt Adapter: `classifyDebtCost`
  (D3 bands) + `classifyDebtMateriality` (D4) → `calcCostMaterialityCap`
  (D6.2 continuous restriction) combined via `MIN` with `calcDebtBurdenCap`
  (D7/D8 affordability, evaluated current and stressed +200bp per D12.1) →
  `debtRiskFundingCap`, overridden to 0 on payment arrears/stress (D1).
- **Inputs:** `DebtAdapterInput` (effective cost %, ECB Deposit Facility Rate
  — caller-supplied, never hardcoded, since it's a temporal macro input per
  D3 — balances, sustainable income, essential expenses, rate type).
- **Outputs:** `DebtAdapterResult` (adds `meta`).
- **Consumers:** none yet — same reason as `safetyReserve.ts` above. See
  PORTIFY-KNOWLEDGE `04-financial-models/DEBT/DEBT-ADAPTER-V1.md`; maturity
  there is "CALIBRATED STRUCTURAL CORE / PARAMETER VALIDATION PENDING".
- **Tests:** `lib/models/debtAdapter.test.ts`.
- **Scope note:** D9/D10 (deriving `sustainableMonthlyIncome` from 12/24
  months of income history) is not implemented — this v1 accepts it as a
  direct input. D13 (RepaymentReturnEquivalent/REPAY_FIRST) and D14
  (persistence cycles) are also out of scope — they're repayment-recommendation
  logic, not the risk-cap calculation. See the file header for the full list.

## `lib/models/riskFundingGate.ts` — library

- **Function:** `evaluateRiskFundingGate(safety, debt)` — combines a
  `SafetyReserveResult` and a `DebtAdapterResult` into one
  `effectiveRiskFundingCap = MIN(safety.riskFundingCap, debt.debtRiskFundingCap)`,
  with `gateResult` precedence `BLOCK > CONDITIONAL > PASS` across both —
  the "Decision Oracle" pattern from PORTIFY-KNOWLEDGE §3B.1.
- **Inputs:** the two upstream results (no I/O of its own).
- **Outputs:** `RiskFundingGateResult` (adds `meta`).
- **Consumers:** none yet — depends on both upstream engines having a real
  caller first.
- **Tests:** `lib/models/riskFundingGate.test.ts`.

## `lib/models/performanceEngine.ts` — active

- **Function:** `evaluatePerformance(input)` — Performance Engine:
  `calcTWR` (chain-linked sub-period, unit-price method) + `calcXIRR`
  (Newton-Raphson with bisection fallback, treating the starting/ending
  `valuationSeries` values as an implicit initial outflow/terminal inflow
  alongside `externalFlows`) + `calcWealthChangeWaterfall` (arithmetic
  decomposition of start/end value against contributions/withdrawals).
- **Inputs:** `PerformanceInput` (`valuationSeries: ValuationPoint[]` —
  caller-assembled dated portfolio values, this module does no price/history
  I/O; `externalFlows: CashFlow[]` — contributions/withdrawals only, not
  buy/sell/dividend/interest).
- **Outputs:** `PerformanceResult` (adds `meta`).
- **Consumers:** `app/dashboard/performance/page.tsx` — **XIRR only, not
  TWR yet**. That page assembles a 2-point `valuationSeries` (account
  inception — value 0 — and today's `calcTotalValue()`) plus `externalFlows`
  from `deposit`-type transactions (`lib/db/transactions.ts`'s
  `getTransactions()`), giving a real "since inception" money-weighted
  return in place of the old `calcWeightedAvgDaysHeld`/`calcAnnualizedReturn`
  approximation. TWR still has no consumer — it needs a multi-point
  valuation series (historical prices across held *and* sold tickers),
  which is still out of scope; see the file header. The page labels the
  XIRR card as an estimate (`performanceXirrCaption` in `lib/dict/*.ts`),
  since inception is assumed at the earliest recorded transaction (may
  understate true inception for holdings imported without a matching
  deposit). See PORTIFY-KNOWLEDGE
  `04-financial-models/PERFORMANCE/PERFORMANCE-ENGINE-V1.md`
  §18 for the full spec; maturity there is engine-level `UNDEFINED`
  (RCR-002B/MODEL-016), not `PRODUCTION_APPROVED` — the UI treats the
  number as an estimate accordingly, never as confirmed.
- **Tests:** `lib/models/performanceEngine.test.ts`.
- **Scope note:** Gross/Net/after-tax return layers (needs a `fee`
  transaction type this app's schema doesn't have), Funding Ratio/Plan
  Progress (depends on Glide Path, itself unclosed — see
  `ALLOCATION-RISK-FEASIBILITY-V1.md` §8.1) and Benchmark Relative
  Performance (needs a benchmark series) are not implemented — see the
  file header for the full list.

## `lib/models/allocationRiskEngine.ts` — library

- **Function:** `evaluateAllocationRisk(input)` — Horizon Growth Cap + Risk
  Tolerance Growth Cap (band tables) combined via
  `riskAllowedPct = MIN(horizon, riskTolerance, objective, global)`, plus
  the Loss Capacity band's max stress-loss and Satellite Risk Budget
  (separate band tables).
- **Inputs:** `AllocationRiskInput` (`horizonYears`, `lossCapacity` (LC1-5),
  `riskTolerance` (RT1-5), `objectiveCapPct`/`globalCapPct` — these last two
  are caller-supplied direct inputs since PORTIFY-KNOWLEDGE doesn't give a
  table/formula for either, only for Horizon/LC/RT).
- **Outputs:** `AllocationRiskResult` (adds `meta`).
- **Consumers:** none yet. **Deliberately does not touch/reconcile
  `lib/planCalculator.ts`** — that module is **active** (wired to
  `plan-set`/`summary`/`app/profile/page.tsx`) and uses a different
  mechanism (a 0-100 `riskScore` → allocation band, not these Horizon/LC/RT
  bands). Reconciling the two would be a migration of a piece already in
  production — a separate, not-yet-started decision, not something this
  library module does on its own. See PORTIFY-KNOWLEDGE
  `04-financial-models/ALLOCATION/ALLOCATION-RISK-FEASIBILITY-V1.md`
  §7.4-7.6; bands there are "v1-draft", not `PRODUCTION_APPROVED`.
- **Tests:** `lib/models/allocationRiskEngine.test.ts`.
- **Scope note:** the §7.4 "stress test contra LC" (validating the
  resulting allocation against the Loss Capacity band's max stress loss)
  is not run here — it needs the portfolio stress engine, out of scope for
  the same reason as Safety Reserve §6.9. `lossCapacityMaxStressLossPct` is
  informative only.

## `lib/models/portfolioFitEngine.ts` — library

- **Function:** `evaluatePortfolioFit(input)` — plus standalone `calcHHI`/
  `calcEffectiveN` (concentration math), `calcExposureDelta` (before/after,
  including the §10 bootstrap-empty-portfolio case) and
  `calcWeightedOverlap` (overlap coefficient between two exposure vectors).
- **Inputs:** `PortfolioFitInput` — `dimensionScores` (5 values, each 0-1,
  **caller-supplied, not derived**: the spec names the 5 Portfolio Fit Score
  dimensions and their weights but gives a formula for none of them except
  the combination itself) and `riskBudgetCheck` (reuses an
  `AllocationRiskResult` from `lib/models/allocationRiskEngine.ts` —
  first engine in this sequence to compose with another instead of
  duplicating logic).
- **Outputs:** `PortfolioFitResult` — `score` (weighted 35/25/20/15/5% sum)
  plus `riskBudgetFail`/`satelliteBudgetFail`/`hardFail`. **No
  IMPROVES_PORTFOLIO/NEUTRAL_FIT/WORSENS_PORTFOLIO/FAIL classification** —
  PORTIFY-KNOWLEDGE explicitly leaves those thresholds `UNDEFINED` (§10.1),
  so this doesn't invent them.
- **Consumers:** none yet. See PORTIFY-KNOWLEDGE
  `04-financial-models/PORTFOLIO-FIT/PORTFOLIO-FIT-V1.md` §10.
- **Tests:** `lib/models/portfolioFitEngine.test.ts`.
- **Scope note:** `calcWeightedOverlap` uses `Σ min(wA_i, wB_i)` over the
  union of exposure keys — an implementation decision (a standard overlap
  coefficient), since the spec names the "Weighted Overlap" concept without
  giving its exact formula. Flagged in the file header, same discipline as
  `debtAdapter.ts`'s CostPressure interpolation.

## `lib/engines/*` — removed (2026-08-18)

"Portify Investment Engine v1.0" (`classification.ts`, `qualityEngine.ts`,
`riskEngine.ts`, `convictionEngine.ts`, `types.ts`) was a second, parallel
scoring implementation alongside `qualityScore.ts`/`riskScore.ts`, never
reconciled with it. Its only consumer was `app/api/asset-scores/route.ts`,
which had zero UI callers — confirmed dead code, not an in-progress
feature. Removed rather than kept as an unused parallel path, per the
cleanup that also unified the `AssetClass` type (previously declared
independently in this module too).

`supabase-migration-asset-scores.sql` (the `asset_scores` table this
module wrote to) is left in place as historical record — no database
schema change was made as part of this cleanup.

`qualityScore.ts`/`riskScore.ts` (documented above) remain the single,
active scoring implementation, feeding `recommendationEngine.ts` and the
live `/for-you` page.
