// Fail-closed validation for the vendored Runtime Exposure Projection and its
// companion lock (ORG-019 / PRT-CAP-APP-C1).
//
// The vendored projection is a DERIVED, NON-AUTHORITATIVE copy of canonical
// Product truth that lives in PORTIFY-KNOWLEDGE. This module never authors
// exposure semantics and never interprets the Product AUTHORING contracts
// (Exposure Scope, Exposure Decision, Capability Exposure Manifest) — it
// validates only the Runtime Exposure Projection's own runtime contract, the
// lock, and whether this App source can actually serve the projected routes.
//
// Nothing here is consumed at runtime. C1 has no runtime consumer: no
// resolver, no middleware, no navigation integration. This is build tooling.
//
// No network, no Knowledge checkout, no credentials — it reads only files it
// is handed, so the same functions serve the real committed paths and
// throwaway fixture directories in tests.

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The single Runtime Exposure Projection contract this App supports.
 *  An unknown contractId or contractVersion FAILS — no forward-compatibility
 *  heuristics, no "probably close enough" version ranges (ORG-019). */
export const SUPPORTED_CONTRACT_ID = 'RUNTIME-EXPOSURE-PROJECTION-V1';
export const SUPPORTED_CONTRACT_VERSIONS = ['1.0.0'];

export const PROJECTION_REL_PATH = 'vendor/exposure/RUNTIME-EXPOSURE-PROJECTION.json';
export const LOCK_REL_PATH = 'vendor/exposure.lock.json';

const PROJECTION_TOP_LEVEL_KEYS = ['contractId', 'contractVersion', 'scopeId', 'subjectCount', 'subjects'];
const SUBJECT_KEYS = ['binding', 'decisionId', 'intendedExposure', 'runtimeRoute', 'screenId'];
const BINDING_KEYS = ['effectiveFromAppSha', 'screenId'];
const LOCK_KEYS = [
  'contentHash', 'generatorId', 'generatorVersion', 'knowledgeCommit',
  'projectionContractVersion', 'scopeId', 'sourceRepository', 'subjectCount',
];

/** ORG-013: these two are the ONLY Product polarity values. OUT_OF_SCOPE and
 *  SYSTEM_UNAVAILABLE are runtime resolution classes and must never appear
 *  here as if they were a polarity. */
const POLARITIES = ['OFFERED', 'WITHHELD'];

/** Fields that would smuggle runtime context or a maturity axis into a
 *  build-static, environment-agnostic Product artifact (ORG-015/017). The
 *  content hash belongs in the lock, never in the hashed payload itself. */
const FORBIDDEN_PROJECTION_FIELDS = [
  'appSha', 'environment', 'releaseId', 'deploymentId', 'active',
  'releaseEligibility', 'implementationReadiness', 'earliestPhase', 'contentHash',
];

const SCREEN_ID = /^SCR-[0-9]{3}$/;
const APP_SHA = /^[0-9a-f]{40}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

