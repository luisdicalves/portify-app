import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scanSource, scanRepository, stableSignature, discoverFiles, EXCLUDED_PATHS, STATUS, ScanIntegrityError,
} from './lib/hardcoded-styles/index.mjs';
import { RULES, statusForRule, varCompliance, normalizeValue, classify, containsColorLiteral } from './lib/hardcoded-styles/taxonomy.mjs';
import { assertCompleteRead } from './lib/hardcoded-styles/integrity.mjs';

/** Scan a synthetic TSX source and keep only real (rule-bearing) findings. */
function tsx(src: string, path = 'app/sample/page.tsx'): any[] {
  return (scanSource(src, path) as any[]).filter((f: any) => f.rule !== null);
}
function css(src: string, path = 'app/globals.css'): any[] {
  return scanSource(src, path) as any[];
}
function rulesOf(findings: any[]) {
  return findings.map((f) => f.rule);
}
function component(body: string, name = 'Sample') {
  return `export default function ${name}() { return ${body}; }`;
}

// ---------------------------------------------------------------------------
// HARDSTYLE-005 — stable identity
// ---------------------------------------------------------------------------

describe('stable identity (HARDSTYLE-005)', () => {
  const base = component(`<div style={{ fontSize: 20 }} />`);

  it('is unchanged when line numbers move', () => {
    const shifted = `// a\n// b\n// c\n${base}`;
    const a = tsx(base)[0];
    const b = tsx(shifted)[0];
    expect(b.line).not.toBe(a.line);
    expect(stableSignature(b)).toBe(stableSignature(a));
  });

  it('is unchanged when column positions move', () => {
    const indented = component(`<div          style={{ fontSize: 20 }} />`);
    const a = tsx(base)[0];
    const b = tsx(indented)[0];
    expect(b.column).not.toBe(a.column);
    expect(stableSignature(b)).toBe(stableSignature(a));
  });

  it('is unchanged when formatting changes', () => {
    const reformatted = component(`<div\n  style={{\n    fontSize: 20,\n  }}\n/>`);
    expect(stableSignature(tsx(reformatted)[0])).toBe(stableSignature(tsx(base)[0]));
  });

  it('treats equivalent authored literals as one identity', () => {
    const upper = tsx(component(`<div style={{ color: '#FFF' }} />`))[0];
    const lower = tsx(component(`<div style={{ color: '#ffffff' }} />`))[0];
    expect(normalizeValue('#FFF')).toBe('#ffffff');
    expect(stableSignature(upper)).toBe(stableSignature(lower));
  });

  it('changes when the file changes', () => {
    const a = tsx(base, 'app/a/page.tsx')[0];
    const b = tsx(base, 'app/b/page.tsx')[0];
    expect(stableSignature(a)).not.toBe(stableSignature(b));
  });

  it('changes when the named scope changes', () => {
    const a = tsx(component(`<div style={{ fontSize: 20 }} />`, 'Alpha'))[0];
    const b = tsx(component(`<div style={{ fontSize: 20 }} />`, 'Beta'))[0];
    expect(a.namedScope).toBe('Alpha');
    expect(b.namedScope).toBe('Beta');
    expect(stableSignature(a)).not.toBe(stableSignature(b));
  });

  it('changes when the property changes', () => {
    const a = tsx(component(`<div style={{ fontSize: 20 }} />`))[0];
    const b = tsx(component(`<div style={{ lineHeight: 20 }} />`))[0];
    expect(stableSignature(a)).not.toBe(stableSignature(b));
  });

  it('changes when the normalized value changes', () => {
    const a = tsx(component(`<div style={{ fontSize: 20 }} />`))[0];
    const b = tsx(component(`<div style={{ fontSize: 21 }} />`))[0];
    expect(stableSignature(a)).not.toBe(stableSignature(b));
  });

  it('preserves multiplicity rather than collapsing duplicates', () => {
    const twice = component(`<><span style={{ fontSize: 20 }} /><em style={{ fontSize: 20 }} /></>`);
    const found = tsx(twice);
    expect(found).toHaveLength(2);
    const sigs = new Set(found.map(stableSignature));
    expect(sigs.size).toBe(1); // one identity...
    expect(found.length).toBe(2); // ...seen twice
  });
});

