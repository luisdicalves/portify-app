import { describe, expect, it } from 'vitest';
import { scanSource, stableSignature, discoverFiles, EXCLUDED_PATHS, STATUS } from './lib/hardcoded-styles/index.mjs';
import { RULES, statusForRule, varCompliance, normalizeValue } from './lib/hardcoded-styles/taxonomy.mjs';

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
