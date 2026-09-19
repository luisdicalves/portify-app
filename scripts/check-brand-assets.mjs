#!/usr/bin/env node
// Secretless CI gate for the vendored Brand snapshot (DS-RUNTIME-002 T1,
// APP_BRAND_VERSION_CHECK local consumer integrity). NO network access, NO
// credential awareness — reads only committed files in this repository.
// It proves the vendored snapshot is internally consistent, matches its lock,
// and that every bound runtime target is byte-identical to its canonical
// asset. It does NOT know whether PORTIFY-KNOWLEDGE has published something
// newer — that is the privileged sync's job (upstream freshness, T3).
//
//   npm run check:brand-assets

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBrandConsumer } from './lib/validate-brand-assets.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const { valid, errors, summary } = validateBrandConsumer({ root: REPO_ROOT });
  if (!valid) {
    console.error('BRAND ASSETS CHECK FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Brand assets check passed: vendored snapshot valid, contentHash and lock consistent, bound targets byte-identical.');
  console.log(`  registryVersion: ${summary.registryVersion}  schemaVersion: ${summary.schemaVersion}`);
  console.log(`  contentHash:     ${summary.contentHash}`);
  console.log(`  sourceCommit:    ${summary.sourceCommit}`);
  console.log(`  APPROVED assets vendored: ${summary.approvedAssets}  runtime bindings: ${summary.bindings}`);
  console.log('Note: this does NOT check whether PORTIFY-KNOWLEDGE has published a newer Brand snapshot — that is the privileged sync workflow\'s responsibility.');
}

main();
