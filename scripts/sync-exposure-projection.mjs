#!/usr/bin/env node
// Refresh vendor/exposure/ from a LOCAL checkout of PORTIFY-KNOWLEDGE.
//
// Direction is one-way and non-negotiable: PORTIFY-KNOWLEDGE -> portify-app.
// The App never authors a Runtime Exposure Projection and never writes back.
// The vendored copy is a DERIVED, NON-AUTHORITATIVE locked input; canonical
// Product truth (the Exposure Scope and its Exposure Decision records) stays
// in Knowledge and is never read by this App.
//
// Like the sibling sync scripts this takes no credential: the caller is
// responsible for materializing the Knowledge checkout first, and this reads
// only already-local files plus a secretless `git rev-parse` for its SHA.
//
// Sync is NOT part of any build. Builds consume the already-committed vendor
// artifacts; see scripts/check-exposure-projection.mjs.
//
// Usage: node scripts/sync-exposure-projection.mjs --source <path-to-knowledge-checkout>
//                                                  [--scope EXS-001] [--root <dir>]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateProjection, sha256OfBytes, PROJECTION_REL_PATH, LOCK_REL_PATH,
} from './lib/validate-exposure-projection.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

export const SOURCE_REPOSITORY = 'https://github.com/luisdicalves/PORTIFY-KNOWLEDGE';
const DEFAULT_SCOPE_ID = 'EXS-001';

/** Where the canonical generated projection lives inside Knowledge. The scope
 *  is named EXPLICITLY — there is deliberately no "newest scope" discovery and
 *  no filename-ordering inference (ORG-015/019). */
export function knowledgeProjectionRelPath(scopeId) {
  return join('10-design', 'SCREENS', 'EXPOSURE', 'scopes', scopeId, 'generated',
    `RUNTIME-EXPOSURE-PROJECTION-${scopeId}.json`);
}

export function resolveLocalHeadSha(checkoutPath) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkoutPath, encoding: 'utf8' }).trim();
}

/** Canonical lock serialization: stable key order, no wall clock, no hostname,
 *  no local path — two syncs of the same commit produce identical bytes. */
export function serializeLock(lock) {
  const ordered = {};
  for (const key of Object.keys(lock).sort()) ordered[key] = lock[key];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function buildLock({ projectionBytes, projection, knowledgeCommit, generator }) {
  return {
    sourceRepository: SOURCE_REPOSITORY,
    knowledgeCommit,
    scopeId: projection.scopeId,
    projectionContractVersion: projection.contractVersion,
    generatorId: generator.generatorId,
    generatorVersion: generator.generatorVersion,
    contentHash: sha256OfBytes(projectionBytes),
    subjectCount: projection.subjectCount,
  };
}

/** Read generator identity from the canonical Knowledge factory rather than
 *  re-declaring its semantics here — the App must not become a second source
 *  of provenance metadata. */
export function readGeneratorIdentity(sourcePath) {
  const modulePath = join(sourcePath, '10-design', 'SCREENS', 'EXPOSURE', 'exposure_contracts.py');
  const text = readFileSync(modulePath, 'utf8');
  const id = text.match(/^GENERATOR_ID\s*=\s*"([^"]+)"/m);
  const version = text.match(/^GENERATOR_VERSION\s*=\s*"([^"]+)"/m);
  if (!id || !version) throw new Error(`cannot read generator identity from ${modulePath}`);
  return { generatorId: id[1], generatorVersion: version[1] };
}

export function sync({ sourcePath, scopeId = DEFAULT_SCOPE_ID, repoRoot = REPO_ROOT, knowledgeCommit = null }) {
  const projectionPath = join(sourcePath, knowledgeProjectionRelPath(scopeId));
  if (!existsSync(projectionPath)) {
    throw new Error(`canonical Projection not found for scope ${scopeId} at ${projectionPath}`);
  }

  // Validate BEFORE writing anything — never vendor an artifact that fails its
  // own contract, and never leave a half-updated vendor tree behind.
  const projectionBytes = readFileSync(projectionPath);
  const problems = [];
  const projection = validateProjection(projectionBytes, problems);
  if (problems.length > 0) {
    throw new Error(`refusing to vendor an invalid Projection:\n  - ${problems.join('\n  - ')}`);
  }
  if (projection.scopeId !== scopeId) {
    throw new Error(`Projection scopeId ${projection.scopeId} does not match requested scope ${scopeId}`);
  }

  const commit = knowledgeCommit ?? resolveLocalHeadSha(sourcePath);
  const lock = buildLock({
    projectionBytes,
    projection,
    knowledgeCommit: commit,
    generator: readGeneratorIdentity(sourcePath),
  });
  const lockBytes = Buffer.from(serializeLock(lock), 'utf8');

  const outProjection = join(repoRoot, PROJECTION_REL_PATH);
  const outLock = join(repoRoot, LOCK_REL_PATH);
  const previous = existsSync(outProjection) ? readFileSync(outProjection) : null;
  const previousLock = existsSync(outLock) ? readFileSync(outLock) : null;
  if (previous && previousLock && previous.equals(projectionBytes) && previousLock.equals(lockBytes)) {
    return { result: 'unchanged', lock, contentHash: lock.contentHash };
  }

  // Both outputs are fully prepared above; they are written back to back so a
  // new Projection is never deliberately paired with an old lock. Any residual
  // mismatch is caught fail-closed by check-exposure-projection.mjs.
  mkdirSync(dirname(outProjection), { recursive: true });
  writeFileSync(outProjection, projectionBytes);   // byte-for-byte, never re-serialized
  writeFileSync(outLock, lockBytes);
  return { result: 'updated', lock, contentHash: lock.contentHash };
}

function main(argv) {
  const sourceFlag = argv.indexOf('--source');
  if (sourceFlag === -1 || !argv[sourceFlag + 1]) {
    console.error('Usage: node scripts/sync-exposure-projection.mjs --source <path-to-knowledge-checkout> [--scope EXS-001] [--root <dir>]');
    return 2;
  }
  const scopeFlag = argv.indexOf('--scope');
  const rootFlag = argv.indexOf('--root');
  try {
    const outcome = sync({
      sourcePath: argv[sourceFlag + 1],
      scopeId: scopeFlag === -1 ? DEFAULT_SCOPE_ID : argv[scopeFlag + 1],
      repoRoot: rootFlag === -1 ? REPO_ROOT : argv[rootFlag + 1],
    });
    console.log(`SYNC_RESULT=${outcome.result}`);
    console.log(`  scope ${outcome.lock.scopeId}, ${outcome.lock.subjectCount} subject(s), ${outcome.contentHash}`);
    console.log(`  knowledgeCommit ${outcome.lock.knowledgeCommit}`);
    return 0;
  } catch (error) {
    console.error(`exposure projection sync FAILED: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('sync-exposure-projection.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
