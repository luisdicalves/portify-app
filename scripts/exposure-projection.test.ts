// PRT-CAP-APP-C1 — vendored Runtime Exposure Projection, lock, and the
// fail-closed build gate (ORG-019).
//
// Every negative case builds a throwaway fixture directory. The committed
// vendor/ artifacts are read but never mutated.

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCK_REL_PATH,
  PROJECTION_REL_PATH,
  SUPPORTED_CONTRACT_ID,
  SUPPORTED_CONTRACT_VERSIONS,
  routeSourcePath,
  sha256OfBytes,
  validateVendoredExposure,
} from './lib/validate-exposure-projection.mjs';
import { buildLock, serializeLock } from './sync-exposure-projection.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_HASH = 'sha256:a073399a971f00bb683cbe41ded9157e0b6d57a82e1702b7d89fec1a193ae2a8';

const projectionBytes = () => readFileSync(join(REPO_ROOT, PROJECTION_REL_PATH));
const lockBytes = () => readFileSync(join(REPO_ROOT, LOCK_REL_PATH));

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A fixture repo: the real vendor artifacts plus just enough App route
 *  structure for compatibility checks, then mutated per test. */
function fixture(mutate?: (paths: { projection: string; lock: string; root: string }) => void) {
  const root = mkdtempSync(join(tmpdir(), `exposure-c1-${randomUUID()}-`));
  temps.push(root);
  mkdirSync(join(root, 'vendor', 'exposure'), { recursive: true });
  writeFileSync(join(root, PROJECTION_REL_PATH), projectionBytes());
  writeFileSync(join(root, LOCK_REL_PATH), lockBytes());
  for (const route of ['dashboard', 'portfolio', 'profile', 'profile/security']) {
    mkdirSync(join(root, 'app', route), { recursive: true });
    writeFileSync(join(root, 'app', route, 'page.tsx'), 'export default function P() { return null; }\n');
  }
  mutate?.({ projection: join(root, PROJECTION_REL_PATH), lock: join(root, LOCK_REL_PATH), root });
  return root;
}

function writeProjection(path: string, mutate: (doc: any) => void) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  mutate(doc);
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
}

/** Re-lock a mutated fixture so a test isolates the defect it means to test
 *  instead of tripping the hash check first. */
function relock(root: string) {
  const bytes = readFileSync(join(root, PROJECTION_REL_PATH));
  const projection = JSON.parse(bytes.toString('utf8'));
  const existing = JSON.parse(readFileSync(join(root, LOCK_REL_PATH), 'utf8'));
  const lock = buildLock({
    projectionBytes: bytes,
    projection,
    knowledgeCommit: existing.knowledgeCommit,
    generator: { generatorId: existing.generatorId, generatorVersion: existing.generatorVersion },
  });
  writeFileSync(join(root, LOCK_REL_PATH), serializeLock(lock));
}

const problems = (root: string) => validateVendoredExposure(root).problems.join('\n');

describe('committed vendor artifacts', () => {
  it('the vendored projection hashes to the canonical Knowledge projection', () => {
    expect(sha256OfBytes(projectionBytes())).toBe(CANONICAL_HASH);
  });

  it('the lock pins that exact hash and a full Knowledge commit', () => {
    const lock = JSON.parse(lockBytes().toString('utf8'));
    expect(lock.contentHash).toBe(CANONICAL_HASH);
    expect(lock.scopeId).toBe('EXS-001');
    expect(lock.subjectCount).toBe(4);
    expect(lock.knowledgeCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.sourceRepository).toContain('PORTIFY-KNOWLEDGE');
  });

  it('carries only the governed lock fields — no distributionCommit, no timestamp', () => {
    expect(Object.keys(JSON.parse(lockBytes().toString('utf8'))).sort()).toEqual([
      'contentHash', 'generatorId', 'generatorVersion', 'knowledgeCommit',
      'projectionContractVersion', 'scopeId', 'sourceRepository', 'subjectCount',
    ]);
  });

  it('the real repository passes the check', () => {
    expect(validateVendoredExposure(REPO_ROOT).ok).toBe(true);
  });

  it('every projected route resolves to a real page in this App source', () => {
    const { routes } = validateVendoredExposure(REPO_ROOT);
    expect(routes.map((r) => [r.screenId, r.runtimeRoute, r.exists])).toEqual([
      ['SCR-020', '/dashboard', true],
      ['SCR-040', '/portfolio', true],
      ['SCR-140', '/profile', true],
      ['SCR-160', '/profile/security', true],
    ]);
  });
});

