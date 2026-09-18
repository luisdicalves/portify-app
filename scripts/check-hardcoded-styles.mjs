#!/usr/bin/env node
// Hardcoded-style audit — Tranche A, REPORT ONLY.
//
// This command NEVER fails because the App contains existing debt: no
// approved baseline exists yet (HARDSTYLE-005/006 land in Tranche B, CI
// enforcement in Tranche C). It exits non-zero only if the scan itself
// cannot be completed.
//
//   npm run audit:hardcoded-styles
//   npm run audit:hardcoded-styles -- --format json
//   npm run audit:hardcoded-styles -- --rule TEXT_TYPOGRAPHY_LITERAL --limit 20

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository, STATUS, FINDING_IDENTITY_VERSION } from './lib/hardcoded-styles/index.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { format: 'text', rule: null, limit: 12 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--format') opts.format = argv[i + 1] ?? 'text';
    if (argv[i] === '--rule') opts.rule = argv[i + 1] ?? null;
    if (argv[i] === '--limit') opts.limit = Number(argv[i + 1] ?? 12);
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
  L.push(`  of which embed a raw colour literal .. ${c.blockedButEmbeddingColorLiteral}   (measured, NOT enforced — open question for Tranche B)`);
  L.push('');
  L.push('Compliance context — deliberately NOT merged (HARDSTYLE-002):');
  L.push(`  var() references that are anti-hardcoded compliant ... ${c.antiHardcodedCompliantReferences}`);
  L.push(`  of which canonical --ds-* references ................. ${c.canonicalDsReferences}`);
  L.push(`  legacy token definitions exempt per HARDSTYLE-003 .... ${c.legacyTokenDefinitions}`);
  L.push('');
  L.push('Token diagnostics for ENFORCED_V1 literals (diagnostic only — a match is still a finding):');
  for (const [k, n] of Object.entries(c.tokenMatches)) L.push(`  ${k.padEnd(24)} ${n}`);
  L.push('');

  let sample = result.findings.filter((f) => f.status === STATUS.ENFORCED_V1);
  if (opts.rule) sample = sample.filter((f) => f.rule === opts.rule);
  L.push(`Sample findings (${Math.min(opts.limit, sample.length)} of ${sample.length}):`);
  for (const f of sample.slice(0, opts.limit)) {
    const t = f.tokenMatch.kind === 'NO_TOKEN_MATCH'
      ? 'no token match'
      : `${f.tokenMatch.kind}: ${f.tokenMatch.canonical ?? f.tokenMatch.legacy}`;
    L.push(`  ${f.rule}`);
    L.push(`    ${f.repoRelativePath}:${f.line}:${f.column}  <${f.namedScope}>`);
    L.push(`    ${f.property}: ${f.normalizedValue}   [${t}]`);
  }
  L.push('');
  L.push('No baseline exists yet; existing debt does not fail this command.');
  return L.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = scanRepository(REPO_ROOT);
  } catch (err) {
    console.error('ERROR: hardcoded-style scan failed to complete.');
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
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
