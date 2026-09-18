// Authored CSS detection via postcss — HARDSTYLE-008.
//
// HARDSTYLE-003 is implemented here as a DECLARATION-level exemption, not a
// file-level one: app/globals.css is fully scanned, and only custom-property
// declarations (the legacy token definition layer) are exempt. A raw literal
// in any ordinary declaration in that same file is still a finding.

import postcss from 'postcss';
import { classify, normalizeValue, isVarReference, isInertValue, varCompliance, containsColorLiteral } from './taxonomy.mjs';

export const CONTEXT_KIND = Object.freeze({
  CSS_DECLARATION: 'css-declaration',
  CSS_TOKEN_DEFINITION: 'css-token-definition',
});

/** Selector chain of the declaration's enclosing rule/at-rule — the scope. */
function namedScopeFor(decl) {
  const parts = [];
  let cur = decl.parent;
  while (cur && cur.type !== 'root') {
    if (cur.type === 'rule' && cur.selector) parts.unshift(cur.selector.replace(/\s+/g, ' ').trim());
    else if (cur.type === 'atrule') parts.unshift(`@${cur.name} ${String(cur.params || '').trim()}`.trim());
    cur = cur.parent;
  }
  return parts.length ? parts.join(' > ') : '<root>';
}

/** A custom-property declaration IS the legacy token definition layer. */
function isTokenDefinition(decl) {
  return typeof decl.prop === 'string' && decl.prop.startsWith('--');
}

/**
 * @param {string} cssText
 * @param {string} repoRelativePath
 * @returns {Array<object>} raw findings (no signature, no token match yet)
 */
export function scanCssSource(cssText, repoRelativePath) {
  const findings = [];
  const root = postcss.parse(cssText, { from: repoRelativePath });

  root.walkDecls((decl) => {
    const scope = namedScopeFor(decl);
    const pos = decl.source && decl.source.start ? decl.source.start : { line: 0, column: 0 };
    const raw = decl.value;

    if (isTokenDefinition(decl)) {
      // HARDSTYLE-003: exempt, but recorded as a distinct context so the
      // legacy definition layer stays separately countable until
      // APP_LEGACY_TOKEN_AUTHORITY_RETIRED is addressed.
      findings.push({
        rule: null,
        repoRelativePath, namedScope: scope, contextKind: CONTEXT_KIND.CSS_TOKEN_DEFINITION,
        property: decl.prop, normalizedValue: normalizeValue(raw),
        line: pos.line, column: pos.column,
        varCompliance: null, exempt: 'HARDSTYLE-003',
      });
      return;
    }

    if (isVarReference(raw)) {
      findings.push({
        rule: null,
        repoRelativePath, namedScope: scope, contextKind: CONTEXT_KIND.CSS_DECLARATION,
        property: decl.prop, normalizedValue: normalizeValue(raw),
        line: pos.line, column: pos.column,
        varCompliance: varCompliance(raw),
      });
      return;
    }
    if (isInertValue(raw)) return;

    const rule = classify({ property: decl.prop, value: raw, isMaterialSymbolContext: false });
    if (!rule) return;

    findings.push({
      rule,
      repoRelativePath, namedScope: scope, contextKind: CONTEXT_KIND.CSS_DECLARATION,
      property: decl.prop, normalizedValue: normalizeValue(raw),
      line: pos.line, column: pos.column,
      varCompliance: null,
    });
  });

  return findings;
}
