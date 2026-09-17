import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCss } from './generate-design-tokens.mjs';
import { makeLegacy30Fixture, makeTypography31Fixture } from './lib/design-tokens-fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(REPO_ROOT, 'vendor');

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// LIVE VENDOR FIXTURE — tracks whatever is actually currently vendored.
// Appropriate ONLY for integration/drift tests. As of Tranche 2B Stage 2
// this is 3.1.0-shaped (includes Typography) — do not assume any
// particular shape here; tests relying on a specific historical shape use
// the explicit synthetic fixtures below instead (design-tokens-fixtures.mjs).
function loadFixture() {
  return {
    manifest: readJson(join(VENDOR_DIR, 'design-system', 'manifest.json')),
    tokens: readJson(join(VENDOR_DIR, 'design-system', 'tokens.json')),
  };
}

function declaredVarNames(css: string) {
  return [...css.matchAll(/^\s*(--[a-zA-Z0-9-]+):/gm)].map((m) => m[1]);
}

const APPROVED_EXTERNAL_VAR_REFS = new Set(['--font-sans', '--font-mono']);

/** The full external-reference-namespace contract, as a standalone,
 * independently-testable checker: every declared custom property must be
 * --ds-* prefixed; every var() reference must be either --ds-* or exactly
 * one of the two approved App-owned font bridges (not a broader --font-*
 * pattern). Returns a list of violation descriptions (empty = compliant). */
function findNamespaceViolations(css: string): string[] {
  const violations: string[] = [];
  for (const name of declaredVarNames(css)) {
    if (!name.startsWith('--ds-')) violations.push(`declared property outside --ds-*: ${name}`);
  }
  const references = [...css.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)].map((m) => m[1]);
  for (const ref of references) {
    if (!ref.startsWith('--ds-') && !APPROVED_EXTERNAL_VAR_REFS.has(ref)) {
      violations.push(`var() reference outside --ds-* and outside the approved font bridge set: ${ref}`);
    }
  }
  return violations;
}

/** --ds-space-* entries found inside the :root block only — scoped
 * strictly to spacing, so an unrelated domain's legitimate value (e.g.
 * Typography's numericHero at 32px) can never affect this check. */
function spacingVarEntries(css: string): Record<string, string> {
  const rootMatch = css.match(/:root \{([\s\S]*?)\}/);
  const rootBody = rootMatch ? rootMatch[1] : '';
  const entries: Record<string, string> = {};
  for (const m of rootBody.matchAll(/--ds-(space-\d+):\s*([^;]+);/g)) {
    entries[m[1]] = m[2];
  }
  return entries;
}

describe('generateCss — live vendored snapshot (integration)', () => {
  it('is deterministic — two runs against the same input are byte-identical', () => {
    const fixture = loadFixture();
    const first = generateCss(fixture);
    const second = generateCss(fixture);
    expect(first).toBe(second);
  });

  it('matches the currently committed app/generated/design-tokens.css exactly (drift check)', () => {
    const fixture = loadFixture();
    const fresh = generateCss(fixture);
    const committed = readFileSync(join(REPO_ROOT, 'app', 'generated', 'design-tokens.css'), 'utf8');
    expect(fresh).toBe(committed);
  });

  it('emits both radius keys with their canonical values', () => {
    const css = generateCss(loadFixture());
    expect(css).toContain('--ds-radius-btn: 14px;');
    expect(css).toContain('--ds-radius-card: 18px;');
  });

  it('emits a Light block (:root) and a Dark block ([data-theme=\'dark\']) with matching key sets', () => {
    const css = generateCss(loadFixture());
    const rootMatch = css.match(/:root \{([\s\S]*?)\}/);
    const darkMatch = css.match(/\[data-theme='dark'\] \{([\s\S]*?)\}/);
    expect(rootMatch).not.toBeNull();
    expect(darkMatch).not.toBeNull();
    const rootColorKeys = [...(rootMatch![1].matchAll(/--(ds-color-[a-zA-Z0-9-]+):/g))].map((m) => m[1]);
    const darkColorKeys = [...(darkMatch![1].matchAll(/--(ds-color-[a-zA-Z0-9-]+):/g))].map((m) => m[1]);
    expect(rootColorKeys.sort()).toEqual(darkColorKeys.sort());
    expect(rootColorKeys.length).toBeGreaterThan(0);
  });

  it('produces exactly 153 distinct variables: 41 existing (color/radius/spacing) + 112 Typography, now that live vendor is 3.1.0', () => {
    const css = generateCss(loadFixture());
    const names = new Set(declaredVarNames(css));
    const typographyNames = [...names].filter((n) => n.startsWith('--ds-typography-'));
    expect(names.size).toBe(153);
    expect(typographyNames.length).toBe(112);
    expect(names.size - typographyNames.length).toBe(41);
  });
});