describe('fail-closed validation', () => {
  it('fails when the projection is missing', () => {
    const root = fixture(({ projection }) => rmSync(projection));
    expect(problems(root)).toMatch(/Projection missing/);
  });

  it('fails when the lock is missing', () => {
    const root = fixture(({ lock }) => rmSync(lock));
    expect(problems(root)).toMatch(/Lock missing/);
  });

  it('fails on malformed projection JSON', () => {
    const root = fixture(({ projection }) => writeFileSync(projection, '{ not json'));
    expect(problems(root)).toMatch(/Projection is not valid JSON/);
  });

  it('fails on malformed lock JSON', () => {
    const root = fixture(({ lock }) => writeFileSync(lock, '{ not json'));
    expect(problems(root)).toMatch(/Lock is not valid JSON/);
  });

  it('fails on an unsupported contractId', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.contractId = 'RUNTIME-EXPOSURE-PROJECTION-V2'; }));
    relock(root);
    expect(problems(root)).toMatch(/unsupported contractId/);
  });

  it('fails on an unsupported contractVersion — no forward-compatibility guessing', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.contractVersion = '2.0.0'; }));
    relock(root);
    expect(problems(root)).toMatch(/unsupported contractVersion/);
  });

  it('fails when lock scopeId disagrees with the projection', () => {
    const root = fixture();
    const lock = JSON.parse(readFileSync(join(root, LOCK_REL_PATH), 'utf8'));
    lock.scopeId = 'EXS-999';
    writeFileSync(join(root, LOCK_REL_PATH), serializeLock(lock));
    expect(problems(root)).toMatch(/lock.scopeId .* does not match/);
  });

  it('fails when subjectCount disagrees with subjects.length', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjectCount = 3; }));
    relock(root);
    expect(problems(root)).toMatch(/subjectCount .* does not equal subjects.length/);
  });

  it('fails when the lock hash does not match the vendored bytes', () => {
    const root = fixture();
    const lock = JSON.parse(readFileSync(join(root, LOCK_REL_PATH), 'utf8'));
    lock.contentHash = `sha256:${'0'.repeat(64)}`;
    writeFileSync(join(root, LOCK_REL_PATH), serializeLock(lock));
    expect(problems(root)).toMatch(/does not match the vendored Projection bytes/);
  });

  it('fails on a duplicate screenId', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => {
      d.subjects[1].screenId = d.subjects[0].screenId;
      d.subjects[1].binding.screenId = d.subjects[0].screenId;
    }));
    relock(root);
    expect(problems(root)).toMatch(/duplicate screenId/);
  });

  it('fails on a duplicate runtimeRoute', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => {
      d.subjects[1].runtimeRoute = d.subjects[0].runtimeRoute;
    }));
    relock(root);
    expect(problems(root)).toMatch(/duplicate runtimeRoute/);
  });

  it('fails on a polarity that is not OFFERED or WITHHELD', () => {
    for (const bogus of ['OUT_OF_SCOPE', 'SYSTEM_UNAVAILABLE', 'UNKNOWN', 'PENDING']) {
      const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjects[0].intendedExposure = bogus; }));
      relock(root);
      expect(problems(root)).toMatch(/is not a Product polarity/);
    }
  });

  it('accepts WITHHELD — the branch exists even though EXS-001 has none', () => {
    // Synthetic only. This proves the implementation handles the polarity, and
    // proves nothing about Product truth: EXS-001 has zero real WITHHELD.
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjects[0].intendedExposure = 'WITHHELD'; }));
    relock(root);
    expect(validateVendoredExposure(root).ok).toBe(true);
  });

  it('fails when a binding screenId disagrees with its subject', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjects[0].binding.screenId = 'SCR-999'; }));
    relock(root);
    expect(problems(root)).toMatch(/does not match subject screenId/);
  });

  it('fails on a forbidden runtime-context or maturity field', () => {
    for (const field of ['appSha', 'environment', 'releaseId', 'active', 'releaseEligibility', 'contentHash']) {
      const root = fixture(({ projection }) => writeProjection(projection, (d) => { d[field] = 'x'; }));
      relock(root);
      expect(problems(root)).toMatch(new RegExp(`must not carry "${field}"`));
    }
  });

  it('fails on an unknown top-level key', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.extra = true; }));
    relock(root);
    expect(problems(root)).toMatch(/top-level keys must be exactly/);
  });

  it('fails on an unknown subject key', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjects[0].extra = true; }));
    relock(root);
    expect(problems(root)).toMatch(/keys must be exactly/);
  });

  it('fails when a projected route has no page in this App source', () => {
    const root = fixture();
    rmSync(join(root, 'app', 'portfolio'), { recursive: true });
    expect(problems(root)).toMatch(/has no page at app\/portfolio\/page.tsx/);
  });

  it('fails closed on a route the static V1 mechanism cannot represent', () => {
    const root = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjects[0].runtimeRoute = '/portfolio/[id]'; }));
    relock(root);
    expect(problems(root)).toMatch(/not representable by the V1 static-route mechanism/);
    expect(routeSourcePath('/portfolio/[id]')).toBeNull();
  });

  it('rejects a partial vendor update in both directions', () => {
    const newProjection = fixture(({ projection }) => writeProjection(projection, (d) => { d.subjectCount = 4; d.subjects[0].decisionId = 'EXD-900'; }));
    expect(problems(newProjection)).toMatch(/does not match the vendored Projection bytes/);

    const newLock = fixture();
    const lock = JSON.parse(readFileSync(join(newLock, LOCK_REL_PATH), 'utf8'));
    lock.subjectCount = 9;
    writeFileSync(join(newLock, LOCK_REL_PATH), serializeLock(lock));
    expect(problems(newLock)).toMatch(/lock.subjectCount .* does not match/);
  });
});

