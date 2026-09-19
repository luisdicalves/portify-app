import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  AUTHORIZED_BINDINGS, CANONICAL_PATH_PREFIX, PATHS, computeBrandContentHash, validateBrandConsumer,
} from './lib/validate-brand-assets.mjs';
import { runBrandSync } from './sync-brand-assets.mjs';

const REPO = join(new URL('.', import.meta.url).pathname, '..');
const ON_GREEN_512 = 'assets/png/on-green/portify-icon-on-green-512.png';

/** Copy the real, committed consumer files into an isolated root. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'brand-consumer-'));
  cpSync(join(REPO, 'vendor/brand'), join(root, 'vendor/brand'), { recursive: true });
  for (const rel of [PATHS.lock, PATHS.consumption, PATHS.consumptionSchema, 'app/icon.png', 'app/apple-icon.png']) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REPO, rel), join(root, rel));
  }
  return root;
}
const readJ = (root: string, rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const writeJ = (root: string, rel: string, v: any) => writeFileSync(join(root, rel), JSON.stringify(v, null, 2) + '\n');
function check(mutate: (root: string) => void): { valid: boolean; errors: string[] } {
  const root = fixtureRoot();
  try {
    mutate(root);
    return validateBrandConsumer({ root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
/** Rewrite the registry and re-align its contentHash and the lock (to isolate one defect). */
function rewriteRegistry(root: string, edit: (r: any) => void) {
  const r = readJ(root, PATHS.registry);
  edit(r);
  r.contentHash = computeBrandContentHash(r);
  writeJ(root, PATHS.registry, r);
  const lock = readJ(root, PATHS.lock);
  lock.contentHash = r.contentHash;
  lock.registryVersion = r.registryVersion;
  lock.schemaVersion = r.schemaVersion;
  writeJ(root, PATHS.lock, lock);
}
const failsWith = (res: { valid: boolean; errors: string[] }, re: RegExp) => {
  expect(res.valid).toBe(false);
  expect(res.errors.some((e) => re.test(e)), res.errors.join('\n')).toBe(true);
};

describe('BRAND-REG-007 contentHash parity with the canonical Python algorithm', () => {
  it('recomputes the vendored registry to the canonical content hash', () => {
    const registry = readJ(REPO, PATHS.registry);
    expect(computeBrandContentHash(registry)).toBe('sha256:01a3e9ef9684e782dcb43e2f0ec9f37f27f4ebe84981db17b9566f0a746fb6f8');
    expect(computeBrandContentHash(registry)).toBe(registry.contentHash);
  });
  it('matches Python on non-ASCII text, empty containers, nulls, booleans and unsorted nested keys', () => {
    // Golden values from PORTIFY-KNOWLEDGE validate_brand_registry.compute_content_hash.
    const assets = [{ zeta: 'é ✓ – "q"', alpha: [], mid: {}, n: 2, nested: { b: 1, a: [{ y: null, x: true }] } }];
    expect(computeBrandContentHash({ registryVersion: '2.3.4', schemaVersion: '1.0.0', assets }))
      .toBe('sha256:842eeb77849e3388a64199106cb39f36c763a946b04b6b0771115a2308812f80');
    expect(computeBrandContentHash({ registryVersion: '1.0.0', schemaVersion: '1.0.0', assets: [] }))
      .toBe('sha256:adc5379f7aea05cb4e527ebcda453388fdc110b72e827570153af80293b30245');
  });
});

