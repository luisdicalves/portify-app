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