describe('App routes absent from the projection are allowed', () => {
  it('does not fail because the App serves routes the projection omits', () => {
    // The projection is partial by design; /auth/login, /for-you and the rest
    // are out of scope and receive no verdict.
    const root = fixture();
    mkdirSync(join(root, 'app', 'for-you'), { recursive: true });
    writeFileSync(join(root, 'app', 'for-you', 'page.tsx'), 'export default function P() { return null; }\n');
    expect(validateVendoredExposure(root).ok).toBe(true);
  });
});

describe('sync', () => {
  it('produces a deterministic lock from the same inputs', () => {
    const bytes = projectionBytes();
    const projection = JSON.parse(bytes.toString('utf8'));
    const args = {
      projectionBytes: bytes,
      projection,
      knowledgeCommit: 'a'.repeat(40),
      generator: { generatorId: 'portify-exposure-contracts', generatorVersion: '1.0.0' },
    };
    expect(serializeLock(buildLock(args))).toBe(serializeLock(buildLock(args)));
  });

  it('records the hash of the exact bytes, not of a re-serialization', () => {
    const bytes = projectionBytes();
    const lock = buildLock({
      projectionBytes: bytes,
      projection: JSON.parse(bytes.toString('utf8')),
      knowledgeCommit: 'a'.repeat(40),
      generator: { generatorId: 'g', generatorVersion: '1.0.0' },
    });
    expect(lock.contentHash).toBe(CANONICAL_HASH);
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(bytes.toString('utf8'))));
    expect(sha256OfBytes(reserialized)).not.toBe(CANONICAL_HASH);
  });

  it('carries no wall clock, hostname or local path', () => {
    const raw = lockBytes().toString('utf8');
    for (const smell of ['generatedAt', 'timestamp', 'Users/', '/private/', 'hostname']) {
      expect(raw).not.toContain(smell);
    }
  });
});

