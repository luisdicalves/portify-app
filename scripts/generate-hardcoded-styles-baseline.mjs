#!/usr/bin/env node
// Generates the hardcoded-style baseline candidate (HARDSTYLE-005).
//
//   npm run baseline:hardcoded-styles -- --dry-run     # report only, writes nothing
//   npm run baseline:hardcoded-styles                  # writes hardcoded-styles.baseline.json
//   npm run baseline:hardcoded-styles -- --out <path>
//
// Secretless and offline: it reads only the App checkout and the already
// vendored canonical artifact. It never commits, never fetches Knowledge,
// and never touches application source.
//
// The tree is scanned TWICE and the baseline is written only if both scans
// produce byte-identical output. A single scan can be fooled by files that
// are still being materialised (e.g. iCloud dataless placeholders); two
// agreeing scans, each already integrity-checked, cannot silently disagree.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './lib/hardcoded-styles/index.mjs';
import {
  buildBaseline, serializeBaseline, validateBaseline, DEFAULT_BASELINE_PATH,
} from './lib/hardcoded-styles/baseline.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { dryRun: false, out: DEFAULT_BASELINE_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    if (argv[i] === '--out') opts.out = argv[i + 1] ?? DEFAULT_BASELINE_PATH;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let first;
  let second;
  let scan;
  try {
    scan = scanRepository(REPO_ROOT);
    first = serializeBaseline(buildBaseline(scan));
    second = serializeBaseline(buildBaseline(scanRepository(REPO_ROOT)));
  } catch (err) {
    console.error('ERROR: could not scan the App reliably; no baseline written.');
    console.error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (first !== second) {
    console.error('ERROR: two consecutive scans disagreed; the tree is not stable. No baseline written.');
    process.exitCode = 1;
    return;
  }

  const baseline = JSON.parse(first);
  const { valid, errors } = validateBaseline(baseline, { scanResult: scan });
  if (!valid) {
    console.error('ERROR: generated baseline failed validation; no baseline written.');
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const total = baseline.entries.reduce((n, e) => n + e.multiplicity, 0);
  const hash = createHash('sha256').update(first).digest('hex');
  console.log(`entries: ${baseline.entries.length}   total multiplicity: ${total}`);
  console.log(`content sha256: ${hash}`);

  if (opts.dryRun) {
    console.log('dry run — nothing written.');
    return;
  }
  writeFileSync(join(REPO_ROOT, opts.out), first);
  console.log(`written: ${opts.out} (not committed)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
