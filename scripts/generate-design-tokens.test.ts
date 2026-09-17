import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCss } from './generate-design-tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(REPO_ROOT, 'vendor');

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadFixture() {
  return {
    manifest: readJson(join(VENDOR_DIR, 'design-system', 'manifest.json')),
    tokens: readJson(join(VENDOR_DIR, 'design-system', 'tokens.json')),
  };
}

describe('generateCss', () => {
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

  it('uses only the isolated --ds- namespace, never portify-app\'s existing custom properties', () => {
    const css = generateCss(loadFixture());
    // Every custom property declared must start with --ds-
    const declared = [...css.matchAll(/^\s*(--[a-zA-Z0-9-]+):/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(name.startsWith('--ds-')).toBe(true);
    }
    // Must never reference an existing App token by name (no var(--on-surface) etc.)
    // for the color/radius/spacing domains this current 3.0.0 fixture actually
    // exercises. The two Typography family-binding exceptions (--font-sans,
    // --font-mono — an explicit, App-owned, Tranche 2B-approved binding, not
    // automatic name-based bridging) are asserted narrowly in the Typography
    // describe block below, against a fixture that actually carries them.
    expect(css).not.toMatch(/var\(--(?!ds-)/);
  });

  it('emits exactly the approved ten spacing primitives, verbatim canonical names', () => {
    const css = generateCss(loadFixture());
    for (const px of [4, 6, 8, 10, 12, 14, 16, 18, 20, 24]) {
      expect(css).toContain(`--ds-space-${px}: ${px}px;`);
    }
    expect(css).not.toContain('--ds-space-2:');
    expect(css).not.toContain('32px');
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
});

// Controlled 3.1.0 Typography fixture — see scripts/lib/validate-design-tokens.test.ts
// for the rationale: mirrors real canonical values for realism, exists to
// exercise generator BEHAVIOR (naming, aliasing, counts, theme placement),
// never restated as a second canonical value table.
function typography31Fixture() {
  return {
    family: { primary: { name: 'Space Grotesk' }, structured: { name: 'Space Mono' } },
    style: {
      display: { family: 'primary', fontSize: '28px', lineHeight: '34px', fontWeight: 700, letterSpacing: '0em' },
      titleLg: { family: 'primary', fontSize: '24px', lineHeight: '30px', fontWeight: 700, letterSpacing: '0em' },
      titleMd: { family: 'primary', fontSize: '20px', lineHeight: '26px', fontWeight: 700, letterSpacing: '0em' },
      heading: { family: 'primary', fontSize: '18px', lineHeight: '24px', fontWeight: 700, letterSpacing: '0em' },
      bodyLg: { family: 'primary', fontSize: '16px', lineHeight: '24px', fontWeight: 500, letterSpacing: '0em' },
      bodyMd: { family: 'primary', fontSize: '14px', lineHeight: '20px', fontWeight: 500, letterSpacing: '0em' },
      label: { family: 'primary', fontSize: '14px', lineHeight: '18px', fontWeight: 500, letterSpacing: '0em' },
      caption: { family: 'primary', fontSize: '12px', lineHeight: '16px', fontWeight: 500, letterSpacing: '0em' },
      numericHero: { family: 'structured', fontSize: '32px', lineHeight: '38px', fontWeight: 700, letterSpacing: '0em' },
      numericPrimary: { family: 'structured', fontSize: '24px', lineHeight: '30px', fontWeight: 700, letterSpacing: '0em' },
      numericSecondary: { family: 'structured', fontSize: '18px', lineHeight: '24px', fontWeight: 400, letterSpacing: '0em' },
      numericInline: { family: 'structured', fontSize: '16px', lineHeight: '22px', fontWeight: 400, letterSpacing: '0em' },
      numericMeta: { family: 'structured', fontSize: '14px', lineHeight: '18px', fontWeight: 400, letterSpacing: '0em' },
    },
    role: {
      brandDisplay: 'display',
      financialHero: 'numericHero',
      pageTitle: 'titleLg',
      sectionTitle: 'heading',
      cardFinancialValue: 'numericPrimary',
      body: 'bodyLg',
      secondaryBody: 'bodyMd',
      label: 'caption',
      metadata: 'numericMeta',
    },
  };
}

function load31Fixture() {
  const base = loadFixture();
  const typography = typography31Fixture();
  const tokens = { ...base.tokens, domainsIncluded: [...base.tokens.domainsIncluded, 'typography'], typography };
  const manifest = { ...base.manifest, schemaVersion: '3.1.0', artifactVersion: '3.1.0', generatorVersion: '3.1.0', domainsIncluded: tokens.domainsIncluded };
  return { manifest, tokens };
}

function declaredVarNames(css: string) {
  return [...css.matchAll(/^\s*(--[a-zA-Z0-9-]+):/gm)].map((m) => m[1]);
}

describe('generateCss — Stage 1 critical requirement: unchanged for a 3.0.0-shaped snapshot', () => {
  it('produces zero Typography output when tokens.typography is absent', () => {
    const { manifest, tokens } = loadFixture();
    expect(tokens.typography).toBeUndefined();
    const css = generateCss({ manifest, tokens });
    expect(css).not.toContain('ds-typography');
  });
});

describe('generateCss — Typography (3.1.0 fixture)', () => {
  it('is deterministic with Typography present', () => {
    const fixture = load31Fixture();
    expect(generateCss(fixture)).toBe(generateCss(fixture));
  });

  it('emits exactly 2 family variables, bound via this App\'s own next/font CSS variables (the one approved namespace exception)', () => {
    const css = generateCss(load31Fixture());
    expect(css).toContain('--ds-typography-family-primary: var(--font-sans);');
    expect(css).toContain('--ds-typography-family-structured: var(--font-mono);');
  });

  it('emits five variables for every one of the 13 style slots, values read from the fixture (never embedded in the generator)', () => {
    const css = generateCss(load31Fixture());
    expect(css).toContain('--ds-typography-style-display-font-family: var(--ds-typography-family-primary);');
    expect(css).toContain('--ds-typography-style-display-font-size: 28px;');
    expect(css).toContain('--ds-typography-style-display-line-height: 34px;');
    expect(css).toContain('--ds-typography-style-display-font-weight: 700;');
    expect(css).toContain('--ds-typography-style-display-letter-spacing: 0em;');
    // structured-family slot
    expect(css).toContain('--ds-typography-style-numeric-primary-font-family: var(--ds-typography-family-structured);');
    expect(css).toContain('--ds-typography-style-numeric-primary-font-size: 24px;');
  });

  it('emits five alias variables for every one of the 9 roles, as var() references — never copied literal values', () => {
    const css = generateCss(load31Fixture());
    expect(css).toContain('--ds-typography-role-brand-display-font-size: var(--ds-typography-style-display-font-size);');
    expect(css).toContain('--ds-typography-role-brand-display-line-height: var(--ds-typography-style-display-line-height);');
    expect(css).toContain('--ds-typography-role-brand-display-font-weight: var(--ds-typography-style-display-font-weight);');
    expect(css).toContain('--ds-typography-role-brand-display-letter-spacing: var(--ds-typography-style-display-letter-spacing);');
    expect(css).toContain('--ds-typography-role-brand-display-font-family: var(--ds-typography-style-display-font-family);');
    expect(css).toContain(
      '--ds-typography-role-card-financial-value-font-size: var(--ds-typography-style-numeric-primary-font-size);',
    );
    // No role line may contain a literal px/em/integer value directly — every role value is a var() reference.
    const roleLines = css.split('\n').filter((l) => l.includes('ds-typography-role-'));
    expect(roleLines.length).toBeGreaterThan(0);
    for (const line of roleLines) {
      expect(line).toMatch(/: var\(--ds-typography-style-[a-z0-9-]+-[a-z-]+\);/);
    }
  });

  it('produces exactly 112 Typography variables (2 family + 13*5 style + 9*5 role) for a complete fixture', () => {
    const css = generateCss(load31Fixture());
    const names = new Set(declaredVarNames(css));
    const typographyNames = [...names].filter((n) => n.startsWith('--ds-typography-'));
    expect(typographyNames.length).toBe(112);
  });

  it('produces exactly 153 distinct variables total once Typography is added to the current 41 (color/radius/spacing)', () => {
    const css = generateCss(load31Fixture());
    const names = new Set(declaredVarNames(css));
    expect(names.size).toBe(153);
  });

  it('does not duplicate Typography variables under [data-theme=\'dark\'] (TYPO-009: static, theme-independent in v1)', () => {
    const css = generateCss(load31Fixture());
    const darkMatch = css.match(/\[data-theme='dark'\] \{([\s\S]*?)\}/);
    expect(darkMatch).not.toBeNull();
    expect(darkMatch![1]).not.toContain('ds-typography');
  });

  it('every declared variable is either --ds- prefixed, and every var() reference is --ds- prefixed except the two approved family bindings', () => {
    const css = generateCss(load31Fixture());
    for (const name of declaredVarNames(css)) {
      expect(name.startsWith('--ds-')).toBe(true);
    }
    const references = [...css.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)].map((m) => m[1]);
    for (const ref of references) {
      expect(ref.startsWith('--ds-') || ref === '--font-sans' || ref === '--font-mono').toBe(true);
    }
  });

  it('camelCase style/role keys transform to kebab-case exactly, mechanically — no manual per-key table', () => {
    const css = generateCss(load31Fixture());
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
