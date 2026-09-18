#!/usr/bin/env node
// Hardcoded-style scanner CLI. Two modes, one entrypoint, one scanner.
//
// AUDIT (default) — report only. Never fails because debt exists.
//   npm run audit:hardcoded-styles [-- --format json] [-- --rule R --limit N]
//
// RATCHET (--ratchet) — HARDSTYLE-006 enforcement, used by CI.
//   npm run check:hardcoded-styles [-- --baseline-base <git-ref>] [--require-baseline-base]
//   Fails on: a new signature, an increased multiplicity, an invalid
//   baseline, or baseline growth relative to the base revision. Debt that
//   is reduced or removed passes and is reported. The base revision may
//   also come from the HARDSTYLE_BASELINE_BASE environment variable.
//
// Both modes exit non-zero if the scan itself cannot be completed or
// trusted (ScanIntegrityError): an unreadable file is never "clean".
// Neither mode ever writes the baseline; that is baseline:hardcoded-styles.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { scanRepository, STATUS, FINDING_IDENTITY_VERSION } from './lib/hardcoded-styles/index.mjs';
import { DEFAULT_BASELINE_PATH } from './lib/hardcoded-styles/baseline.mjs';
import { evaluateRatchet, loadBaselineAtRef } from './lib/hardcoded-styles/ratchet.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = {
    format: 'text', rule: null, limit: 12,
    ratchet: false, baseline: DEFAULT_BASELINE_PATH,
    baselineBase: process.env.HARDSTYLE_BASELINE_BASE || null, requireBaselineBase: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--format') opts.format = argv[i + 1] ?? 'text';
    if (argv[i] === '--rule') opts.rule = argv[i + 1] ?? null;
    if (argv[i] === '--limit') opts.limit = Number(argv[i + 1] ?? 12);
    if (argv[i] === '--ratchet') opts.ratchet = true;
    if (argv[i] === '--baseline') opts.baseline = argv[i + 1] ?? DEFAULT_BASELINE_PATH;
    if (argv[i] === '--baseline-base') opts.baselineBase = argv[i + 1] ?? null;
    if (argv[i] === '--require-baseline-base') opts.requireBaselineBase = true;
  }
  return opts;
}

function renderText(result, opts) {
  const c = result.counts;
  const L = [];
  L.push('HARDCODED STYLE AUDIT — report only (no baseline, no enforcement)');
  L.push(`identity version: ${result.identityVersion}    files scanned: ${result.filesScanned}`);
  L.push('');
  L.push(`ENFORCED_V1 findings ....... ${c.enforcedV1} across ${c.enforcedV1Files} files`);
  for (const [rule, n] of Object.entries(c.byRule).sort()) L.push(`    ${rule.padEnd(28)} ${n}`);
  L.push(`  stable signatures ........ ${c.enforcedV1Signatures} (enforced) / ${c.totalSignatures} (all)`);
  L.push(`  total multiplicity ....... ${c.totalMultiplicity}`);
  L.push('');
  L.push(`REVIEW_REQUIRED ............ ${c.reviewRequired}   (geometry + dynamic expressions; not enforced in v1)`);
  L.push(`MEASURE_ONLY ............... ${c.measureOnly}`);
  L.push(`BLOCKED_BY_MISSING_CANONICAL_TOKEN ... ${c.blockedByMissingCanonicalToken}   (elevation, interaction)`);
  L.push(`  of which embed a raw colour literal .. ${c.blockedButEmbeddingColorLiteral}   (diagnostic only — never enforced, HARDSTYLE-013)`);
  L.push('');
  L.push('Compliance context — deliberately NOT merged (HARDSTYLE-002):');
  L.push(`  var() references that are anti-hardcoded compliant ... ${c.antiHardcodedCompliantReferences}`);
  L.push(`  of which canonical --ds-* references ................. ${c.canonicalDsReferences}`);
  L.push(`  legacy token definitions exempt per HARDSTYLE-003 .... ${c.legacyTokenDefinitions}`);
  L.push('');
  L.push('Token diagnostics for ENFORCED_V1 literals (diagnostic only — a match is still a finding;');
  L.push('counts are independent, not mutually exclusive — one literal may match both):');
  for (const [k, n] of Object.entries(c.tokenMatches)) L.push(`  ${k.padEnd(24)} ${n}`);
  L.push('');

  let sample = result.findings.filter((f) => f.status === STATUS.ENFORCED_V1);
  if (opts.rule) sample = sample.filter((f) => f.rule === opts.rule);
  L.push(`Sample findings (${Math.min(opts.limit, sample.length)} of ${sample.length}):`);
  for (const f of sample.slice(0, opts.limit)) {
    const parts = [];
    if (f.tokenMatch.canonical) parts.push(`canonical ${f.tokenMatch.canonical}`);
    if (f.tokenMatch.legacy) parts.push(`legacy ${f.tokenMatch.legacy}`);
    const t = parts.length ? parts.join(' + ') : 'no token match';
    L.push(`  ${f.rule}`);
    L.push(`    ${f.repoRelativePath}:${f.line}:${f.column}  <${f.namedScope}>`);
    L.push(`    ${f.property}: ${f.normalizedValue}   [${t}]`);
  }
  L.push('');
  L.push('Report only: existing debt does not fail this command.');
  return L.join('\n');
}