describe('the build gate', () => {
  it('check:exposure exits 0 on the committed artifacts', () => {
    const out = execFileSync('node', ['scripts/check-exposure-projection.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).toContain('Exposure projection check passed');
    expect(out).toContain('EXS-001');
  });

  it('check:exposure exits non-zero on a corrupted fixture', () => {
    const root = fixture();
    const lock = JSON.parse(readFileSync(join(root, LOCK_REL_PATH), 'utf8'));
    lock.contentHash = `sha256:${'0'.repeat(64)}`;
    writeFileSync(join(root, LOCK_REL_PATH), serializeLock(lock));
    expect(() => execFileSync('node', ['scripts/check-exposure-projection.mjs', '--root', root],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' })).toThrow();
  });

  it('the deployable build command runs the gate before next build', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).toContain('check:exposure');
    expect(pkg.scripts.build.indexOf('check:exposure')).toBeLessThan(pkg.scripts.build.indexOf('next build'));
  });

  it('vercel.json pins the build command to that gated script', () => {
    const vercel = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8'));
    expect(vercel.buildCommand).toBe('npm run build');
  });

  it('the checker needs no PORTIFY-KNOWLEDGE checkout, network or subprocess', () => {
    // Behaviour, not vocabulary: the comments may name the upstream repo, but
    // the checker must never reach a Knowledge checkout, the network or git.
    const source = readFileSync(join(REPO_ROOT, 'scripts/check-exposure-projection.mjs'), 'utf8')
      + readFileSync(join(REPO_ROOT, 'scripts/lib/validate-exposure-projection.mjs'), 'utf8');
    expect(source).not.toMatch(/node:https?|node:net|fetch\(/);
    expect(source).not.toMatch(/child_process|execFileSync|execSync/);
    expect(source).not.toMatch(/--source/);

    // And it passes with nothing but this repo present.
    const out = execFileSync('node', ['scripts/check-exposure-projection.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).toContain('Exposure projection check passed');
  });
});

describe('C1 boundary: nothing is consumed at runtime', () => {
  const runtimeDirs = ['app', 'components', 'lib'];

  it('no runtime module reads the vendored projection', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
        const text = readFileSync(full, 'utf8');
        if (text.includes('vendor/exposure') || text.includes('RUNTIME-EXPOSURE-PROJECTION')) hits.push(full);
      }
    };
    for (const dir of runtimeDirs) walk(join(REPO_ROOT, dir));
    expect(hits).toEqual([]);
  });

  it('no middleware, proxy or exposure resolver exists', () => {
    for (const path of ['middleware.ts', 'middleware.js', 'proxy.ts', 'src/middleware.ts',
      'lib/exposure/resolver.ts', 'lib/exposureResolver.ts']) {
      expect(existsSync(join(REPO_ROOT, path))).toBe(false);
    }
  });

  it('no shadow mode, runtime mode constant or SYSTEM_UNAVAILABLE surface exists', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = readFileSync(full, 'utf8');
        if (/SYSTEM_UNAVAILABLE|EXPOSURE_MODE|ExposureResolver|intendedExposure/.test(text)) hits.push(full);
      }
    };
    for (const dir of runtimeDirs) walk(join(REPO_ROOT, dir));
    expect(hits).toEqual([]);
  });

  it('the supported contract is declared explicitly, not inferred', () => {
    expect(SUPPORTED_CONTRACT_ID).toBe('RUNTIME-EXPOSURE-PROJECTION-V1');
    expect(SUPPORTED_CONTRACT_VERSIONS).toEqual(['1.0.0']);
  });
});