// ---------------------------------------------------------------------------
// HARDSTYLE-012 A — raw visual colour
// ---------------------------------------------------------------------------

describe('RAW_VISUAL_COLOR_LITERAL (HARDSTYLE-012 A)', () => {
  it.each([
    ['hex', `<div style={{ color: '#0F172A' }} />`],
    ['rgb', `<div style={{ color: 'rgb(1,2,3)' }} />`],
    ['rgba', `<div style={{ backgroundColor: 'rgba(1,2,3,0.5)' }} />`],
    ['hsl', `<div style={{ color: 'hsl(1,2%,3%)' }} />`],
    ['hsla', `<div style={{ color: 'hsla(1,2%,3%,0.4)' }} />`],
    ['named', `<div style={{ color: 'red' }} />`],
  ])('flags %s', (_label, jsx) => {
    expect(rulesOf(tsx(component(jsx)))).toContain(RULES.RAW_VISUAL_COLOR_LITERAL);
  });

  it.each(['transparent', 'currentColor', 'inherit'])('allows %s', (kw) => {
    expect(tsx(component(`<div style={{ color: '${kw}' }} />`))).toHaveLength(0);
  });

  it('flags a colour even inside a background shorthand', () => {
    expect(rulesOf(tsx(component(`<div style={{ background: '#fff url(x)' }} />`))))
      .toContain(RULES.RAW_VISUAL_COLOR_LITERAL);
  });
});

// ---------------------------------------------------------------------------
// HARDSTYLE-002 — legacy vs canonical variables
// ---------------------------------------------------------------------------

