#!/usr/bin/env node
// Privileged Brand sync: refresh vendor/brand/ from a LOCAL checkout of
// PORTIFY-KNOWLEDGE (Brand Consumer Contract v1, DIRECT_CANONICAL_DISTRIBUTION).
//
// Like scripts/sync-design-tokens.mjs, this script never authenticates to
// anything and never sees KNOWLEDGE_REPO_TOKEN: the calling workflow checks
// Knowledge out first; this script only reads local files and runs plain,
// secretless git commands against that local checkout. The checkout must
// have full history, because sourceCommit is derived from it (see below).
//
// Usage: node scripts/sync-brand-assets.mjs --source <path-to-knowledge-checkout>
//
// Outcomes:
//   SYNC_RESULT=unchanged — the snapshot bytes (registry, schema, every
//     APPROVED asset) are identical to what is vendored. Nothing is written,
//     and the lock's sourceCommit is NOT refreshed just because Knowledge HEAD
//     moved: unrelated upstream commits never churn the lock.
//   SYNC_RESULT=updated — the snapshot changed materially and the staged
//     candidate passed the full consumer-integrity check. The snapshot, lock
//     and already-bound runtime targets are written.
//   rejected (exit 1) — the candidate failed validation, or a current binding
//     would no longer resolve. Nothing is written.
//
// brand-consumption.json is never modified: adding, removing or retargeting a
// runtime binding is placement and needs a reviewed source change.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_PATH_PREFIX, PATHS, distributableAssets, validateBrandConsumer, vendoredPathFor,
} from './lib/validate-brand-assets.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_REPOSITORY = 'https://github.com/luisdicalves/PORTIFY-KNOWLEDGE';
const REGISTRY_SOURCE = `${CANONICAL_PATH_PREFIX}registry.json`;
const SCHEMA_SOURCE = `${CANONICAL_PATH_PREFIX}registry.schema.json`;

/** @param {string} cwd @param {string[]} args @returns {string} */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * The most recent source commit that changed any file of the distributed
 * snapshot (registry, schema, APPROVED asset files) — the stable identity of
 * the snapshot bytes, independent of unrelated commits. Requires full history.
 * @param {string} source @param {string[]} snapshotPaths @returns {string}
 */
export function resolveSnapshotSourceCommit(source, snapshotPaths) {
  if (git(source, ['rev-parse', '--is-shallow-repository']) === 'true') {
    throw new Error('source checkout is shallow; sourceCommit needs full history (checkout with fetch-depth: 0)');
  }
  const sha = git(source, ['log', '-1', '--format=%H', '--', ...snapshotPaths]);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('could not resolve the snapshot source commit');
  return sha;
}

/** @param {string} path @returns {Buffer | null} */
function readIfExists(path) {
  return existsSync(path) ? readFileSync(path) : null;
}

/**
 * Core sync, parameterized for fixtures. Takes no credential.
 * @param {{ source: string, repoRoot: string }} args
 * @returns {{ result: 'unchanged' | 'updated' | 'rejected', errors?: string[], sourceCommit?: string, contentHash?: string, updatedTargets?: string[] }}
 */