describe('local consumer integrity (Brand Consumer Contract v1 §4)', () => {
  it('passes for the committed snapshot and bindings', () => {
    const res = validateBrandConsumer({ root: REPO });
    expect(res.errors).toEqual([]);
    expect(res.summary).toMatchObject({ registryVersion: '1.0.0', approvedAssets: 33, bindings: 2 });
  });

  it('fails a registry that violates its schema', () => {
    failsWith(check((r) => rewriteRegistry(r, (reg) => { reg.assets[0].surprise = true; })), /registry: schema violation/);
  });
  it('fails an unsupported schemaVersion', () => {
    failsWith(check((r) => rewriteRegistry(r, (reg) => { reg.schemaVersion = '9.0.0'; })), /unsupported schemaVersion/);
  });
  it('fails an unsupported registryVersion MAJOR', () => {
    failsWith(check((r) => rewriteRegistry(r, (reg) => { reg.registryVersion = '2.0.0'; })), /unsupported registryVersion/);
  });
  it('fails a registry whose contentHash does not recompute', () => {
    failsWith(check((r) => { const reg = readJ(r, PATHS.registry); reg.assets[0].variant = 'tampered'; writeJ(r, PATHS.registry, reg); }), /contentHash: registry declares/);
  });
  it('fails a lock contentHash mismatch', () => {
    failsWith(check((r) => { const l = readJ(r, PATHS.lock); l.contentHash = `sha256:${'0'.repeat(64)}`; writeJ(r, PATHS.lock, l); }), /lock: contentHash/);
  });
  it('fails a lock registryVersion mismatch', () => {
    failsWith(check((r) => { const l = readJ(r, PATHS.lock); l.registryVersion = '1.0.1'; writeJ(r, PATHS.lock, l); }), /lock: registryVersion/);
  });
  it('fails a lock assetCount mismatch', () => {
    failsWith(check((r) => { const l = readJ(r, PATHS.lock); l.assetCount = 32; writeJ(r, PATHS.lock, l); }), /lock: assetCount/);
  });
  it('fails a lock carrying a forbidden version axis', () => {
    failsWith(check((r) => { const l = readJ(r, PATHS.lock); l.snapshotVersion = '1.0.0'; writeJ(r, PATHS.lock, l); }), /unexpected field/);
  });
  it('fails a missing vendored asset', () => {
    failsWith(check((r) => unlinkSync(join(r, 'vendor/brand', 'assets/svg/portify-icon-on-black.svg'))), /missing vendored file/);
  });
  it('fails an extra vendored asset', () => {
    failsWith(check((r) => writeFileSync(join(r, 'vendor/brand/assets/svg/extra.svg'), '<svg/>')), /unexpected vendored file/);
  });
  it('fails a mutated asset byte', () => {
    failsWith(check((r) => {
      const p = join(r, 'vendor/brand/assets/svg/portify-icon-on-green.svg');
      writeFileSync(p, readFileSync(p, 'utf8').replace('025963', '025964'));
    }), /sha256 .* != registry/);
  });
  it('fails a consumption file that violates its schema', () => {
    failsWith(check((r) => { const c = readJ(r, PATHS.consumption); c.extra = 1; writeJ(r, PATHS.consumption, c); }), /brand-consumption: schema violation/);
  });
  it('fails an unknown assetId', () => {
    failsWith(check((r) => { const c = readJ(r, PATHS.consumption); c.bindings[0].assetId = 'app-icon-on-green-png-999'; writeJ(r, PATHS.consumption, c); }), /unknown assetId/);
  });
  it('fails a binding to a non-APPROVED asset', () => {
    failsWith(check((r) => rewriteRegistry(r, (reg) => {
      reg.assets.find((a: any) => a.assetId === 'app-icon-on-green-png-512').status = 'CANDIDATE';
    })), /is not APPROVED/);
  });
  it('fails a duplicate target', () => {
    failsWith(check((r) => { const c = readJ(r, PATHS.consumption); c.bindings[1].target = c.bindings[0].target; writeJ(r, PATHS.consumption, c); }), /duplicate target/);
  });
  it('fails a missing runtime target', () => {
    failsWith(check((r) => unlinkSync(join(r, 'app/apple-icon.png'))), /runtime target file missing/);
  });
  it('fails a runtime target whose bytes differ from the bound asset', () => {
    failsWith(check((r) => cpSync(join(r, 'vendor/brand/assets/png/on-black/portify-icon-on-black-512.png'), join(r, 'app/icon.png'))), /runtime target bytes differ/);
  });
  it('fails an incompatible usage (Apple touch icon bound to a 512px asset)', () => {
    failsWith(check((r) => { const c = readJ(r, PATHS.consumption); c.bindings[1].assetId = 'app-icon-on-green-png-512'; writeJ(r, PATHS.consumption, c); }), /dimensions 512x512 not valid for apple-touch-icon/);
  });
  it('fails a third, unauthorized T1 binding', () => {
    failsWith(check((r) => {
      const c = readJ(r, PATHS.consumption);
      c.bindings.push({ target: 'app/icon-192.png', assetId: 'app-icon-on-green-png-192', usage: 'platform-app-icon' });
      writeJ(r, PATHS.consumption, c);
      cpSync(join(r, 'vendor/brand/assets/png/on-green/portify-icon-on-green-192.png'), join(r, 'app/icon-192.png'));
    }), /not an authorized T1 binding/);
  });
  it('fails an attempt to bind appIcon to a splash / brand-mark target', () => {
    for (const target of ['app/auth/login/logo.png', 'components/ui/BrandMark.png', 'app/splash-mark.png']) {
      failsWith(check((r) => {
        const c = readJ(r, PATHS.consumption);
        c.bindings.push({ target, assetId: 'app-icon-on-green-png-512', usage: 'platform-app-icon' });
        writeJ(r, PATHS.consumption, c);
        mkdirSync(dirname(join(r, target)), { recursive: true });
        cpSync(join(r, 'app/icon.png'), join(r, target));
      }), /brand placement target is not authorized in T1/);
    }
  });
  it('accepts exactly the two approved T1 bindings, bound to unchanged icon bytes', () => {
    const c = readJ(REPO, PATHS.consumption);
    expect(c.bindings).toEqual(AUTHORIZED_BINDINGS.map((b) => ({ ...b })));
    expect(readFileSync(join(REPO, 'app/icon.png')).equals(readFileSync(join(REPO, 'vendor/brand', ON_GREEN_512)))).toBe(true);
    expect(readFileSync(join(REPO, 'app/apple-icon.png'))
      .equals(readFileSync(join(REPO, 'vendor/brand/assets/png/on-green/portify-icon-on-green-180.png')))).toBe(true);
  });
});