export function sha256OfBytes(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function sameKeys(actual, expected) {
  const a = [...actual].sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

function parseJson(raw, label, problems) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    problems.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

/**
 * Validate the projection payload against its runtime contract.
 * `raw` is the exact file bytes — the hash is computed over those bytes, never
 * over a re-serialized object, so formatting differences cannot hide a change.
 */
export function validateProjection(raw, problems) {
  const doc = parseJson(raw.toString('utf8'), 'Projection', problems);
  if (doc === null) return null;

  // Runs unconditionally, BEFORE any structural early-return: a forbidden field
  // must never go unreported just because a shape check happened to fail first.
  const serialized = raw.toString('utf8');
  for (const field of FORBIDDEN_PROJECTION_FIELDS) {
    if (new RegExp(`"${field}"\\s*:`).test(serialized)) {
      problems.push(`Projection must not carry "${field}" — runtime context and maturity axes belong outside it, and the content hash belongs in the lock`);
    }
  }

  if (Object.prototype.toString.call(doc) !== '[object Object]') {
    problems.push('Projection must be a JSON object');
    return null;
  }
  if (!sameKeys(Object.keys(doc), PROJECTION_TOP_LEVEL_KEYS)) {
    problems.push(
      `Projection top-level keys must be exactly [${PROJECTION_TOP_LEVEL_KEYS.join(', ')}], got [${Object.keys(doc).sort().join(', ')}]`,
    );
    return null;
  }
  if (doc.contractId !== SUPPORTED_CONTRACT_ID) {
    problems.push(`unsupported contractId ${JSON.stringify(doc.contractId)} (this App supports ${SUPPORTED_CONTRACT_ID})`);
  }
  if (!SUPPORTED_CONTRACT_VERSIONS.includes(doc.contractVersion)) {
    problems.push(
      `unsupported contractVersion ${JSON.stringify(doc.contractVersion)} (this App supports ${SUPPORTED_CONTRACT_VERSIONS.join(', ')})`,
    );
  }
  if (typeof doc.scopeId !== 'string' || doc.scopeId.length === 0) {
    problems.push('scopeId must be a non-empty string');
  }
  if (!Array.isArray(doc.subjects)) {
    problems.push('subjects must be an array');
    return doc;
  }
  if (!Number.isInteger(doc.subjectCount) || doc.subjectCount !== doc.subjects.length) {
    // NOT hardcoded to 4: the invariant is agreement, not a particular count.
    problems.push(`subjectCount ${JSON.stringify(doc.subjectCount)} does not equal subjects.length ${doc.subjects.length}`);
  }

  const seenScreens = new Set();
  const seenRoutes = new Set();
  doc.subjects.forEach((subject, i) => {
    const at = `subjects[${i}]`;
    if (Object.prototype.toString.call(subject) !== '[object Object]') {
      problems.push(`${at} must be an object`);
      return;
    }
    if (!sameKeys(Object.keys(subject), SUBJECT_KEYS)) {
      problems.push(`${at} keys must be exactly [${SUBJECT_KEYS.join(', ')}], got [${Object.keys(subject).sort().join(', ')}]`);
      return;
    }
    if (!SCREEN_ID.test(subject.screenId)) problems.push(`${at}.screenId ${JSON.stringify(subject.screenId)} is not a canonical ScreenID`);
    if (typeof subject.runtimeRoute !== 'string' || !subject.runtimeRoute.startsWith('/')) {
      problems.push(`${at}.runtimeRoute ${JSON.stringify(subject.runtimeRoute)} must be an absolute route path`);
    }
    if (!POLARITIES.includes(subject.intendedExposure)) {
      problems.push(`${at}.intendedExposure ${JSON.stringify(subject.intendedExposure)} is not a Product polarity (${POLARITIES.join(' | ')})`);
    }
    if (typeof subject.decisionId !== 'string' || subject.decisionId.length === 0) {
      problems.push(`${at}.decisionId must be a non-empty string`);
    }
    const binding = subject.binding;
    if (Object.prototype.toString.call(binding) !== '[object Object]' || !sameKeys(Object.keys(binding), BINDING_KEYS)) {
      problems.push(`${at}.binding must be exactly {${BINDING_KEYS.join(', ')}}`);
    } else {
      if (!APP_SHA.test(binding.effectiveFromAppSha)) {
        problems.push(`${at}.binding.effectiveFromAppSha must be a 40-character git SHA`);
      }
      if (binding.screenId !== subject.screenId) {
        problems.push(`${at}.binding.screenId ${JSON.stringify(binding.screenId)} does not match subject screenId ${JSON.stringify(subject.screenId)}`);
      }
    }
    // Duplicates are rejected, never silently collapsed by a Map/object key.
    if (seenScreens.has(subject.screenId)) problems.push(`duplicate screenId ${subject.screenId}`);
    seenScreens.add(subject.screenId);
    if (seenRoutes.has(subject.runtimeRoute)) problems.push(`duplicate runtimeRoute ${subject.runtimeRoute}`);
    seenRoutes.add(subject.runtimeRoute);
  });

  return doc;
}

/** Validate the lock and its agreement with the projection bytes it locks. */
export function validateLock(rawLock, projectionBytes, projection, problems) {
  const lock = parseJson(rawLock.toString('utf8'), 'Lock', problems);
  if (lock === null) return null;

  if (!sameKeys(Object.keys(lock), LOCK_KEYS)) {
    problems.push(`Lock keys must be exactly [${LOCK_KEYS.join(', ')}], got [${Object.keys(lock).sort().join(', ')}]`);
    return lock;
  }
  if (typeof lock.sourceRepository !== 'string' || !lock.sourceRepository.startsWith('https://')) {
    problems.push('lock.sourceRepository must be an https URL');
  }
  if (!FULL_SHA.test(lock.knowledgeCommit)) {
    problems.push(`lock.knowledgeCommit ${JSON.stringify(lock.knowledgeCommit)} must be a full 40-character git SHA`);
  }
  if (!CONTENT_HASH.test(lock.contentHash)) {
    problems.push(`lock.contentHash ${JSON.stringify(lock.contentHash)} must be "sha256:<64 lowercase hex>"`);
  }
  if (!SEMVER.test(lock.projectionContractVersion)) {
    problems.push('lock.projectionContractVersion must be semver');
  }
  if (typeof lock.generatorId !== 'string' || lock.generatorId.length === 0) problems.push('lock.generatorId must be a non-empty string');
  if (!SEMVER.test(lock.generatorVersion)) problems.push('lock.generatorVersion must be semver');

  // The hash is computed over the EXACT vendored bytes.
  const actual = sha256OfBytes(projectionBytes);
  if (lock.contentHash !== actual) {
    problems.push(`lock.contentHash ${lock.contentHash} does not match the vendored Projection bytes (${actual}) — projection and lock must be updated together`);
  }
  if (projection) {
    if (lock.scopeId !== projection.scopeId) {
      problems.push(`lock.scopeId ${JSON.stringify(lock.scopeId)} does not match Projection scopeId ${JSON.stringify(projection.scopeId)}`);
    }
    if (lock.projectionContractVersion !== projection.contractVersion) {
      problems.push(`lock.projectionContractVersion ${JSON.stringify(lock.projectionContractVersion)} does not match Projection contractVersion ${JSON.stringify(projection.contractVersion)}`);
    }
    if (lock.subjectCount !== projection.subjectCount) {
      problems.push(`lock.subjectCount ${JSON.stringify(lock.subjectCount)} does not match Projection subjectCount ${JSON.stringify(projection.subjectCount)}`);
    }
  }
  return lock;
}

/**
 * Prove this App source can actually serve every projected route.
 *
 * V1 is static-route only. A projected route that the exact static mapping
 * cannot represent FAILS rather than being inferred into a dynamic segment.
 * The reverse is explicitly fine: the App has many routes absent from the
 * projection (/auth/login, /for-you, …) — a projection is partial by design
 * and out-of-scope routes receive no verdict.
 */
export function routeSourcePath(runtimeRoute) {
  if (!runtimeRoute.startsWith('/') || runtimeRoute.includes('?') || runtimeRoute.includes('#')) return null;
  const segments = runtimeRoute.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  // Anything a static App Router directory cannot be is refused, not guessed.
  if (segments.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || s.startsWith('[') || s.startsWith('('))) return null;
  return join('app', ...segments, 'page.tsx');
}

export function validateRouteCompatibility(projection, repoRoot, problems) {
  const results = [];
  if (!projection || !Array.isArray(projection.subjects)) return results;
  for (const subject of projection.subjects) {
    if (typeof subject?.runtimeRoute !== 'string') continue;
    const rel = routeSourcePath(subject.runtimeRoute);
    if (rel === null) {
      problems.push(`${subject.screenId} route ${subject.runtimeRoute} is not representable by the V1 static-route mechanism — failing closed rather than inferring dynamic-route semantics`);
      results.push({ screenId: subject.screenId, runtimeRoute: subject.runtimeRoute, sourcePath: null, exists: false });
      continue;
    }
    const exists = existsSync(join(repoRoot, rel));
    if (!exists) {
      problems.push(`${subject.screenId} route ${subject.runtimeRoute} has no page at ${rel} in this App source — the selected Projection is not compatible with this build`);
    }
    results.push({ screenId: subject.screenId, runtimeRoute: subject.runtimeRoute, sourcePath: rel, exists });
  }
  return results;
}

/**
 * Full fail-closed check over one repository root (or a fixture directory).
 * Returns { ok, problems, projection, lock, routes }. Callers decide how to
 * report; nothing here exits the process.
 */
export function validateVendoredExposure(repoRoot, options = {}) {
  const projectionPath = join(repoRoot, options.projectionRelPath ?? PROJECTION_REL_PATH);
  const lockPath = join(repoRoot, options.lockRelPath ?? LOCK_REL_PATH);
  const problems = [];

  const hasProjection = existsSync(projectionPath);
  const hasLock = existsSync(lockPath);
  if (!hasProjection) problems.push(`Projection missing at ${options.projectionRelPath ?? PROJECTION_REL_PATH}`);
  if (!hasLock) problems.push(`Lock missing at ${options.lockRelPath ?? LOCK_REL_PATH}`);
  if (!hasProjection || !hasLock) {
    // A projection without its lock (or vice versa) is a partial vendor update.
    return { ok: false, problems, projection: null, lock: null, routes: [] };
  }

  const projectionBytes = readFileSync(projectionPath);
  const projection = validateProjection(projectionBytes, problems);
  const lock = validateLock(readFileSync(lockPath), projectionBytes, projection, problems);
  const routes = validateRouteCompatibility(projection, repoRoot, problems);

  return { ok: problems.length === 0, problems, projection, lock, routes, contentHash: sha256OfBytes(projectionBytes) };
}
