import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepository } from './lib/hardcoded-styles/index.mjs';
import {
  buildBaseline, serializeBaseline, validateBaseline, compareToBaseline, BASELINE_RULES,
} from './lib/hardcoded-styles/baseline.mjs';

/** Scan a throwaway tree — never the real App. */
function scanTree(files: Record<string, string>): any {
  const root = mkdtempSync(join(tmpdir(), 'hardstyle-baseline-'));
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
const page = (name: string, body: string) => `export function ${name}() { return <>${body}</>; }\n`;
const clone = (x: any) => JSON.parse(JSON.stringify(x));

const TREE = {
  'app/a/page.tsx': page('Alpha', `
    <div style={{ fontSize: 20, padding: 8 }} />
    <div style={{ fontSize: 20 }} />
    <div style={{ color: '#ff0000', borderRadius: 12 }} />
    <div style={{ width: 100, boxShadow: '0 1px 2px rgba(0,0,0,.3)', fontSize: size }} />`),
};

describe('baseline eligibility (HARDSTYLE-012/013)', () => {
  const scan = scanTree(TREE);
  const b = buildBaseline(scan);

  it('admits only the four approved v1 rules', () => {
    expect(b.policy.rules).toEqual([...BASELINE_RULES]);
    expect(new Set(b.entries.map((e: any) => e.rule))).toEqual(
      new Set(['TEXT_TYPOGRAPHY_LITERAL', 'SPACING_LITERAL', 'RAW_VISUAL_COLOR_LITERAL', 'BORDER_RADIUS_LITERAL']),
    );
  });

  it('excludes REVIEW_REQUIRED, dynamic, BLOCKED and HARDSTYLE-013 embedded literals', () => {
    const props = b.entries.map((e: any) => e.property);
    expect(props).not.toContain('width'); // REVIEW geometry
    expect(props).not.toContain('boxShadow'); // BLOCKED, embeds a colour
    expect(b.entries.some((e: any) => e.normalizedValue === '<dynamic>')).toBe(false);
  });

  it('accounts for exactly the ENFORCED_V1 debt', () => {
    expect(validateBaseline(b, { scanResult: scan })).toEqual({ valid: true, errors: [] });
    expect(b.entries.length).toBe(scan.counts.enforcedV1Signatures);
    expect(b.entries.reduce((n: number, e: any) => n + e.multiplicity, 0)).toBe(scan.counts.enforcedV1);
  });

  it('is deterministic and carries no timestamp, line, column or commit SHA', () => {
    const text = serializeBaseline(b);
    expect(serializeBaseline(buildBaseline(scanTree(TREE)))).toBe(text);
    expect(text).not.toMatch(/"(line|column|generatedAt|timestamp|commit|status)"/);
  });
});

describe('baseline validation (§20)', () => {
  const base = buildBaseline(scanTree(TREE));
  const invalid = (mutate: (b: any) => void) => {
    const b = clone(base);
    mutate(b);
    return validateBaseline(b).valid;
  };

  it('accepts the generated baseline', () => { expect(validateBaseline(base).valid).toBe(true); });
  it('rejects an unrecognised schema version', () => { expect(invalid((b) => { b.schemaVersion = '9.9.9'; })).toBe(false); });
  it('rejects a mismatched identity version', () => { expect(invalid((b) => { b.findingIdentityVersion = 99; })).toBe(false); });
  it('rejects a widened rule set', () => { expect(invalid((b) => { b.policy.rules.push('GEOMETRY_LITERAL'); })).toBe(false); });
  it('rejects unsorted entries', () => { expect(invalid((b) => { b.entries.reverse(); })).toBe(false); });
  it('rejects duplicate signatures', () => { expect(invalid((b) => { b.entries.push(clone(b.entries[0])); })).toBe(false); });
  it('rejects a zero multiplicity', () => { expect(invalid((b) => { b.entries[0].multiplicity = 0; })).toBe(false); });
  it('rejects a non-integer multiplicity', () => { expect(invalid((b) => { b.entries[0].multiplicity = 1.5; })).toBe(false); });
  it('rejects an identity field that no longer matches its signature', () => {
    expect(invalid((b) => { b.entries[0].normalizedValue = 'tampered'; })).toBe(false);
  });
  it('rejects a line number sneaking into an entry', () => { expect(invalid((b) => { b.entries[0].line = 3; })).toBe(false); });
  it('rejects a non-eligible (REVIEW/BLOCKED) rule entry', () => {
    expect(invalid((b) => { b.entries[0].rule = 'ELEVATION_LITERAL'; })).toBe(false);
  });
  it('rejects a count that does not match the scan', () => {
    const scan = scanTree(TREE);
    const b = clone(base);
    b.entries[0].multiplicity += 1;
    expect(validateBaseline(b, { scanResult: scan }).valid).toBe(false);
  });
});

describe('ratchet identity behaviour (HARDSTYLE-005/006)', () => {
  const baseline = buildBaseline(scanTree({ 'app/a/page.tsx': page('Alpha', `<div style={{ fontSize: 20 }} /><div style={{ fontSize: 20 }} />`) }));

  it('preserves multiplicity, so one more identical occurrence is observable debt growth', () => {
    expect(baseline.entries).toHaveLength(1);
    expect(baseline.entries[0].multiplicity).toBe(2);
    const third = scanTree({ 'app/a/page.tsx': page('Alpha', `<div style={{ fontSize: 20 }} /><div style={{ fontSize: 20 }} /><b style={{ fontSize: 20 }} />`) });
    const d = compareToBaseline(baseline, third);
    expect(d.increased).toHaveLength(1);
    expect(d.increased[0]).toMatchObject({ baseline: 2, current: 3 });
    expect(d.debtIncreased).toBe(true);
  });

  it('does not churn when lines are added or code is reformatted', () => {
    const reformatted = scanTree({ 'app/a/page.tsx': `\n\n// moved down\n${page('Alpha', `\n  <div\n    style={{\n      fontSize: 20,\n    }}\n  />\n  <div style={{ fontSize: 20 }} />`)}` });
    const d = compareToBaseline(baseline, reformatted);
    expect([d.newSignatures, d.increased, d.decreased, d.removed].map((x) => x.length)).toEqual([0, 0, 0, 0]);
    expect(serializeBaseline(buildBaseline(reformatted))).toBe(serializeBaseline(baseline));
  });

  it('keeps identity when a literal moves within the same named scope', () => {
    const moved = scanTree({ 'app/a/page.tsx': page('Alpha', `<p>x</p><div style={{ fontSize: 20 }} /><i /><div style={{ fontSize: 20 }} />`) });
    expect(compareToBaseline(baseline, moved).debtIncreased).toBe(false);
  });

  it('treats a move to another named scope as removed + new', () => {
    const other = scanTree({ 'app/a/page.tsx': page('Beta', `<div style={{ fontSize: 20 }} /><div style={{ fontSize: 20 }} />`) });
    const d = compareToBaseline(baseline, other);
    expect(d.removed).toHaveLength(1);
    expect(d.newSignatures).toHaveLength(1);
    expect(d.debtIncreased).toBe(true);
  });

  it('treats a move to another file as removed + new', () => {
    const other = scanTree({ 'app/b/page.tsx': page('Alpha', `<div style={{ fontSize: 20 }} /><div style={{ fontSize: 20 }} />`) });
    const d = compareToBaseline(baseline, other);
    expect(d.removed).toHaveLength(1);
    expect(d.newSignatures).toHaveLength(1);
  });

  it('treats a changed literal value as a new violation', () => {
    const changed = scanTree({ 'app/a/page.tsx': page('Alpha', `<div style={{ fontSize: 21 }} /><div style={{ fontSize: 20 }} />`) });
    const d = compareToBaseline(baseline, changed);
    expect(d.newSignatures.map((e: any) => e.normalizedValue)).toEqual(['21']);
    expect(d.decreased).toHaveLength(1);
    expect(d.debtIncreased).toBe(true);
  });

  it('reports removal as debt reduced, never as a failure', () => {
    const fixed = scanTree({ 'app/a/page.tsx': page('Alpha', `<div style={{ fontSize: 'var(--ds-typography-style-body-size)' }} />`) });
    const d = compareToBaseline(baseline, fixed);
    expect(d.removed).toHaveLength(1);
    expect(d.debtIncreased).toBe(false);
    expect(d.debtReduced).toBe(true);
  });
});
