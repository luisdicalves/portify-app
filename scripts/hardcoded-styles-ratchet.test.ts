import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanRepository } from './lib/hardcoded-styles/index.mjs';
import { buildBaseline, serializeBaseline } from './lib/hardcoded-styles/baseline.mjs';
import { compareBaselines, evaluateRatchet, loadBaselineAtRef } from './lib/hardcoded-styles/ratchet.mjs';

/** Scan a throwaway tree — never the real App. */
function scanTree(files: Record<string, string>): any {
  const root = mkdtempSync(join(tmpdir(), 'hardstyle-ratchet-'));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, text);
    }
    return scanRepository(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const page = (body: string) => ({ 'app/a/page.tsx': `export function Alpha() { return <>${body}</>; }\n` });
const clone = (x: any) => JSON.parse(JSON.stringify(x));

const BASE_BODY = `<div style={{ fontSize: 20 }} /><div style={{ fontSize: 20 }} /><div style={{ color: '#ff0000' }} />`;
const baseline = buildBaseline(scanTree(page(BASE_BODY)));

describe('HARDSTYLE-006 source ratchet', () => {
  const run = (body: string, previousBaseline?: any) =>
    evaluateRatchet({ baseline, previousBaseline, scan: scanTree(page(body)) });

  it('passes an unchanged tree and counts every signature as UNCHANGED', () => {
    const ev = run(BASE_BODY);
    expect(ev.result).toBe('PASS');
    expect(ev.summary).toMatchObject({ NEW: 0, INCREASED: 0, UNCHANGED: 2, REDUCED: 0, REMOVED: 0 });
  });

  it('fails a new ENFORCED_V1 signature', () => {
    const ev = run(`${BASE_BODY}<p style={{ padding: 13 }} />`);
    expect(ev.result).toBe('FAIL');
    expect(ev.failures).toContain('NEW_SIGNATURES');
    expect(ev.source.newSignatures.map((e: any) => [e.rule, e.property, e.normalizedValue]))
      .toEqual([['SPACING_LITERAL', 'padding', '13']]);
  });

  it('fails an increased multiplicity of an existing signature', () => {
    const ev = run(`${BASE_BODY}<b style={{ fontSize: 20 }} />`);
    expect(ev.result).toBe('FAIL');
    expect(ev.failures).toEqual(['MULTIPLICITY_INCREASED']);
    expect(ev.source.increased[0]).toMatchObject({ baseline: 2, current: 3 });
  });

  it('passes a reduced multiplicity and reports it', () => {
    const ev = run(`<div style={{ fontSize: 20 }} /><div style={{ color: '#ff0000' }} />`);
    expect(ev.result).toBe('PASS');
    expect(ev.summary).toMatchObject({ NEW: 0, INCREASED: 0, REDUCED: 1, REMOVED: 0, UNCHANGED: 1 });
  });

  it('passes a removed signature and reports it', () => {
    const ev = run(`<div style={{ fontSize: 20 }} /><div style={{ fontSize: 20 }} />`);
    expect(ev.result).toBe('PASS');
    expect(ev.summary).toMatchObject({ REMOVED: 1, UNCHANGED: 1 });
  });

  it('ignores REVIEW_REQUIRED and dynamic findings', () => {
    const ev = run(`${BASE_BODY}<i style={{ width: 333, top: 7, fontSize: size }} />`);
    expect(ev.result).toBe('PASS');
  });

  it('ignores BLOCKED findings, including ones embedding a colour literal (HARDSTYLE-013)', () => {
    const ev = run(`${BASE_BODY}<i style={{ boxShadow: '0 1px 2px #123456', transition: 'all .2s' }} />`);
    expect(ev.result).toBe('PASS');
  });

  it('fails an invalid (tampered) baseline even when the source matches it', () => {
    const tampered = clone(baseline);
    tampered.entries[0].normalizedValue = 'tampered';
    const ev = evaluateRatchet({ baseline: tampered, scan: scanTree(page(BASE_BODY)) });
    expect(ev.failures).toContain('BASELINE_INVALID');
    expect(ev.result).toBe('FAIL');
  });

  it('fails when a baseline entry is deleted while the violation remains', () => {
    const pruned = clone(baseline);
    pruned.entries = pruned.entries.filter((e: any) => e.property !== 'color');
    const ev = evaluateRatchet({ baseline: pruned, scan: scanTree(page(BASE_BODY)) });
    expect(ev.failures).toContain('NEW_SIGNATURES');
  });
});

describe('HARDSTYLE-006 baseline evolution guard', () => {
  const grownScan = scanTree(page(`${BASE_BODY}<p style={{ padding: 13 }} /><b style={{ fontSize: 20 }} />`));
  const grown = buildBaseline(grownScan);

  it('compareBaselines reports equal baselines as no growth', () => {
    const d = compareBaselines(baseline, clone(baseline));
    expect([d.added, d.increased, d.decreased, d.removed].map((x) => x.length)).toEqual([0, 0, 0, 0]);
    expect(d.baselineGrew).toBe(false);
  });

  it('fails source + baseline growth together — the release-critical bypass', () => {
    // Source control alone passes: the grown baseline covers the grown source.
    const sourceOnly = evaluateRatchet({ baseline: grown, scan: grownScan });
    expect(sourceOnly.result).toBe('PASS');
    // The evolution guard catches it.
    const ev = evaluateRatchet({ baseline: grown, previousBaseline: baseline, scan: grownScan });
    expect(ev.result).toBe('FAIL');
    expect(ev.failures).toEqual(['BASELINE_NEW_SIGNATURES', 'BASELINE_MULTIPLICITY_INCREASES']);
    expect(ev.summary).toMatchObject({ NEW: 0, INCREASED: 0, BASELINE_NEW_SIGNATURES: 1, BASELINE_MULTIPLICITY_INCREASES: 1 });
  });

  it('passes a baseline that shrinks alongside the source', () => {
    const smallerScan = scanTree(page(`<div style={{ fontSize: 20 }} />`));
    const ev = evaluateRatchet({ baseline: buildBaseline(smallerScan), previousBaseline: baseline, scan: smallerScan });
    expect(ev.result).toBe('PASS');
    expect(ev.evolution.decreased).toHaveLength(1);
    expect(ev.evolution.removed).toHaveLength(1);
  });

  it('allows the one-time introduction when the base revision had no baseline', () => {
    const ev = evaluateRatchet({ baseline, previousBaseline: null, scan: scanTree(page(BASE_BODY)) });
    expect(ev.evolution.status).toBe('INTRODUCED');
    expect(ev.result).toBe('PASS');
  });

  it('marks evolution NOT_CHECKED when no base was supplied', () => {
    expect(evaluateRatchet({ baseline, scan: scanTree(page(BASE_BODY)) }).evolution.status).toBe('NOT_CHECKED');
  });
});

describe('loadBaselineAtRef (fails closed)', () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

  function repo() {
    const root = mkdtempSync(join(tmpdir(), 'hardstyle-ratchet-git-'));
    git(root, 'init', '-q');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'empty');
    const empty = git(root, 'rev-parse', 'HEAD');
    writeFileSync(join(root, 'hardcoded-styles.baseline.json'), serializeBaseline(baseline));
    git(root, 'add', '.');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'baseline');
    return { root, empty, withBaseline: git(root, 'rev-parse', 'HEAD') };
  }

  it('reads the baseline recorded at a revision', () => {
    const r = repo();
    try {
      expect(loadBaselineAtRef(r.root, r.withBaseline)).toEqual(baseline);
    } finally { rmSync(r.root, { recursive: true, force: true }); }
  });

  it('returns null only when the revision exists without a baseline (introduction)', () => {
    const r = repo();
    try {
      expect(loadBaselineAtRef(r.root, r.empty)).toBeNull();
    } finally { rmSync(r.root, { recursive: true, force: true }); }
  });

  it('throws for a revision that is not available, an all-zero SHA, or no ref', () => {
    const r = repo();
    try {
      expect(() => loadBaselineAtRef(r.root, 'f'.repeat(40))).toThrow(/not available/);
      expect(() => loadBaselineAtRef(r.root, '0'.repeat(40))).toThrow(/no usable/);
      expect(() => loadBaselineAtRef(r.root, '')).toThrow(/no usable/);
    } finally { rmSync(r.root, { recursive: true, force: true }); }
  });
});

