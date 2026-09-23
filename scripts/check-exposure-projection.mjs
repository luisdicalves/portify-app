#!/usr/bin/env node
// Fail-closed gate for the vendored Runtime Exposure Projection (ORG-019, C1).
//
// Runs in the production build path, BEFORE `next build`, so no deployable
// build can be produced from an invalid or mismatched exposure artifact.
//
// Completely self-contained: no PORTIFY-KNOWLEDGE checkout, no network, no
// Portal, no Product authoring schemas. The committed vendor/ files plus this
// App's own source are sufficient. Refreshing those files is the separate job
// of scripts/sync-exposure-projection.mjs, which is never part of a build.
//
// This validates BUILD COMPATIBILITY. It is not runtime enforcement and it
// proves no ENFORCED_EXPOSURE: C1 has no runtime consumer at all.
//
// Usage: node scripts/check-exposure-projection.mjs [--root <dir>]

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVendoredExposure } from './lib/validate-exposure-projection.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag === -1 ? REPO_ROOT : argv[rootFlag + 1];

  const result = validateVendoredExposure(root);
  if (!result.ok) {
    console.error('Exposure projection check FAILED (closed) — no deployable build may be produced:');
    for (const problem of result.problems) console.error(`  - ${problem}`);
    return 1;
  }

  const { projection, lock, routes } = result;
  console.log(
    `Exposure projection check passed: scope ${projection.scopeId}, ` +
    `${projection.subjectCount} subject(s), contract ${projection.contractId} ${projection.contractVersion}, ` +
    `${result.contentHash}`,
  );
  console.log(`  locked to ${lock.sourceRepository} @ ${lock.knowledgeCommit}`);
  for (const route of routes) {
    console.log(`  ${route.screenId}  ${route.runtimeRoute}  ->  ${route.sourcePath}`);
  }
  console.log('  (build compatibility only — no runtime consumer, no enforcement)');
  return 0;
}

process.exit(main(process.argv.slice(2)));
