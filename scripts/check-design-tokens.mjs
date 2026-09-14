#!/usr/bin/env node
// Secretless CI gate for the vendored design-token snapshot. NO network
// access, NO credential awareness — everything here reads only the
// already-committed vendor/ and app/generated/ files. This proves the
// vendored snapshot is internally consistent and that the committed
// generated CSS actually matches what regenerating from it produces
// (INTERNAL drift). It cannot and does not claim to know whether
// PORTIFY-KNOWLEDGE has published something newer — that is a separate
// concern, owned by the privileged sync workflow (see the Tranche 1B
// design record §11: APP_UPSTREAM_ARTIFACT_FRESHNESS_CHECK is not this).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVendoredArtifact } from './lib/validate-design-tokens.mjs';
import { generateCss } from './generate-design-tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(REPO_ROOT, 'vendor');
const VENDOR_ARTIFACT_DIR = join(VENDOR_DIR, 'design-system');
const COMMITTED_CSS_PATH = join(REPO_ROOT, 'app', 'generated', 'design-tokens.css');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadVendoredArtifact() {
  return {
    manifest: readJson(join(VENDOR_ARTIFACT_DIR, 'manifest.json')),
    tokens: readJson(join(VENDOR_ARTIFACT_DIR, 'tokens.json')),
    manifestSchema: readJson(join(VENDOR_ARTIFACT_DIR, 'manifest.schema.json')),
    tokensSchema: readJson(join(VENDOR_ARTIFACT_DIR, 'tokens.schema.json')),
    lock: readJson(join(VENDOR_DIR, 'design-tokens.lock.json')),
  };
}

function main() {
  const artifact = loadVendoredArtifact();
  const problems = [];

  // 1-6, 9-10: schema validity, lock/manifest consistency, provenance,
  // contentHash, supported schemaVersion, Light/Dark parity, spacing set.
  const { valid, errors } = validateVendoredArtifact(artifact);
  if (!valid) problems.push(...errors.map((e) => `[validation] ${e}`));

  // 7: deterministic generation — two independent in-memory runs must agree.
  const runA = generateCss(artifact);
  const runB = generateCss(artifact);
  if (runA !== runB) {
    problems.push('[determinism] two generation runs against the same vendored input produced different output');
  }

  // 8: committed-output drift — the committed CSS must match what
  // regenerating from the committed vendor/ snapshot produces right now.
  let committedCss;
  try {
    committedCss = readFileSync(COMMITTED_CSS_PATH, 'utf8');
  } catch {
    problems.push(`[drift] committed file missing: ${COMMITTED_CSS_PATH} — run \`npm run generate:design-tokens\` and commit its output`);
  }
  if (committedCss !== undefined && committedCss !== runA) {
    problems.push('[drift] app/generated/design-tokens.css does not match what the vendored snapshot currently produces — run `npm run generate:design-tokens` and commit the result');
  }

  if (problems.length) {
    console.error('DESIGN TOKEN CHECK FAILED:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log('Design token check passed: vendored snapshot valid, generation deterministic, committed CSS matches (no internal drift).');
  console.log('Note: this does NOT check whether PORTIFY-KNOWLEDGE has published a newer artifact — that is the privileged sync workflow\'s responsibility.');
}

main();