describe('zero-percent radius precedence (HARDSTYLE-014 over HARDSTYLE-015)', () => {
  const radiusRules = (scan: any) =>
    scan.findings.filter((f: any) => f.property === 'borderRadius' || f.property === 'border-radius')
      .map((f: any) => `${f.normalizedValue} ${f.rule}`).sort();

  it('JSX: 0, 0px and 0% are neutral; non-zero percentages are REVIEW geometry', () => {
    const scan = scanTree(page(`
      <a style={{ borderRadius: 0 }} /><a style={{ borderRadius: '0px' }} /><a style={{ borderRadius: '0%' }} />
      <a style={{ borderRadius: '50%' }} /><a style={{ borderRadius: '25%' }} /><a style={{ borderRadius: '100%' }} />
      <a style={{ borderRadius: 99 }} />`));
    expect(radiusRules(scan)).toEqual(
      ['50% GEOMETRY_LITERAL', '25% GEOMETRY_LITERAL', '100% GEOMETRY_LITERAL', '99 BORDER_RADIUS_LITERAL'].sort(),
    );
  });

  it('CSS: 0, 0px and 0% are neutral; non-zero percentages are REVIEW geometry', () => {
    const scan = scanTree({
      'components/x/x.module.css':
        '.a{border-radius:0}.b{border-radius:0px}.c{border-radius:0%}.d{border-radius:50%}.e{border-radius:25%}.f{border-radius:99px}\n',
    });
    expect(radiusRules(scan)).toEqual(
      ['50% GEOMETRY_LITERAL', '25% GEOMETRY_LITERAL', '99px BORDER_RADIUS_LITERAL'].sort(),
    );
  });

  it('keeps both 0% (neutral) and non-zero percentages (REVIEW) out of the baseline', () => {
    const b = buildBaseline(scanTree(page(`<a style={{ borderRadius: '0%' }} /><a style={{ borderRadius: '50%' }} />`)));
    expect(b.entries).toHaveLength(0);
  });
});