describe('CSS variable references (HARDSTYLE-002)', () => {
  it('treats var(--legacy-*) as anti-hardcoded compliant but NOT canonical consumption', () => {
    const all = scanSource(component(`<div style={{ color: 'var(--primary)' }} />`), 'app/a/page.tsx') as any[];
    expect(all.filter((f: any) => f.rule !== null)).toHaveLength(0);
    const compliant = all.find((f: any) => f.varCompliance);
    expect(compliant.varCompliance.antiHardcodedCompliant).toBe(true);
    expect(compliant.varCompliance.canonicalDsReference).toBe(false);
  });

  it('treats var(--ds-*) as compliant AND a canonical reference', () => {
    const all = scanSource(component(`<div style={{ color: 'var(--ds-color-brand)' }} />`), 'app/a/page.tsx') as any[];
    expect(all.filter((f: any) => f.rule !== null)).toHaveLength(0);
    const compliant = all.find((f: any) => f.varCompliance);
    expect(compliant.varCompliance.antiHardcodedCompliant).toBe(true);
    expect(compliant.varCompliance.canonicalDsReference).toBe(true);
  });

  it('never reports a legacy variable as canonical consumption', () => {
    expect(varCompliance('var(--primary)')!.canonicalDsReference).toBe(false);
    expect(varCompliance('var(--ds-space-8)')!.canonicalDsReference).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HARDSTYLE-003 — globals.css legacy token definitions
// ---------------------------------------------------------------------------

describe('globals.css legacy token definitions (HARDSTYLE-003)', () => {
  it('exempts a custom-property definition declaration', () => {
    const found = css(`:root { --primary: #025963; }`);
    expect(found.filter((f: any) => f.rule !== null)).toHaveLength(0);
    expect(found[0].exempt).toBe('HARDSTYLE-003');
    expect(found[0].contextKind).toBe('css-token-definition');
  });

  it('still flags a non-definition hardcoded colour in the same file', () => {
    const found = css(`:root { --primary: #025963; }\n.card { color: #ff0000; }`);
    const real = found.filter((f: any) => f.rule !== null);
    expect(rulesOf(real)).toEqual([RULES.RAW_VISUAL_COLOR_LITERAL]);
    expect(real[0].namedScope).toBe('.card');
  });

  it('is not a file-level exemption', () => {
    expect(EXCLUDED_PATHS).not.toContain('app/globals.css');
  });
});

// ---------------------------------------------------------------------------
// HARDSTYLE-012 B — text typography, and HARDSTYLE-004 Material Symbols
// ---------------------------------------------------------------------------

describe('TEXT_TYPOGRAPHY_LITERAL (HARDSTYLE-012 B)', () => {
  it.each([
    ['fontSize', `<div style={{ fontSize: 20 }} />`],
    ['fontWeight', `<div style={{ fontWeight: 600 }} />`],
    ['lineHeight', `<div style={{ lineHeight: 1.4 }} />`],
    ['letterSpacing', `<div style={{ letterSpacing: '0.5px' }} />`],
    ['fontFamily', `<div style={{ fontFamily: 'Space Mono' }} />`],
  ])('flags %s', (_label, jsx) => {
    expect(rulesOf(tsx(component(jsx)))).toEqual([RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });
});

describe('Material Symbols icon context (HARDSTYLE-004)', () => {
  const icon = (style: string) =>
    component(`<span className="material-symbols-outlined" style={{ ${style} }}>lock</span>`);

  it('exempts fontSize on a Material Symbols element', () => {
    expect(tsx(icon('fontSize: 16'))).toHaveLength(0);
  });

  it('exempts fontFamily on a Material Symbols element', () => {
    expect(tsx(icon(`fontFamily: 'Material Symbols Outlined'`))).toHaveLength(0);
  });

  it('still flags a hardcoded colour on a Material Symbols element', () => {
    expect(rulesOf(tsx(icon(`color: '#ff0000'`)))).toEqual([RULES.RAW_VISUAL_COLOR_LITERAL]);
  });

  it('still flags fontWeight on a Material Symbols element', () => {
    expect(rulesOf(tsx(icon('fontWeight: 700')))).toEqual([RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });

  it('does not exempt a non-icon element that merely uses an icon-sized value', () => {
    expect(rulesOf(tsx(component(`<div style={{ fontSize: 16 }} />`)))).toEqual([RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });

  it('does not exempt a different className that is not material-symbols', () => {
    const jsx = component(`<span className="icon-outlined" style={{ fontSize: 16 }}>x</span>`);
    expect(rulesOf(tsx(jsx))).toEqual([RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });
});

// ---------------------------------------------------------------------------
// HARDSTYLE-012 C / D — spacing and radius
// ---------------------------------------------------------------------------

describe('SPACING_LITERAL and BORDER_RADIUS_LITERAL (HARDSTYLE-012 C/D)', () => {
  it.each(['padding: 8', 'margin: 8', 'gap: 8', 'paddingTop: 8', 'marginLeft: 8', 'rowGap: 8'])(
    'flags %s as spacing', (style) => {
      expect(rulesOf(tsx(component(`<div style={{ ${style} }} />`)))).toEqual([RULES.SPACING_LITERAL]);
    },
  );

  it('flags a literal borderRadius', () => {
    expect(rulesOf(tsx(component(`<div style={{ borderRadius: 12 }} />`)))).toEqual([RULES.BORDER_RADIUS_LITERAL]);
  });

  it('accepts a variable-backed borderRadius', () => {
    expect(tsx(component(`<div style={{ borderRadius: 'var(--radius-card)' }} />`))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HARDSTYLE-012 — outside ENFORCED_V1
// ---------------------------------------------------------------------------

describe('categories outside ENFORCED_V1 (HARDSTYLE-012)', () => {
  const notEnforced = (style: string): any[] => {
    const found = tsx(component(`<div style={{ ${style} }} />`));
    for (const f of found) expect(statusForRule(f.rule)).not.toBe(STATUS.ENFORCED_V1);
    return found;
  };

  it.each(['width: 100', 'height: 40', 'minWidth: 10', 'maxHeight: 20'])(
    '%s is not an ENFORCED_V1 violation', (s) => { notEnforced(s); },
  );

  it.each(['top: 4', 'right: 4', 'bottom: 4', 'left: 4', 'inset: 0'])(
    '%s is not an ENFORCED_V1 violation', (s) => { notEnforced(s); },
  );

  it('geometry is REVIEW_REQUIRED', () => {
    const found = notEnforced('width: 100');
    expect(found[0].rule).toBe(RULES.GEOMETRY_LITERAL);
    expect(statusForRule(found[0].rule)).toBe(STATUS.REVIEW_REQUIRED);
  });

  it('box-shadow is blocked by a missing canonical token, not enforced', () => {
    const found = notEnforced(`boxShadow: '0 1px 2px #0000001a'`);
    expect(found.some((f) => statusForRule(f.rule) === STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN
      || f.rule === RULES.RAW_VISUAL_COLOR_LITERAL)).toBe(true);
  });

  it('transition is blocked by a missing canonical token, not enforced', () => {
    const found = notEnforced(`transition: 'all 120ms ease'`);
    expect(found[0].rule).toBe(RULES.INTERACTION_LITERAL);
    expect(statusForRule(found[0].rule)).toBe(STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Dynamic expressions
// ---------------------------------------------------------------------------

describe('dynamic style expressions', () => {
  it('is never misclassified as a direct literal violation', () => {
    const found = tsx(component(`<div style={{ fontSize: size }} />`));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe(RULES.DYNAMIC_STYLE_EXPRESSION);
    expect(found[0].normalizedValue).toBe('<dynamic>');
    expect(statusForRule(found[0].rule)).toBe(STATUS.REVIEW_REQUIRED);
  });

  it('treats a conditional value as dynamic, not as a literal', () => {
    const found = tsx(component(`<div style={{ fontSize: big ? 20 : 12 }} />`));
    expect(found[0].rule).toBe(RULES.DYNAMIC_STYLE_EXPRESSION);
  });

  it('ignores style objects that are not JSX style attributes', () => {
    expect(tsx(`const palette = { color: '#ff0000' };`)).toHaveLength(0);
  });

  it('ignores ordinary application string data', () => {
    expect(tsx(`export const code = '#ff0000';`)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scan exclusions
// ---------------------------------------------------------------------------

describe('scan exclusions', () => {
  it('excludes generated and vendored canonical artifacts', () => {
    for (const p of ['app/generated/design-tokens.css', 'vendor/design-system', 'node_modules', '.next', 'e2e']) {
      expect(EXCLUDED_PATHS).toContain(p);
    }
  });

  it('never reports the generated design tokens CSS as product debt', () => {
    const files = discoverFiles(new URL('..', import.meta.url).pathname) as string[];
    expect(files).not.toContain('app/generated/design-tokens.css');
    expect(files.some((f: string) => f.startsWith('vendor/'))).toBe(false);
  });

  it('does not scan this scanner\'s own test file', () => {
    const files = discoverFiles(new URL('..', import.meta.url).pathname) as string[];
    expect(files.some((f: string) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tranche B calibration
// ---------------------------------------------------------------------------

/** Builds a throwaway repo tree and scans it — never touches the real App. */
function scanTree(files: Record<string, string>): any {
  const root = mkdtempSync(join(tmpdir(), 'hardstyle-'));
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

describe('Material Symbols context — calibration (HARDSTYLE-004)', () => {
  it('recognises icon context from the static head of a template-literal className', () => {
    const jsx = component("<span className={`material-symbols-outlined${active ? ' icf' : ''}`} style={{ fontSize: 20 }}>x</span>");
    expect(tsx(jsx)).toHaveLength(0);
  });

  it('never infers icon context from a template substitution', () => {
    const jsx = component("<span className={`chip ${'material-symbols-outlined'}`} style={{ fontSize: 20 }}>x</span>");
    expect(rulesOf(tsx(jsx))).toEqual([RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });

  it('exempts fontSize/fontFamily in a CSS rule whose selector subject is the icon class', () => {
    const found = css('.material-symbols-outlined { font-family: x; font-size: 24px; }\n.nav span.material-symbols-outlined { font-size: 24px; }')
      .filter((f: any) => f.rule !== null);
    expect(found).toHaveLength(0);
  });

  it('keeps other properties of a CSS icon rule enforceable', () => {
    const found = css('.material-symbols-outlined { line-height: 1; color: #fff; }').filter((f: any) => f.rule !== null);
    expect(rulesOf(found).sort()).toEqual([RULES.RAW_VISUAL_COLOR_LITERAL, RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });

  it('does not treat an icon class that is only an ancestor as icon context', () => {
    const found = css('.material-symbols-outlined .label { font-size: 14px; }').filter((f: any) => f.rule !== null);
    expect(rulesOf(found)).toEqual([RULES.TEXT_TYPOGRAPHY_LITERAL]);
  });
});

describe('HARDSTYLE-013 — precedence of non-enforceable property categories', () => {
  it('never promotes a colour embedded in boxShadow to ENFORCED_V1', () => {
    const rule = classify({ property: 'boxShadow', value: '0 1px 2px #0000001a' });
    expect(rule).toBe(RULES.ELEVATION_LITERAL);
    expect(statusForRule(rule!)).toBe(STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN);
  });

  it('never promotes a colour embedded in an interaction property to ENFORCED_V1', () => {
    expect(statusForRule(classify({ property: 'outline', value: '2px solid #ff0000' })!))
      .toBe(STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN);
  });

  it('keeps the embedded literal visible as a diagnostic and out of ENFORCED_V1', () => {
    const r = scanTree({ 'app/a/page.tsx': component(`<div style={{ boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />`) });
    const f = r.findings.find((x: any) => x.property === 'boxShadow');
    expect(f.embeddedColorLiteral).toBe(true);
    expect(f.status).toBe(STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN);
    expect(r.counts.enforcedV1).toBe(0);
    expect(r.counts.blockedButEmbeddingColorLiteral).toBe(1);
  });

  it('is not a generic colour exemption: a plain colour stays ENFORCED_V1', () => {
    const rule = classify({ property: 'color', value: '#000000' });
    expect(rule).toBe(RULES.RAW_VISUAL_COLOR_LITERAL);
    expect(statusForRule(rule!)).toBe(STATUS.ENFORCED_V1);
  });

  it('does not extend to a composite border shorthand, whose colour is independently enforceable', () => {
    expect(containsColorLiteral('1px solid #1f1f24')).toBe(true);
    expect(classify({ property: 'border', value: '1px solid #1f1f24' })).toBe(RULES.RAW_VISUAL_COLOR_LITERAL);
  });
});

describe('scan integrity', () => {
  it('rejects a read that is shorter than the file on disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardstyle-'));
    try {
      const abs = join(root, 'page.tsx');
      writeFileSync(abs, 'export const x = 1;\n');
      expect(() => assertCompleteRead(abs, 'page.tsx', '')).toThrow(ScanIntegrityError);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects placeholder content made of NUL bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardstyle-'));
    try {
      const abs = join(root, 'page.tsx');
      const zeros = String.fromCharCode(0).repeat(64);
      writeFileSync(abs, zeros);
      expect(() => assertCompleteRead(abs, 'page.tsx', zeros)).toThrow(/NUL bytes/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('fails the whole scan instead of reporting an unparseable TSX file as clean', () => {
    expect(() => scanTree({ 'app/a/page.tsx': 'export default function A() { return <div style={{ fontSize: 20 }} ' }))
      .toThrow(ScanIntegrityError);
  });

  it('fails the whole scan instead of reporting an unparseable CSS file as clean', () => {
    expect(() => scanTree({ 'app/a.css': '.a { color: #fff; ' })).toThrow(ScanIntegrityError);
  });

  it('keeps the scanner\'s own sources free of raw NUL bytes (git would treat them as binary)', () => {
    const here = new URL('.', import.meta.url).pathname;
    const sources = [
      'check-hardcoded-styles.mjs',
      'generate-hardcoded-styles-baseline.mjs',
      'hardcoded-styles.test.ts',
      'hardcoded-styles-baseline.test.ts',
      ...readdirSync(join(here, 'lib/hardcoded-styles')).map((f) => `lib/hardcoded-styles/${f}`),
    ].filter((f) => /\.(mjs|ts)$/.test(f));
    for (const f of sources) {
      expect(readFileSync(join(here, f)).includes(0), f).toBe(false);
    }
  });
});

describe('token-match reporting (independent, not mutually exclusive)', () => {
  it('lets one finding count toward both canonical and legacy matches', () => {
    const r = scanTree({
      'vendor/design-system/tokens.json': JSON.stringify({ semantic: { color: { light: { ink: '#123456' } } } }),
      'app/globals.css': ':root { --ink: #123456; }\n',
      'app/a/page.tsx': component(`<div style={{ color: '#123456' }} />`),
    });
    const tm = r.counts.tokenMatches;
    expect(tm.CANONICAL_MATCH_COUNT).toBe(1);
    expect(tm.LEGACY_MATCH_COUNT).toBe(1);
    expect(tm.BOTH_CANONICAL_AND_LEGACY_MATCH_COUNT).toBe(1);
    expect(tm.NO_TOKEN_MATCH_COUNT).toBe(0);
    // ...and the token match never changes the verdict (HARDSTYLE-009).
    expect(r.counts.enforcedV1).toBe(1);
  });
});
