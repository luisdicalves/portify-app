# Model governance — versioning, meta, coverage, confidence

This document explains the governance layer added on top of the Portify models
(`lib/planCalculator.ts`, `lib/riskScore.ts`, `lib/qualityScore.ts`,
`lib/recommendationEngine.ts`, `lib/cashFlowForecast.ts`,
`lib/portfolio/portfolioState.ts`). It covers **what** was added,
**why**, and the policy for future changes. It does not change any scoring
formula, weight, or threshold — see [current-state.md](current-state.md) for
what has and hasn't been migrated in terms of actual calculation logic.

For a per-file map of every model in the codebase (not just the six covered
here), see [model-map.md](model-map.md).

## The building block: `lib/models/modelMeta.ts`

```ts
export interface ModelRunMeta {
  modelName: ModelName;
  modelVersion: ModelVersion;
  generatedAt: string;   // ISO 8601 — when this run was produced
  dataAsOf: string;      // ISO 8601 — freshness of the input data used
  inputHash: string;     // deterministic fingerprint of the input
  assumptions: string[]; // plain-language fallbacks/defaults applied
  warnings: string[];    // plain-language notes about degraded data/coverage
}
```

`createModelRunMeta({ modelName, input, ... })` builds one of these. It's a
plain, JSON-serializable object — safe to include directly in an API
response.

- **modelName / modelVersion** — see "Model versions" below. `modelVersion`
  can be overridden per-call (mainly for tests); otherwise it's read from the
  `MODEL_VERSIONS` map in `modelMeta.ts`.
- **generatedAt** — wall-clock time the specific call ran, always live
  (`new Date().toISOString()` unless a `now` clock is injected for tests).
- **dataAsOf** — defaults to `generatedAt`. Models that have a genuinely
  distinct "snapshot" timestamp for their input data (e.g. a cached Finnhub
  fetch, a stale quote) should pass their own `dataAsOf` instead — none of the
  six models currently do, since none of them carry an explicit snapshot
  timestamp on their input today. This is a hook for later, not a claim that
  it's wired up yet.
- **inputHash** — see below.
- **assumptions** — things the model always does that a consumer might not
  expect (e.g. "missing metrics count as neutral, not penalized"). These are
  present on every run, not just degraded ones.
- **warnings** — things that are wrong or degraded *this specific run*
  (missing data, upstream API failures, low coverage). Empty array when
  nothing is wrong.

### `createInputHash()` — what it is and isn't

`createInputHash(input)` returns a short deterministic string fingerprint of
whatever `input` was passed to `createModelRunMeta`. Two calls with the same
logical input (regardless of object-key order) produce the same hash; a
different input produces a different hash.

**This is explicitly not a cryptographic hash.** It's a 32-bit rolling hash
(the same technique already used for the recommendations ETag in
`app/api/recommendations/route.ts`'s `makeETag`) over a key-sorted JSON
serialization. It has no collision resistance guarantees and must never be
used for anything security-sensitive (integrity verification, auth, cache
poisoning prevention). It exists purely so two `ModelRunMeta` objects can be
compared cheaply to tell "was this produced from the same input" apart for
debugging/telemetry purposes.

This design was deliberate, not a shortcut: `planCalculator.ts` and
`qualityScore.ts` run in client components as well as server code, so
Node's `crypto` module (not consistently bundleable client-side) and Web
Crypto's `crypto.subtle` (async-only, while these are synchronous pure
functions) were both ruled out. If a genuine cryptographic hash is ever
needed, it should be computed server-side only, outside these shared pure
functions.

## Model versions

| Model | Version | Where |
|---|---|---|
| `portfolioState` | `1.0.0` | `lib/portfolio/portfolioState.ts` |
| `planCalculator` | `1.0.0` | `lib/planCalculator.ts` |
| `riskScore` | `1.0.0` | `lib/riskScore.ts` |
| `qualityScore` | `1.0.0` | `lib/qualityScore.ts` |
| `cashFlowForecast` | `1.0.0` | `lib/cashFlowForecast.ts` |
| `recommendationEngine` | `3.1.0` | `lib/recommendationEngine.ts` |

`recommendationEngine` starts at `3.0.0` rather than `1.0.0` because the file
already documented itself as "modelo v3.0" (the `preferred_asset_classes`
rollout, see [current-state.md](current-state.md) and the PR history) before
this task — the version constant here just makes that existing, already-true
version machine-readable instead of introducing a new number. It moved to
`3.1.0` (minor bump) when `Recommendation.explanation` was added — a purely
additive, backwards-compatible field, not a formula/weight/threshold change,
so a minor bump rather than major (see policy below).

**Policy for future changes:** any change to a model's formula, weights, or
thresholds (e.g. `WEIGHTS` in `planCalculator.ts`/`qualityScore.ts`, the
`band()` threshold tables in `riskScore.ts`, `matchScore`/`finalScore` in
`recommendationEngine.ts`) **must** bump the corresponding entry in
`MODEL_VERSIONS` (`lib/models/modelMeta.ts`). Bug fixes that restore intended
behavior (not a deliberate formula change) don't require a bump on their own
judgement call — but if in doubt, bump it; a spurious version bump is much
cheaper than a silent, undetectable scoring change. Follow semver loosely:
patch for bug fixes, minor for additive/backwards-compatible behavior
changes, major for anything that changes historical scores in a way a
consumer would need to know about.

