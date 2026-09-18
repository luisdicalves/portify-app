// Hardcoded-style baseline — HARDSTYLE-005 (representation) and
// HARDSTYLE-006 (ratchet semantics).
//
// The baseline is a sorted JSON record of the ENFORCED_V1 debt that existed
// when it was approved. Each entry carries its full, human-reviewable
// identity — not just an opaque hash — plus a mandatory multiplicity, so a
// second identical occurrence in the same named scope is still detectable.
//
// Deliberately absent: timestamps, line/column, raw source text, and any
// self-referential App commit SHA. None of them may participate in identity,
// and all of them would churn the file without any change in debt.

import { FINDING_IDENTITY_VERSION, STATUS, stableSignature } from './index.mjs';
import { RULES } from './taxonomy.mjs';

export const BASELINE_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_BASELINE_PATH = 'hardcoded-styles.baseline.json';

/** The only rules that may ever enter baseline v1 (HARDSTYLE-012 ENFORCED_V1). */
export const BASELINE_RULES = Object.freeze([
  RULES.BORDER_RADIUS_LITERAL,
  RULES.RAW_VISUAL_COLOR_LITERAL,
  RULES.SPACING_LITERAL,
  RULES.TEXT_TYPOGRAPHY_LITERAL,
].sort());

/** Identity fields, in canonical order, followed by multiplicity. */
const IDENTITY_FIELDS = ['rule', 'repoRelativePath', 'namedScope', 'contextKind', 'property', 'normalizedValue'];
const ENTRY_FIELDS = Object.freeze(['signature', ...IDENTITY_FIELDS, 'multiplicity']);

function compareEntries(a, b) {
  for (const k of IDENTITY_FIELDS) {
    if (a[k] < b[k]) return -1;
    if (a[k] > b[k]) return 1;
  }
  return 0;
}

/**
 * Only ENFORCED_V1 findings of the four approved rules become baseline
 * entries. REVIEW_REQUIRED, MEASURE_ONLY and BLOCKED findings — including
 * HARDSTYLE-013 embedded-literal diagnostics, which are BLOCKED by status —
 * are excluded by construction, never by a filter someone could forget.
 */
export function buildBaseline(scanResult) {
  if (scanResult.identityVersion !== FINDING_IDENTITY_VERSION) {
    throw new Error(`scan identity version ${scanResult.identityVersion} != ${FINDING_IDENTITY_VERSION}`);
  }
  const entries = scanResult.signatures
    .filter((s) => s.status === STATUS.ENFORCED_V1 && BASELINE_RULES.includes(s.rule))
    .map((s) => {
      const e = {};
      for (const k of ENTRY_FIELDS) e[k] = s[k];
      return e;
    })
    .sort(compareEntries);

  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    findingIdentityVersion: FINDING_IDENTITY_VERSION,
    policy: { rules: [...BASELINE_RULES] },
    entries,
  };
}

/** Canonical bytes: 2-space JSON, key order as built, trailing newline. */
export function serializeBaseline(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/**
 * Structural and semantic validation. Pass `scanResult` to also assert the
 * baseline accounts for exactly the current ENFORCED_V1 debt.
 */
export function validateBaseline(baseline, { scanResult = null } = {}) {
  const errors = [];
  const fail = (m) => errors.push(m);

  if (!baseline || typeof baseline !== 'object') return { valid: false, errors: ['baseline is not an object'] };
  const topKeys = Object.keys(baseline).sort().join(',');
  if (topKeys !== 'entries,findingIdentityVersion,policy,schemaVersion') fail(`unexpected top-level keys: ${topKeys}`);
  if (baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) fail(`unrecognised schemaVersion ${baseline.schemaVersion}`);
  if (baseline.findingIdentityVersion !== FINDING_IDENTITY_VERSION) {
    fail(`findingIdentityVersion ${baseline.findingIdentityVersion} != scanner ${FINDING_IDENTITY_VERSION}`);
  }
  const rules = baseline.policy && Array.isArray(baseline.policy.rules) ? [...baseline.policy.rules].sort() : null;
  if (!rules || rules.join(',') !== BASELINE_RULES.join(',')) fail('policy.rules must be exactly the four approved v1 rules');
  if (!Array.isArray(baseline.entries)) return { valid: false, errors: [...errors, 'entries must be an array'] };

  const seen = new Set();
  baseline.entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    const keys = Object.keys(e).join(',');
    if (keys !== ENTRY_FIELDS.join(',')) fail(`${at}: fields must be exactly ${ENTRY_FIELDS.join(',')} (got ${keys})`);
    if (!BASELINE_RULES.includes(e.rule)) fail(`${at}: rule ${e.rule} is not baseline-eligible`);
    if (!Number.isInteger(e.multiplicity) || e.multiplicity < 1) fail(`${at}: multiplicity must be an integer >= 1`);
    if (stableSignature(e) !== e.signature) fail(`${at}: signature does not recompute from identity fields`);
    if (seen.has(e.signature)) fail(`${at}: duplicate signature ${e.signature}`);
    seen.add(e.signature);
    if (i > 0 && compareEntries(baseline.entries[i - 1], e) >= 0) fail(`${at}: entries are not strictly sorted`);
  });

  if (scanResult) {
    const enforced = scanResult.counts.enforcedV1;
    const sigs = scanResult.counts.enforcedV1Signatures;
    const total = baseline.entries.reduce((n, e) => n + e.multiplicity, 0);
    if (baseline.entries.length !== sigs) fail(`entry count ${baseline.entries.length} != ENFORCED_V1 signatures ${sigs}`);
    if (total !== enforced) fail(`total multiplicity ${total} != ENFORCED_V1 findings ${enforced}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * HARDSTYLE-006 ratchet comparison. Report-only in this tranche: nothing here
 * fails CI. A future enforcement step fails when `debtIncreased` is true.
 */
export function compareToBaseline(baseline, scanResult) {
  const before = new Map(baseline.entries.map((e) => [e.signature, e]));
  const current = buildBaseline(scanResult).entries;
  const after = new Map(current.map((e) => [e.signature, e]));

  const newSignatures = current.filter((e) => !before.has(e.signature));
  const increased = [];
  const decreased = [];
  for (const e of current) {
    const b = before.get(e.signature);
    if (!b) continue;
    if (e.multiplicity > b.multiplicity) increased.push({ entry: e, baseline: b.multiplicity, current: e.multiplicity });
    if (e.multiplicity < b.multiplicity) decreased.push({ entry: e, baseline: b.multiplicity, current: e.multiplicity });
  }
  // Absent entries are debt that was removed. They do NOT fail ordinary CI;
  // pruning them from the baseline is an explicit reviewed operation.
  const removed = baseline.entries.filter((e) => !after.has(e.signature));

  return {
    newSignatures,
    increased,
    decreased,
    removed,
    debtIncreased: newSignatures.length > 0 || increased.length > 0,
    debtReduced: decreased.length > 0 || removed.length > 0,
  };
}