export function runBrandSync({ source, repoRoot }) {
  const registryBytes = readFileSync(join(source, REGISTRY_SOURCE));
  const schemaBytes = readFileSync(join(source, SCHEMA_SOURCE));
  const registry = JSON.parse(registryBytes.toString('utf8'));
  const approved = distributableAssets(registry);

  /** @type {Map<string, Buffer>} vendored relative path -> fetched bytes */
  const files = new Map([[PATHS.registry, registryBytes], [PATHS.registrySchema, schemaBytes]]);
  /** @type {string[]} */
  const errors = [];
  for (const a of approved) {
    const rel = vendoredPathFor(a.sourcePath);
    if (!rel) { errors.push(`asset ${a.assetId}: unsafe sourcePath ${a.sourcePath}`); continue; }
    const abs = join(source, a.sourcePath);
    if (!existsSync(abs)) { errors.push(`asset ${a.assetId}: missing in source (${a.sourcePath})`); continue; }
    files.set(rel, readFileSync(abs));
  }
  if (errors.length) return { result: 'rejected', errors };

  // Material-change rule: compare exact bytes of the whole snapshot, and the
  // set of vendored files (a removed/added APPROVED asset is material too).
  const currentLock = readIfExists(join(repoRoot, PATHS.lock));
  const vendoredNow = vendoredSnapshotFiles(repoRoot);
  const sameSet = vendoredNow.size === files.size && [...files.keys()].every((k) => vendoredNow.has(k));
  const unchanged = currentLock !== null && sameSet &&
    [...files].every(([rel, bytes]) => { const cur = readIfExists(join(repoRoot, rel)); return cur !== null && cur.equals(bytes); });
  if (unchanged) return { result: 'unchanged' };

  const snapshotPaths = [REGISTRY_SOURCE, SCHEMA_SOURCE, ...approved.map((/** @type {any} */ a) => a.sourcePath)];
  const sourceCommit = resolveSnapshotSourceCommit(source, snapshotPaths);
  const lock = {
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit,
    registryVersion: registry.registryVersion,
    schemaVersion: registry.schemaVersion,
    contentHash: registry.contentHash,
    assetCount: approved.length,
  };
  const lockBytes = Buffer.from(JSON.stringify(lock, null, 2) + '\n', 'utf8');

  // Refresh already-bound targets only; the bindings themselves are untouched.
  const consumption = JSON.parse(readFileSync(join(repoRoot, PATHS.consumption), 'utf8'));
  const byId = new Map(registry.assets.map((/** @type {any} */ a) => [a.assetId, a]));
  /** @type {Map<string, Buffer>} */
  const targets = new Map();
  for (const b of consumption.bindings ?? []) {
    const asset = /** @type {any} */ (byId.get(b.assetId));
    const rel = asset && asset.status === 'APPROVED' ? vendoredPathFor(asset.sourcePath) : null;
    if (!rel || !files.has(rel)) {
      return { result: 'rejected', errors: [`binding ${b.target} -> ${b.assetId} no longer resolves to an APPROVED asset; a reviewed binding change is required`] };
    }
    targets.set(b.target, /** @type {Buffer} */ (files.get(rel)));
  }

  // Pre-flight: stage the candidate and run the same secretless check CI runs.
  const stage = mkdtempSync(join(tmpdir(), 'brand-sync-'));
  try {
    const write = (/** @type {string} */ rel, /** @type {Buffer} */ bytes) => {
      mkdirSync(dirname(join(stage, rel)), { recursive: true });
      writeFileSync(join(stage, rel), bytes);
    };
    for (const [rel, bytes] of files) write(rel, bytes);
    write(PATHS.lock, lockBytes);
    write(PATHS.consumption, readFileSync(join(repoRoot, PATHS.consumption)));
    write(PATHS.consumptionSchema, readFileSync(join(repoRoot, PATHS.consumptionSchema)));
    for (const [rel, bytes] of targets) write(rel, bytes);
    const check = validateBrandConsumer({ root: stage });
    if (!check.valid) return { result: 'rejected', errors: check.errors };

    rmSync(join(repoRoot, PATHS.assetsDir), { recursive: true, force: true });
    cpSync(join(stage, 'vendor', 'brand'), join(repoRoot, 'vendor', 'brand'), { recursive: true });
    writeFileSync(join(repoRoot, PATHS.lock), lockBytes);
    /** @type {string[]} */
    const updatedTargets = [];
    for (const [rel, bytes] of targets) {
      const cur = readIfExists(join(repoRoot, rel));
      if (!cur || !cur.equals(bytes)) { writeFileSync(join(repoRoot, rel), bytes); updatedTargets.push(rel); }
    }
    return { result: 'updated', sourceCommit, contentHash: registry.contentHash, updatedTargets };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** Currently vendored snapshot files (registry, schema, assets), repo-relative.
 * @param {string} repoRoot @returns {Set<string>} */
function vendoredSnapshotFiles(repoRoot) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const rel of [PATHS.registry, PATHS.registrySchema]) if (existsSync(join(repoRoot, rel))) out.add(rel);
  const walk = (/** @type {string} */ relDir) => {
    if (!existsSync(join(repoRoot, relDir))) return;
    for (const entry of readdirSync(join(repoRoot, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel); else out.add(rel);
    }
  };
  walk(PATHS.assetsDir);
  return out;
}

function main() {
  const i = process.argv.indexOf('--source');
  if (i === -1 || !process.argv[i + 1]) throw new Error('usage: sync-brand-assets.mjs --source <path-to-local-knowledge-checkout>');
  const outcome = runBrandSync({ source: process.argv[i + 1], repoRoot: REPO_ROOT });
  if (outcome.result === 'rejected') {
    console.error('ERROR: Brand sync rejected — nothing was written.');
    for (const e of outcome.errors ?? []) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  if (outcome.result === 'unchanged') {
    console.log('SYNC_RESULT=unchanged');
    console.log('Brand snapshot bytes unchanged — vendor/brand/, the lock and bound targets are left untouched (Knowledge HEAD moving is not a reason to update).');
    return;
  }
  console.log('SYNC_RESULT=updated');
  console.log(`  sourceCommit: ${outcome.sourceCommit}`);
  console.log(`  contentHash:  ${outcome.contentHash}`);
  console.log(`  bound targets refreshed: ${(outcome.updatedTargets ?? []).join(', ') || '(none)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
