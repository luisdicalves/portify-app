/**
 * lib/models/modelMeta.ts
 *
 * Shared governance/versioning metadata attached to the outputs of the core
 * models (planCalculator, riskScore, qualityScore, recommendationEngine,
 * cashFlowForecast, portfolioState). See docs/model-governance.md for the
 * versioning policy and docs/model-map.md for where each model lives.
 */

export type ModelName =
  | 'planCalculator'
  | 'riskScore'
  | 'qualityScore'
  | 'recommendationEngine'
  | 'cashFlowForecast'
  | 'portfolioState';

export type ModelVersion = string;

// Bump the relevant entry whenever a model's formula, weights, or thresholds
// change — see docs/model-governance.md's "policy for future changes".
export const MODEL_VERSIONS: Record<ModelName, ModelVersion> = {
  planCalculator: '1.0.0',
  riskScore: '1.0.0',
  qualityScore: '1.0.0',
  recommendationEngine: '3.1.0', // 3.0.0 -> 3.1.0: additive Recommendation.explanation (RecommendationExplanation) — no formula/weight/threshold change, see docs/model-governance.md
  cashFlowForecast: '1.0.0',
  portfolioState: '1.0.0',
};

export interface ModelRunMeta {
  modelName: ModelName;
  modelVersion: ModelVersion;
  /** ISO 8601 timestamp — when this specific run/output was produced. */
  generatedAt: string;
  /** ISO 8601 timestamp/date — freshness of the input data this run used. Defaults to generatedAt when the model has no distinct data snapshot. */
  dataAsOf: string;
  /** Deterministic, non-cryptographic fingerprint of the input — see createInputHash(). */
  inputHash: string;
  /** Plain-language notes about fallbacks/defaults applied for this run. */
  assumptions: string[];
  /** Plain-language notes about degraded data/coverage for this run. */
  warnings: string[];
}

export interface CreateModelRunMetaOptions {
  modelName: ModelName;
  /** The input this run was computed from — hashed via createInputHash(), never stored verbatim. */
  input: unknown;
  /** Overrides MODEL_VERSIONS[modelName] — mainly for tests. */
  modelVersion?: ModelVersion;
  /** Defaults to generatedAt when the model has no distinct data snapshot timestamp. */
  dataAsOf?: string;
  assumptions?: string[];
  warnings?: string[];
  /** Injectable clock, for deterministic tests. */
  now?: () => Date;
}

export function createModelRunMeta(opts: CreateModelRunMetaOptions): ModelRunMeta {
  const now = opts.now ?? (() => new Date());
  const generatedAt = now().toISOString();

  return {
    modelName: opts.modelName,
    modelVersion: opts.modelVersion ?? MODEL_VERSIONS[opts.modelName],
    generatedAt,
    dataAsOf: opts.dataAsOf ?? generatedAt,
    inputHash: createInputHash(opts.input),
    assumptions: opts.assumptions ?? [],
    warnings: opts.warnings ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// createInputHash — deterministic, non-cryptographic fingerprint
// ─────────────────────────────────────────────────────────────────────────
//
// NOT a cryptographic hash — no collision-resistance guarantees, do not use
// it for anything security-sensitive (integrity checks, auth, etc). It only
// needs to answer "was this meta produced from the same logical input" cheaply
// and deterministically, for debugging/telemetry/cache-busting purposes.
//
// Several of the models this attaches to (planCalculator, qualityScore) run
// in client components as well as server code, so this deliberately avoids
// Node's `crypto` module (not consistently available/bundleable client-side)
// and Web Crypto's `crypto.subtle` (async-only, while these are synchronous,
// pure functions). Instead it reuses the same 32-bit rolling-hash approach
// already used for the recommendations ETag (see makeETag in
// app/api/recommendations/route.ts) over a key-sorted JSON serialization, so
// the same logical input hashes the same regardless of key insertion order.
export function createInputHash(input: unknown): string {
  const raw = stableStringify(input);
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(k => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${entries.join(',')}}`;
}