## `score` vs `confidence` vs `coverageStatus`

These three are easy to conflate but answer different questions:

- **`score`** (e.g. `RiskReport.score`, `ScoreBreakdown.total`) — the model's
  opinion, given whatever data it had. It is never withheld or replaced with
  `null` just because some inputs were missing — missing inputs fall back to
  a neutral value (see `NEUTRAL`/`band()`) rather than penalizing or
  inflating the result. **A score by itself tells you nothing about how much
  real data went into it.**
- **`confidence`** (`qualityScore.ts`'s `ScoreBreakdown.confidence`:
  `'high' | 'medium' | 'low'`) — how much of the *input* was actually
  available, independent of what the score came out to. Derived from
  `coverageRatio` (available fields ÷ total tracked fields): `>= 0.75` → high,
  `>= 0.45` → medium, else low. A `total` of 80 with `confidence: 'low'` means
  "the formula says 80, but it only had a couple of real inputs to work
  with — treat it skeptically."
- **`coverageStatus`** (`riskScore.ts`'s `RiskReport.coverageStatus`:
  `'full' | 'partial' | 'unavailable'`) — the equivalent idea for
  `fetchRiskReport()`, plus `coverageReason` explaining *why* (`US_EQUITY`,
  `NON_US_EQUITY`, `NO_FUNDAMENTALS`, `API_ERROR`, `ETF_LIMITED_DATA`,
  `UNKNOWN`). `coverageReason` is always set, even when `coverageStatus` is
  `'full'` (as `US_EQUITY`) — it's a classification, not only an excuse for
  gaps.

**Important asymmetry:** `fetchRiskReport()` can still return `null` for a
total failure (no API key, failed fetch, unknown ticker/no company profile)
— that case is unchanged and is *not* represented as
`coverageStatus: 'unavailable'` inside an object, because there is no object.
Existing `if (!report) ...` callers keep working exactly as before.
`coverageStatus`/`coverageReason` only describe *partial* degradation within
a report that was successfully produced.

**`ETF_LIMITED_DATA` is reserved, not computed.** `fetchRiskReport()` has no
asset-class context (it only receives a ticker + language), so it cannot
itself tell an ETF from a small, thinly-covered stock. This reason exists in
the type for a future caller that merges a `RiskReport` with asset-class
information it already has (e.g. `assetUniverse.ts`/`recommendationEngine.ts`,
which do know `assetClass`) and wants to relabel a partial/unavailable
coverage as "this is an ETF, fundamentals-style scoring doesn't really apply"
instead of "no fundamentals found". No current caller does this yet.

### A fourth signal: `Recommendation.explanation.dataConfidence`

`lib/recommendationEngine.ts`'s `Recommendation.explanation.dataConfidence`
(`'high' | 'medium' | 'low'`, built by
[lib/recommendationExplanation.ts](../lib/recommendationExplanation.ts)'s
`inferDataConfidence()`) is the same idea again, one level further out: how
much you should trust the *specific recommendation shown to this user*, not
just one asset's fundamentals. It's a simple, explicitly documented heuristic
rather than a reuse of `qualityScore.ts`'s `confidence` — no
`confidence`/`coverageStatus` field is threaded onto `CandidateAsset` yet, so
there's nothing upstream to reuse today. It downgrades one level each for:
a stock candidate missing `pillarHealthScore` (no `RiskReport` backed it —
ETFs/bond ETFs are never penalized for lacking this, since they don't carry
pillar data by design); an owned position whose weight came from the
average-cost fallback instead of a live quote; and a data-quality warning
that specifically names this ticker.