function tokenLabel(f) {
  if (!f || !f.tokenMatch) return '';
  const parts = [];
  if (f.tokenMatch.canonical) parts.push(`canonical ${f.tokenMatch.canonical}`);
  if (f.tokenMatch.legacy) parts.push(`legacy ${f.tokenMatch.legacy}`);
  return parts.length ? `  [${parts.join(' + ')}]` : '';
}

function renderRatchet(ev, scan, opts) {
  const firstBySig = new Map();
  for (const f of scan.findings) if (!firstBySig.has(f.signature)) firstBySig.set(f.signature, f);
  const L = [];
  const line = (e, extra) => {
    const f = firstBySig.get(e.signature);
    const at = f ? `${e.repoRelativePath}:${f.line}:${f.column}` : e.repoRelativePath;
    L.push(`  ${e.rule}  ${at}  <${e.namedScope}>`);
    L.push(`    ${e.property}: ${e.normalizedValue}   ${extra}${tokenLabel(f)}`);
  };
  const bounded = (items, render) => {
    for (const it of items.slice(0, opts.limit)) render(it);
    if (items.length > opts.limit) L.push(`  ... and ${items.length - opts.limit} more`);
  };

  L.push('HARDCODED STYLE RATCHET (HARDSTYLE-006)');
  L.push(`baseline: ${opts.baseline}    base revision: ${opts.baselineBase ?? '(none)'}    evolution: ${ev.evolution.status}`);
  L.push('');
  if (ev.source.newSignatures.length) {
    L.push(`NEW — debt not in the baseline (${ev.source.newSignatures.length}):`);
    bounded(ev.source.newSignatures, (e) => line(e, `current ${e.multiplicity} / baseline 0`));
    L.push('');
  }
  if (ev.source.increased.length) {
    L.push(`INCREASED — more occurrences than the baseline allows (${ev.source.increased.length}):`);
    bounded(ev.source.increased, (d) => line(d.entry, `current ${d.current} / baseline ${d.baseline}`));
    L.push('');
  }
  if (ev.evolution.status === 'CHECKED' && ev.evolution.baselineGrew) {
    L.push('BASELINE GROWTH — the baseline itself may only stay equal or shrink:');
    bounded(ev.evolution.added, (e) => line(e, `added to baseline (x${e.multiplicity})`));
    bounded(ev.evolution.increased, (d) => line(d.entry, `baseline ${d.previous} -> ${d.proposed}`));
    L.push('');
  }
  if (!ev.validity.valid) {
    L.push('BASELINE INVALID:');
    for (const e of ev.validity.errors.slice(0, opts.limit)) L.push(`  - ${e}`);
    L.push('');
  }
  if (ev.source.decreased.length || ev.source.removed.length) {
    L.push(`DEBT_REDUCED — ${ev.source.decreased.length} reduced, ${ev.source.removed.length} removed (passes; pruning the baseline is a separate reviewed step).`);
    L.push('');
  }
  const s = ev.summary;
  L.push(`NEW: ${s.NEW}   INCREASED: ${s.INCREASED}   UNCHANGED: ${s.UNCHANGED}   REDUCED: ${s.REDUCED}   REMOVED: ${s.REMOVED}`);
  L.push(`BASELINE_NEW_SIGNATURES: ${s.BASELINE_NEW_SIGNATURES}   BASELINE_MULTIPLICITY_INCREASES: ${s.BASELINE_MULTIPLICITY_INCREASES}`);
  L.push(`RESULT: ${ev.result}${ev.failures.length ? `  (${ev.failures.join(', ')})` : ''}`);
  return L.join('\n');
}

function runRatchet(scan, opts) {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(join(REPO_ROOT, opts.baseline), 'utf8'));
  } catch (err) {
    console.error(`ERROR: cannot read baseline ${opts.baseline}: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  let previousBaseline;
  if (opts.baselineBase) {
    try {
      previousBaseline = loadBaselineAtRef(REPO_ROOT, opts.baselineBase, opts.baseline);
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  } else if (opts.requireBaselineBase) {
    console.error('ERROR: --require-baseline-base set but no base revision given (--baseline-base / HARDSTYLE_BASELINE_BASE).');
    process.exitCode = 1;
    return;
  }
  const ev = evaluateRatchet({ baseline, previousBaseline, scan });
  console.log(renderRatchet(ev, scan, opts));
  if (ev.result !== 'PASS') process.exitCode = 1;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = scanRepository(REPO_ROOT);
  } catch (err) {
    console.error(err && err.name === 'ScanIntegrityError'
      ? 'ERROR: hardcoded-style scan is not trustworthy — a file could not be fully read or parsed.'
      : 'ERROR: hardcoded-style scan failed to complete.');
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
    return;
  }

  if (opts.ratchet) {
    runRatchet(result, opts);
    return;
  }

  if (opts.format === 'json') {
    // Deterministic: sorted, and carrying no timestamp.
    process.stdout.write(`${JSON.stringify({
      identityVersion: FINDING_IDENTITY_VERSION,
      filesScanned: result.filesScanned,
      counts: result.counts,
      signatures: result.signatures,
    }, null, 2)}\n`);
    return;
  }
  console.log(renderText(result, opts));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