describe('privileged Brand sync (fixtures only — not the T3 remote freshness proof)', () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

  /** A local Knowledge-like source repo holding the current canonical snapshot. */
  function sourceRepo(): string {
    const src = mkdtempSync(join(tmpdir(), 'brand-source-'));
    const registry = readJ(REPO, PATHS.registry);
    for (const [rel, from] of [['registry.json', PATHS.registry], ['registry.schema.json', PATHS.registrySchema]]) {
      mkdirSync(join(src, CANONICAL_PATH_PREFIX), { recursive: true });
      cpSync(join(REPO, from), join(src, CANONICAL_PATH_PREFIX, rel));
    }
    for (const a of registry.assets) {
      mkdirSync(dirname(join(src, a.sourcePath)), { recursive: true });
      cpSync(join(REPO, 'vendor/brand/assets', a.sourcePath.slice(CANONICAL_PATH_PREFIX.length)), join(src, a.sourcePath));
    }
    git(src, 'init', '-q');
    git(src, 'add', '.');
    git(src, 'commit', '-q', '-m', 'brand snapshot');
    return src;
  }
  const lockOf = (root: string) => readFileSync(join(root, PATHS.lock));

  it('reports unchanged for the current snapshot and writes nothing (local NO_UPDATE)', () => {
    const src = sourceRepo(); const root = fixtureRoot();
    try {
      const before = lockOf(root);
      expect(runBrandSync({ source: src, repoRoot: root }).result).toBe('unchanged');
      expect(lockOf(root).equals(before)).toBe(true);
    } finally { rmSync(src, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });

  it('does not rewrite sourceCommit when Knowledge advances with unrelated commits', () => {
    const src = sourceRepo(); const root = fixtureRoot();
    try {
      writeFileSync(join(src, 'README.md'), 'unrelated\n');
      git(src, 'add', '.');
      git(src, 'commit', '-q', '-m', 'unrelated');
      const before = lockOf(root);
      expect(runBrandSync({ source: src, repoRoot: root }).result).toBe('unchanged');
      expect(lockOf(root).equals(before)).toBe(true);
      expect(readJ(root, PATHS.lock).sourceCommit).toBe('689c08a4eb4396d5a253202800d0159ad8aa7665');
    } finally { rmSync(src, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });

  it('applies a material Brand change: snapshot, lock and the bound target update; bindings do not', () => {
    const src = sourceRepo(); const root = fixtureRoot();
    try {
      // A future approved change: new bytes for the bound 512 icon, MINOR bump.
      const regPath = join(src, CANONICAL_PATH_PREFIX, 'registry.json');
      const reg = JSON.parse(readFileSync(regPath, 'utf8'));
      const target = reg.assets.find((a: any) => a.assetId === 'app-icon-on-green-png-512');
      const newBytes = readFileSync(join(src, CANONICAL_PATH_PREFIX, 'png/on-black/portify-icon-on-black-512.png'));
      writeFileSync(join(src, target.sourcePath), newBytes);
      target.sha256 = `sha256:${createHash('sha256').update(newBytes).digest('hex')}`;
      reg.registryVersion = '1.1.0';
      reg.contentHash = computeBrandContentHash(reg);
      writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
      git(src, 'add', '.');
      git(src, 'commit', '-q', '-m', 'brand change');
      const changeCommit = git(src, 'rev-parse', 'HEAD');
      writeFileSync(join(src, 'NOTES.md'), 'unrelated\n');
      git(src, 'add', '.');
      git(src, 'commit', '-q', '-m', 'unrelated after change');

      const consumptionBefore = readFileSync(join(root, PATHS.consumption));
      const out = runBrandSync({ source: src, repoRoot: root });
      expect(out.result).toBe('updated');
      expect(out.sourceCommit).toBe(changeCommit); // the Brand change, not the later unrelated HEAD
      expect(out.updatedTargets).toEqual(['app/icon.png']);
      expect(readJ(root, PATHS.lock)).toMatchObject({ registryVersion: '1.1.0', contentHash: reg.contentHash, sourceCommit: changeCommit, assetCount: 33 });
      expect(readFileSync(join(root, 'app/icon.png')).equals(newBytes)).toBe(true);
      expect(readFileSync(join(root, PATHS.consumption)).equals(consumptionBefore)).toBe(true);
      expect(validateBrandConsumer({ root }).errors).toEqual([]);
    } finally { rmSync(src, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects an invalid upstream snapshot and writes nothing', () => {
    const src = sourceRepo(); const root = fixtureRoot();
    try {
      const regPath = join(src, CANONICAL_PATH_PREFIX, 'registry.json');
      const reg = JSON.parse(readFileSync(regPath, 'utf8'));
      reg.assets[0].variant = 'tampered'; // contentHash no longer recomputes
      writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
      git(src, 'commit', '-qam', 'bad');
      const before = lockOf(root);
      expect(runBrandSync({ source: src, repoRoot: root }).result).toBe('rejected');
      expect(lockOf(root).equals(before)).toBe(true);
    } finally { rmSync(src, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects when a current binding would no longer resolve (binding change needs review)', () => {
    const src = sourceRepo(); const root = fixtureRoot();
    try {
      const regPath = join(src, CANONICAL_PATH_PREFIX, 'registry.json');
      const reg = JSON.parse(readFileSync(regPath, 'utf8'));
      reg.assets.find((a: any) => a.assetId === 'app-icon-on-green-png-180').status = 'SUPERSEDED';
      reg.registryVersion = '2.0.0';
      reg.contentHash = computeBrandContentHash(reg);
      writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
      git(src, 'commit', '-qam', 'supersede');
      const out = runBrandSync({ source: src, repoRoot: root });
      expect(out.result).toBe('rejected');
      expect((out.errors ?? []).join('\n')).toMatch(/reviewed binding change is required/);
    } finally { rmSync(src, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
  });
});