describe('generateCss — external reference namespace contract', () => {
  it('the live vendored snapshot violates neither the declared-property nor the var()-reference namespace rule', () => {
    const css = generateCss(loadFixture());
    expect(findNamespaceViolations(css)).toEqual([]);
  });

  it('detects a declared custom property outside --ds-*', () => {
    const bad = ":root {\n  --not-ds-prefixed: 1px;\n}\n";
    expect(findNamespaceViolations(bad)).toEqual(['declared property outside --ds-*: --not-ds-prefixed']);
  });

  it('detects a var() reference outside --ds-* and outside the approved font bridge set', () => {
    const bad = ":root {\n  --ds-example: var(--not-approved);\n}\n";
    expect(findNamespaceViolations(bad)).toEqual([
      'var() reference outside --ds-* and outside the approved font bridge set: --not-approved',
    ]);
  });

  it('allows exactly the two approved font bridges and rejects any other --font-* reference (not a broad pattern allowance)', () => {
    expect(findNamespaceViolations(":root {\n  --ds-x: var(--font-sans);\n}\n")).toEqual([]);
    expect(findNamespaceViolations(":root {\n  --ds-x: var(--font-mono);\n}\n")).toEqual([]);
    expect(findNamespaceViolations(":root {\n  --ds-x: var(--font-serif);\n}\n")).toEqual([
      'var() reference outside --ds-* and outside the approved font bridge set: --font-serif',
    ]);
  });
});

describe('generateCss — spacing invariant (scoped to --ds-space-*, immune to other domains\' legitimate values)', () => {
  it('emits exactly the approved ten spacing primitives, verbatim canonical names and values, and nothing else', () => {
    const css = generateCss(loadFixture());
    const entries = spacingVarEntries(css);
    const expected: Record<string, string> = {};
    for (const px of [4, 6, 8, 10, 12, 14, 16, 18, 20, 24]) expected[`space-${px}`] = `${px}px`;
    expect(entries).toEqual(expected);
  });

  it('Typography\'s legitimate 32px (numericHero fontSize) does not corrupt the spacing check', () => {
    const css = generateCss(loadFixture());
    expect(css).toContain('32px'); // present somewhere (Typography) —
    const entries = spacingVarEntries(css);
    expect(Object.values(entries)).not.toContain('32px'); // but never under --ds-space-*
  });
});

describe('generateCss — Typography-absent (explicit synthetic 3.0-shaped fixture, not live-vendor-dependent)', () => {
  it('produces zero Typography output when tokens.typography is absent', () => {
    const { manifest, tokens } = makeLegacy30Fixture();
    expect(tokens.typography).toBeUndefined();
    const css = generateCss({ manifest, tokens });
    expect(css).not.toContain('ds-typography');
  });
});

