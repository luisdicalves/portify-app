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

## XTB import: preview and duplicate reconciliation

`app/profile/settings/page.tsx`'s "Importar Portfólio" flow no longer writes
to Supabase the moment a file is chosen. It's now two explicit phases — see
[import-xtb.md](import-xtb.md) for the full flow, validation rules, and
duplicate policy:

- **`lib/holdingsImport.ts`** gained a `previewFile()` entry point that
  parses, validates every row, and detects duplicates, returning a typed
  `ImportPreview` — nothing is saved. The XTB "CASH OPERATION HISTORY" path
  now validates **per row** (`mapXtbRowToTransaction()`): a bad row becomes
  an `'error'`-status `ImportPreviewRow` with `issues` explaining why,
  instead of being silently dropped like before this task. The generic
  `ticker,units,avg_price` CSV/XLSX path still validates the whole file
  atomically (one file-level error, not per-row) — a known, documented
  limitation, not addressed here.
- **Duplicates are detected two ways** (within the uploaded file, and
  against the user's already-saved transactions, when the caller supplies
  them) using a business-field key (date/type/ticker/units/price/amount) —
  deliberately not just `external_id`, so it also catches a collision
  against a manually-entered trade. **Duplicates are ignored by default**;
  the confirm step only ever writes `'valid'`/`'warning'` rows.
- The legacy `parseFile()`/`parseXlsxFile()`/`parseHoldingsCsv()` functions
  are unchanged in behavior (same exact output for the same input — see
  `lib/holdingsImport.test.ts`) and still exist; `previewFile()` is
  additive, not a replacement.
- **Now has a persistent audit log** (added in a later task — see the next
  section): every *confirmed* import creates a row in
  `public.import_audit_logs`, and its transactions are tagged with
  `import_id`. `portfolioState.ts` and `recommendationEngine.ts` remain
  untouched; the holdings-replacement-on-confirm semantics (file replaces
  the position snapshot, no merge with existing DB holdings) are unchanged
  from before either of these two import tasks.

## XTB import: persistent audit log

Every confirmed import (not the preview step — previewing still saves
nothing) now creates a row in `public.import_audit_logs` before any
holdings/transactions write happens, and updates it to its final status
(`completed`/`partial`/`failed`) once the write is known. Full detail —
schema, RLS, status lifecycle, file-hash policy, and what is/isn't stored —
is in [import-xtb.md](import-xtb.md#audit-log-persistente).

- **Schema:** `supabase-migration-import-audit-log.sql` (new table +
  `transactions.import_id`, nullable FK), consolidated into
  `supabase-schema.sql`. Also fixes a pre-existing bug found while building
  this: `transactions`' `type` check constraint only allowed `'wht'`, not
  `'withholding_tax'` (which the app has always written) — see
  import-xtb.md for the full story.
- **Deploy readiness:** the schema/code exist in this repo, and **the
  migration has now been applied to and fully validated against a real,
  explicitly-confirmed staging project** (`portify`, 2026-07-10 — see the
  runbook's "Staging validation log" for the complete result: schema/RLS/
  constraints all match, `database.types.ts` regenerated byte-identical, a
  real end-to-end XTB import including `withholding_tax` confirmed in the
  database, RLS confirmed with two real users). **Production has not been
  touched** — see
  [import-audit-migration-runbook.md](import-audit-migration-runbook.md) for
  the apply/verify/rollback steps and
  [release-checklist.md](release-checklist.md#import-audit-log-release-checklist)
  for what's still required there. Until migrated in a given environment,
  imports there fail closed (abort, nothing written, friendly error) rather
  than silently succeeding without an audit trail — this is what staging
  validation just confirmed works as designed.
- **Supabase environment guardrails** were added (`chore/supabase-environment-guardrails`)
  precisely because of the gap above: [docs/supabase-environments.md](supabase-environments.md)
  defines local/staging/production and the naming/`SUPABASE_ENVIRONMENT`
  convention, and `npm run check:supabase-env`
  ([scripts/check-supabase-environment.mjs](../scripts/check-supabase-environment.mjs))
  refuses to let a migration or `database.types.ts` regeneration proceed
  against an ambiguous project. This is distinct from `npm run check:schema`
  ([scripts/check-import-audit-schema.mjs](../scripts/check-import-audit-schema.mjs)),
  which validates the *static structure* (migration/schema/types agree with
  each other) — `check:supabase-env` validates the *operational context*
  (which real project a sensitive command is about to run against) before
  such a command is allowed.
- **`ImportPreview.importId` is still not populated by the parser** — the
  parser stays fully decoupled from persistence (no import from
  `lib/db/importAudit.ts`, verified by the existing purity test). The
  created audit log's `id` is surfaced directly by
  `app/profile/settings/page.tsx` after a successful confirm, not threaded
  back through the preview type.
- **No raw file content is ever stored** — `filename` is a bare name
  (`File.name`, never a path), and `file_hash` fingerprints parsed content
  (via `lib/models/modelMeta.ts`'s `createInputHash()`), never file bytes.
- **`lib/db/importAudit.ts`** (new) holds all the persistence logic:
  `createImportAuditLog`/`completeImportAuditLog`/`failImportAuditLog`/
  `listImportAuditLogs`/`getImportAuditLog`, plus two pure, unit-tested
  helpers (`determineImportStatus`, `computeImportFileHash`) and a pure
  payload builder (`buildImportAuditLogInsert`).
- `app/profile/settings/page.tsx` also gained a minimal read-only "Últimas
  importações" list (last 5, via `listImportAuditLogs()`) — no new page,
  reusing the existing Card/SettingsRow visual language.

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
