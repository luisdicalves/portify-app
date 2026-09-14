#!/usr/bin/env node
// Privileged sync: refresh vendor/ from a LOCAL checkout of PORTIFY-KNOWLEDGE.
//
// This script never authenticates to anything and never sees
// KNOWLEDGE_REPO_TOKEN or any other credential. The calling workflow
// (.github/workflows/sync-design-tokens.yml) is responsible for
// authenticating and checking Knowledge out to a local path FIRST; this
// script only reads already-materialized local files and runs plain,
// secretless `git rev-parse` against that local checkout to learn its SHA.
//
// Usage: node scripts/sync-design-tokens.mjs --source <path-to-knowledge-checkout>
//
// Exits 0 with SYNC_RESULT=unchanged if the fetched artifact/schema content
// is byte-identical to what's already committed (an unrelated upstream
// commit must never trigger a noisy update — see Tranche 1B design record
// §13). Exits 0 with SYNC_RESULT=updated and writes the new vendor/ files +
// regenerates app/generated/design-tokens.css if content materially
// changed and passes validation. Exits 1 (writes nothing) if the freshly
// fetched content fails validation — never vendor something that fails its
// own contract.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVendoredArtifact } from './lib/validate-design-tokens.mjs';
import { generateCss } from './generate-design-tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

export const SOURCE_REPOSITORY = 'https://github.com/luisdicalves/PORTIFY-KNOWLEDGE';
const ARTIFACT_REL_PATH = '10-design/DESIGN-SYSTEM/ARTIFACT/dist';
const SCHEMAS_REL_PATH = '10-design/DESIGN-SYSTEM/ARTIFACT/schemas';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonIfExists(path) {
  return existsSync(path) ? readJson(path) : null;
}

/** Plain `git rev-parse HEAD` against an already-checked-out local
 * directory — no network, no credential, just reading local git state. */
export function resolveLocalHeadSha(checkoutPath) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkoutPath, encoding: 'utf8' }).trim();
}

function bytesEqual(a, b) {
  if (a === null || b === null) return a === b;
  return Buffer.compare(Buffer.from(JSON.stringify(a)), Buffer.from(JSON.stringify(b))) === 0;
}

/**
 * Core sync logic, fully parameterized so it can be pointed at temporary
 * fixture paths in tests without ever touching the real vendor/ tree.
 * Still takes no credential of any kind — `source` is assumed to already be
 * an authenticated, materialized local checkout.
 */
export function runSync({ source, vendorArtifactDir, lockPath, generatedCssPath }) {
  const fetchedManifest = readJson(join(source, ARTIFACT_REL_PATH, 'manifest.json'));
  const fetchedTokens = readJson(join(source, ARTIFACT_REL_PATH, 'tokens.json'));
  const fetchedManifestSchema = readJson(join(source, SCHEMAS_REL_PATH, 'manifest.schema.json'));
  const fetchedTokensSchema = readJson(join(source, SCHEMAS_REL_PATH, 'tokens.schema.json'));
  const distributionCommit = resolveLocalHeadSha(source);

  const candidateLock = {
    sourceRepository: SOURCE_REPOSITORY,
    distributionCommit,
    artifactVersion: fetchedManifest.artifactVersion,
    schemaVersion: fetchedManifest.schemaVersion,
    generatorVersion: fetchedManifest.generatorVersion,
    knowledgeCommit: fetchedManifest.knowledgeCommit,
    contentHash: fetchedManifest.contentHash,
    domainsIncluded: fetchedManifest.domainsIncluded,
  };

  const preflight = validateVendoredArtifact({
    manifest: fetchedManifest,
    tokens: fetchedTokens,
    manifestSchema: fetchedManifestSchema,
    tokensSchema: fetchedTokensSchema,
    lock: candidateLock,
  });
  if (!preflight.valid) {
    return { result: 'rejected', errors: preflight.errors };
  }

  const currentManifest = readJsonIfExists(join(vendorArtifactDir, 'manifest.json'));
  const currentTokens = readJsonIfExists(join(vendorArtifactDir, 'tokens.json'));
  const currentManifestSchema = readJsonIfExists(join(vendorArtifactDir, 'manifest.schema.json'));
  const currentTokensSchema = readJsonIfExists(join(vendorArtifactDir, 'tokens.schema.json'));

  const materiallyUnchanged =
    bytesEqual(fetchedManifest, currentManifest) &&
    bytesEqual(fetchedTokens, currentTokens) &&
    bytesEqual(fetchedManifestSchema, currentManifestSchema) &&
    bytesEqual(fetchedTokensSchema, currentTokensSchema);

  if (materiallyUnchanged) {
    return { result: 'unchanged', distributionCommit };
  }

  writeFileSync(join(vendorArtifactDir, 'manifest.json'), JSON.stringify(fetchedManifest, null, 2) + '\n', 'utf8');
  writeFileSync(join(vendorArtifactDir, 'tokens.json'), JSON.stringify(fetchedTokens, null, 2) + '\n', 'utf8');
  writeFileSync(join(vendorArtifactDir, 'manifest.schema.json'), JSON.stringify(fetchedManifestSchema, null, 2) + '\n', 'utf8');
  writeFileSync(join(vendorArtifactDir, 'tokens.schema.json'), JSON.stringify(fetchedTokensSchema, null, 2) + '\n', 'utf8');
  writeFileSync(lockPath, JSON.stringify(candidateLock, null, 2) + '\n', 'utf8');
  writeFileSync(generatedCssPath, generateCss({ manifest: fetchedManifest, tokens: fetchedTokens }), 'utf8');

  return { result: 'updated', distributionCommit, knowledgeCommit: fetchedManifest.knowledgeCommit, contentHash: fetchedManifest.contentHash };
}

function parseArgs(argv) {
  const sourceIdx = argv.indexOf('--source');
  if (sourceIdx === -1 || !argv[sourceIdx + 1]) {
    throw new Error('usage: sync-design-tokens.mjs --source <path-to-local-knowledge-checkout>');
  }
  return { source: argv[sourceIdx + 1] };
}

function main() {
  const { source } = parseArgs(process.argv.slice(2));
  const outcome = runSync({
    source,
    vendorArtifactDir: join(REPO_ROOT, 'vendor', 'design-system'),
    lockPath: join(REPO_ROOT, 'vendor', 'design-tokens.lock.json'),
    generatedCssPath: join(REPO_ROOT, 'app', 'generated', 'design-tokens.css'),
  });

  if (outcome.result === 'rejected') {
    console.error('ERROR: freshly fetched artifact failed validation — refusing to update vendor/.');
    for (const err of outcome.errors) console.error(`  - ${err}`);
    process.exitCode = 1;
    return;
  }

  if (outcome.result === 'unchanged') {
    console.log('SYNC_RESULT=unchanged');
    console.log('No relevant artifact/schema content changed — vendor/ and the lock file are left untouched (distributionCommit-only churn is not a reason to update).');
    return;
  }

  console.log('SYNC_RESULT=updated');
  console.log(`  distributionCommit: ${outcome.distributionCommit}`);
  console.log(`  knowledgeCommit:    ${outcome.knowledgeCommit}`);
  console.log(`  contentHash:        ${outcome.contentHash}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