describe('generateCss — Typography (explicit synthetic 3.1.0 fixture, not live-vendor-dependent)', () => {
  it('is deterministic with Typography present', () => {
    const fixture = makeTypography31Fixture();
    expect(generateCss(fixture)).toBe(generateCss(fixture));
  });

  it('emits exactly 2 family variables, bound via this App\'s own next/font CSS variables (the one approved namespace exception)', () => {
    const css = generateCss(makeTypography31Fixture());
    expect(css).toContain('--ds-typography-family-primary: var(--font-sans);');
    expect(css).toContain('--ds-typography-family-structured: var(--font-mono);');
  });

  it('emits five variables for every one of the 13 style slots, values read from the fixture (never embedded in the generator)', () => {
    const css = generateCss(makeTypography31Fixture());
    expect(css).toContain('--ds-typography-style-display-font-family: var(--ds-typography-family-primary);');
    expect(css).toContain('--ds-typography-style-display-font-size: 28px;');
    expect(css).toContain('--ds-typography-style-display-line-height: 34px;');
    expect(css).toContain('--ds-typography-style-display-font-weight: 700;');
    expect(css).toContain('--ds-typography-style-display-letter-spacing: 0em;');
    expect(css).toContain('--ds-typography-style-numeric-primary-font-family: var(--ds-typography-family-structured);');
    expect(css).toContain('--ds-typography-style-numeric-primary-font-size: 24px;');
  });

  it('emits five alias variables for every one of the 9 roles, as var() references — never copied literal values', () => {
    const css = generateCss(makeTypography31Fixture());
    expect(css).toContain('--ds-typography-role-brand-display-font-size: var(--ds-typography-style-display-font-size);');
    expect(css).toContain('--ds-typography-role-brand-display-line-height: var(--ds-typography-style-display-line-height);');
    expect(css).toContain('--ds-typography-role-brand-display-font-weight: var(--ds-typography-style-display-font-weight);');
    expect(css).toContain('--ds-typography-role-brand-display-letter-spacing: var(--ds-typography-style-display-letter-spacing);');
    expect(css).toContain('--ds-typography-role-brand-display-font-family: var(--ds-typography-style-display-font-family);');
    expect(css).toContain(
      '--ds-typography-role-card-financial-value-font-size: var(--ds-typography-style-numeric-primary-font-size);',
    );
    const roleLines = css.split('\n').filter((l) => l.includes('ds-typography-role-'));
    expect(roleLines.length).toBeGreaterThan(0);
    for (const line of roleLines) {
      expect(line).toMatch(/: var\(--ds-typography-style-[a-z0-9-]+-[a-z-]+\);/);
    }
  });

  it('produces exactly 112 Typography variables (2 family + 13*5 style + 9*5 role)', () => {
    const css = generateCss(makeTypography31Fixture());
    const names = new Set(declaredVarNames(css));
    const typographyNames = [...names].filter((n) => n.startsWith('--ds-typography-'));
    expect(typographyNames.length).toBe(112);
  });

  it('does not duplicate Typography variables under [data-theme=\'dark\'] (TYPO-009: static, theme-independent in v1)', () => {
    const css = generateCss(makeTypography31Fixture());
    const darkMatch = css.match(/\[data-theme='dark'\] \{([\s\S]*?)\}/);
    expect(darkMatch).not.toBeNull();
    expect(darkMatch![1]).not.toContain('ds-typography');
  });

  it('camelCase style/role keys transform to kebab-case exactly, mechanically — no manual per-key table', () => {
    const css = generateCss(makeTypography31Fixture());
    expect(css).toContain('--ds-typography-style-title-lg-font-size:');
    expect(css).toContain('--ds-typography-style-numeric-secondary-font-size:');
    expect(css).toContain('--ds-typography-role-section-title-font-size:');
    expect(css).toContain('--ds-typography-role-card-financial-value-font-size:');
  });
});

describe('app/layout.tsx runtime wiring', () => {
  it('imports the generated design-tokens stylesheet', () => {
    const layoutSource = readFileSync(join(REPO_ROOT, 'app', 'layout.tsx'), 'utf8');
    expect(layoutSource).toMatch(/import ['"]\.\/generated\/design-tokens\.css['"]/);
  });

  it('still imports globals.css unchanged (existing token authority untouched)', () => {
    const layoutSource = readFileSync(join(REPO_ROOT, 'app', 'layout.tsx'), 'utf8');
    expect(layoutSource).toMatch(/import ['"]\.\/globals\.css['"]/);
  });
});