**Policy — informative only, same as `confidence`/`coverageStatus`:**
`dataConfidence` (like `qualityScore.ts`'s `confidence` before it) currently
has **zero effect on `finalScore`, ranking, or `suggestedAmount`** — it is
surfaced to the user (see `app/for-you/page.tsx`'s "Confiança dos dados" row)
purely so they can weigh a recommendation themselves. The same applies to
`scoreBreakdown.diversificationImpact`: it decomposes `currentWeight`/
`targetWeight` into a 0–100 explanatory number but is never added into
`finalScore`. **Any future change that has `dataConfidence` or
`diversificationImpact` actually influence ranking, filtering, or
`suggestedAmount` is a real model-behavior change and must bump
`MODEL_VERSIONS.recommendationEngine`** (a minor bump if still additive/
backwards-compatible in shape, a major bump if it changes which
recommendations appear or in what order for existing users) — per the
general versioning policy above.

## `qualityScore.ts` has two different "quality scores" — only one got confidence

`lib/qualityScore.ts` exports two genuinely different functions and this task
only touched one of them:

- **`calcQualityScore(metrics: StockMetrics): ScoreBreakdown`** — the
  metrics-based, per-dimension breakdown (health/growth/profitability/
  stability). This is the one that gained `confidence`, `missingMetrics`,
  `availableMetrics`, `coverageRatio`, and `meta`.
- **`calcQualityScoreFromReport(report: RiskReport, profile: UserProfile): number`**
  — a completely different pipeline that derives a personalized score from an
  already-built `RiskReport` + user profile, and returns a plain `number`.
  This is what `app/api/recommendations/route.ts` actually calls
  (`calcQualityScoreFromReport(report, userProfile)`), and its result flows
  straight into `CandidateAsset.qualityScore` (typed `number` in
  `assetUniverse.ts`) and then into `recommendationEngine.ts`'s
  `finalScore = matchScore × 0.6 + qualityScore × 0.4`. Changing its return
  shape to an object would ripple into the recommendation engine's actual
  math, which is explicitly out of scope for this task ("não alterar
  algoritmo de matchScore/finalScore"). It still returns a plain number,
  unchanged.

**Practical consequence:** confidence/coverage signaling from this task does
not currently reach `app/for-you` (the recommendations UI) — it's only
visible on `calcQualityScore`'s direct output today. Wiring
`calcQualityScoreFromReport` (or its caller) to also surface confidence is a
reasonable follow-up, not done here.

**`confidence` is informative only, for now.** Per this task's scope, no
model's weights are adjusted based on `confidence` — a `low`-confidence
`ScoreBreakdown.total` is computed exactly the same way as a `high`-confidence
one (missing fields default to `NEUTRAL = 50`, same as before this task).
Whether/how to have `recommendationEngine.ts` discount low-confidence assets
in `finalScore` is a future decision, not made here.

## `portfolioState.ts` deliberately has no `meta` field

Every other model above got a `meta?: ModelRunMeta` field on its output.
`lib/portfolio/portfolioState.ts`'s `PortfolioState` does not, on purpose:

`buildPortfolioState()` is a pure, synchronous function, and
`portfolioState.test.ts` has an explicit test for that —
`'is deterministic for the same input'` calls it twice with the same
arguments and asserts `toEqual`. `ModelRunMeta.generatedAt` is a live
wall-clock timestamp by design (`new Date().toISOString()`); attaching it to
`PortfolioState`'s return value would make two calls a millisecond apart
produce different output, silently breaking that purity guarantee the test
exists to protect — and `buildPortfolioState()` runs on every Dashboard and
Portfolio render, so this isn't a hypothetical edge case.

`portfolioState` still has a registered version (`1.0.0` in
`MODEL_VERSIONS`) for governance bookkeeping and shows up in
[model-map.md](model-map.md) like every other model — it just doesn't carry a
live `ModelRunMeta` object on its return value. A caller that wants a
`ModelRunMeta` alongside a `buildPortfolioState()` call can construct one
itself with `createModelRunMeta({ modelName: 'portfolioState', input })`
without that timestamp leaking into the pure function's own return value.

## Feeding a caller's own warnings into `meta.warnings`: `RecommendOptions.externalWarnings`

`recommendationEngine.ts` must stay pure — no API/Supabase/network calls inside
it (see [model-map.md](model-map.md)). But its caller,
`app/api/recommendations/route.ts`, builds a `portfolioState` (via
`buildPortfolioState()`) before calling `recommend()`, and that step can
produce its own `dataQualityWarnings` (e.g. a missing quote falling back to
average cost). Those are exactly the kind of thing `meta.warnings` exists to
surface, so `RecommendOptions` has an `externalWarnings?: string[]` field:
the caller passes in plain warning strings it already computed (no I/O, just
data), and `recommend()` merges them into its own `meta.warnings` alongside
`paceAlert`/`outOfPlanHoldings` warnings it generates itself.

**Policy:** this pattern — a plain `string[]` passed in by the caller and
merged into `meta.warnings` — is the sanctioned way for a pure model to
surface a caller's upstream warnings without becoming impure itself. Don't
have a model reach out and fetch/compute those warnings on its own; require
the caller to pass them in as already-computed strings.

## Backwards compatibility

Every field this task added is **additive**:

- `meta` is optional (`meta?: ModelRunMeta`) on every output type it was
  added to. Nothing renames or removes an existing field, and no API
  response shape changes incompatibly — `meta` (and, on `RiskReport`,
  `coverageStatus`/`coverageReason`) just appear as new keys in the same JSON
  object.
- `RiskReport.coverageStatus`/`coverageReason` are non-optional on the type
  (every real `fetchRiskReport()` call sets them), but adding a required
  field to a type only affects code that *constructs* a `RiskReport` literal
  from scratch — the only place in the codebase that did so besides
  `riskScore.ts` itself was a test fixture in `qualityScore.test.ts`, which
  was updated alongside this change. No runtime consumer (the `/api/risk`
  route, `useAssetDetail.ts`, `components/ui/RiskReport.tsx`,
  `recommendationEngine.ts`) constructs one — they only ever read whatever
  `fetchRiskReport()` produced, so they're unaffected either way.
