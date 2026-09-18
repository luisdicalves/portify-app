// Hardcoded-style ratchet — HARDSTYLE-006 enforcement.
//
// Two controls, and CI needs both:
//
//   1. SOURCE vs BASELINE (reuses compareToBaseline): the current tree may
//      not introduce a new signature or raise a signature's multiplicity
//      above what the committed baseline records.
//
//   2. BASELINE EVOLUTION: the committed baseline may not grow relative to
//      the baseline at the base revision (PR base / push "before"). Without
//      this, a developer could add a new violation AND add the same entry to
//      the baseline, and control 1 would pass. The baseline may only stay
//      equal or shrink.
//
// Together they also catch the inverse tricks: deleting a baseline entry
// while the violation remains, or lowering a multiplicity below reality,
// both surface in control 1 as new / increased debt.

import { execFileSync } from 'node:child_process';
import { buildBaseline, compareToBaseline, validateBaseline, DEFAULT_BASELINE_PATH } from './baseline.mjs';

const ZERO_SHA = /^0+$/;

/** Baseline-to-baseline comparison. Growth is the only forbidden direction. */
export function compareBaselines(previous, proposed) {
  const prev = new Map(previous.entries.map((e) => [e.signature, e]));
  const added = [];
  const increased = [];
  const decreased = [];
  for (const e of proposed.entries) {
    const p = prev.get(e.signature);
    if (!p) added.push(e);
    else if (e.multiplicity > p.multiplicity) increased.push({ entry: e, previous: p.multiplicity, proposed: e.multiplicity });
    else if (e.multiplicity < p.multiplicity) decreased.push({ entry: e, previous: p.multiplicity, proposed: e.multiplicity });
  }
  const next = new Set(proposed.entries.map((e) => e.signature));
  const removed = previous.entries.filter((p) => !next.has(p.signature));
  return { added, increased, decreased, removed, baselineGrew: added.length > 0 || increased.length > 0 };
}

/**
 * Reads the baseline as it existed at `ref`, via git. Fails CLOSED if the
 * revision itself is unavailable (e.g. not fetched) — an unverifiable base
 * must never be treated as "no base". Returns null only when the revision
 * exists but had no baseline file yet (the one-time introduction).
 */
export function loadBaselineAtRef(repoRoot, ref, path = DEFAULT_BASELINE_PATH) {
  if (!ref || ZERO_SHA.test(ref)) {
    throw new Error(`no usable baseline base revision (got "${ref ?? ''}")`);
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    throw new Error(`baseline base revision ${ref} is not available in this checkout (fetch it first)`);
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    return null;
  }
  const text = execFileSync('git', ['show', `${ref}:${path}`], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(text);
}

/**
 * Full ratchet evaluation. `previousBaseline` is the baseline at the base
 * revision, `null` when it did not exist yet (introduction), or `undefined`
 * when no base was supplied at all (local use; evolution not checked).
 *
 * @param {{ baseline: any, previousBaseline?: any, scan: any }} args
 * @returns {any}
 */
export function evaluateRatchet({ baseline, previousBaseline, scan }) {
  const validity = validateBaseline(baseline);
  const source = compareToBaseline(baseline, scan);

  const before = new Map(baseline.entries.map((e) => [e.signature, e]));
  const unchanged = buildBaseline(scan).entries.filter((e) => before.get(e.signature)?.multiplicity === e.multiplicity).length;

  let evolution;
  if (previousBaseline === undefined) evolution = { status: 'NOT_CHECKED' };
  else if (previousBaseline === null) evolution = { status: 'INTRODUCED' };
  else evolution = { status: 'CHECKED', ...compareBaselines(previousBaseline, baseline) };

  const failures = [];
  if (!validity.valid) failures.push('BASELINE_INVALID');
  if (source.newSignatures.length) failures.push('NEW_SIGNATURES');
  if (source.increased.length) failures.push('MULTIPLICITY_INCREASED');
  if (evolution.status === 'CHECKED') {
    if (evolution.added.length) failures.push('BASELINE_NEW_SIGNATURES');
    if (evolution.increased.length) failures.push('BASELINE_MULTIPLICITY_INCREASES');
  }

  return {
    result: failures.length ? 'FAIL' : 'PASS',
    failures,
    validity,
    source,
    unchanged,
    evolution,
    summary: {
      NEW: source.newSignatures.length,
      INCREASED: source.increased.length,
      UNCHANGED: unchanged,
      REDUCED: source.decreased.length,
      REMOVED: source.removed.length,
      BASELINE_NEW_SIGNATURES: evolution.status === 'CHECKED' ? evolution.added.length : 0,
      BASELINE_MULTIPLICITY_INCREASES: evolution.status === 'CHECKED' ? evolution.increased.length : 0,
    },
  };
}
