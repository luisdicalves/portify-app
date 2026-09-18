// Authored TS/TSX style detection via the TypeScript AST — HARDSTYLE-008.
//
// Structural, not textual: we only inspect object literals that are actually
// a JSX `style={{...}}` attribute value, we resolve each property's value as
// an AST node (so a dynamic expression is never mistaken for a literal), and
// Material Symbols context is established from the element's own className
// attribute rather than guessed from a value.

import ts from 'typescript';
import { classify, normalizeValue, isVarReference, isInertValue, varCompliance, containsColorLiteral, RULES } from './taxonomy.mjs';

export const CONTEXT_KIND = Object.freeze({
  JSX_STYLE_ATTRIBUTE: 'jsx-style-attribute',
});

/** Nearest enclosing *named* declaration — the component, not the line. */
function namedScopeFor(node) {
  let cur = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isClassDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && cur.name && ts.isIdentifier(cur.name)) return cur.name.text;
    if (
      (ts.isVariableDeclaration(cur) || ts.isPropertyAssignment(cur)) &&
      cur.name && ts.isIdentifier(cur.name) &&
      cur.initializer &&
      (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))
    ) {
      return cur.name.text;
    }
    cur = cur.parent;
  }
  return '<module>';
}

/** The JSX element a `style={{...}}` attribute belongs to. */
function owningJsxElement(objectLiteral) {
  const expr = objectLiteral.parent;
  if (!expr || !ts.isJsxExpression(expr)) return null;
  const attr = expr.parent;
  if (!attr || !ts.isJsxAttribute(attr)) return null;
  if (!attr.name || attr.name.getText() !== 'style') return null;
  const attrs = attr.parent;
  if (!attrs || !ts.isJsxAttributes(attrs)) return null;
  return attrs.parent ?? null;
}

/**
 * HARDSTYLE-004 — icon context proven structurally from the same element's
 * className string literal. Never inferred from a font size value.
 */
function isMaterialSymbolElement(openingElement) {
  if (!openingElement || !openingElement.attributes) return false;
  for (const attr of openingElement.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !attr.name) continue;
    if (attr.name.getText() !== 'className') continue;
    const init = attr.initializer;
    if (!init) continue;
    let text = null;
    if (ts.isStringLiteral(init)) text = init.text;
    else if (ts.isJsxExpression(init) && init.expression) {
      if (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) {
        text = init.expression.text;
      }
    }
    if (text && /\bmaterial-symbols/.test(text)) return true;
  }
  return false;
}

/** Reduce a property value node to an authored literal, or report it dynamic. */
function literalOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'literal', value: node.text };
  }
  if (ts.isNumericLiteral(node)) return { kind: 'literal', value: Number(node.text) };
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return { kind: 'literal', value: -Number(node.operand.text) };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: 'literal', value: node.getText() };
  }
  return { kind: 'dynamic', value: null };
}

/**
 * @param {string} sourceText
 * @param {string} repoRelativePath
 * @returns {Array<object>} raw findings (no signature, no token match yet)
 */
export function scanTsxSource(sourceText, repoRelativePath) {
  const sf = ts.createSourceFile(repoRelativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const owner = owningJsxElement(node);
      if (owner) {
        const isIcon = isMaterialSymbolElement(owner);
        const scope = namedScopeFor(node);
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue; // spreads/shorthand are dynamic by nature
          const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
          if (!name) continue;

          const { line, character } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
          const lit = literalOf(prop.initializer);

          if (lit.kind === 'dynamic') {
            findings.push({
              rule: RULES.DYNAMIC_STYLE_EXPRESSION,
              repoRelativePath, namedScope: scope, contextKind: CONTEXT_KIND.JSX_STYLE_ATTRIBUTE,
              property: name, normalizedValue: '<dynamic>',
              line: line + 1, column: character + 1,
              varCompliance: null,
            });
            continue;
          }

          const raw = lit.value;
          if (isVarReference(raw)) {
            // Compliant for this policy; recorded so reporting can count it
            // WITHOUT ever calling a legacy variable canonical consumption.
            findings.push({
              rule: null,
              repoRelativePath, namedScope: scope, contextKind: CONTEXT_KIND.JSX_STYLE_ATTRIBUTE,
              property: name, normalizedValue: normalizeValue(raw),
              line: line + 1, column: character + 1,
              varCompliance: varCompliance(raw),
            });
            continue;
          }
          if (isInertValue(raw)) continue;

          const rule = classify({ property: name, value: raw, isMaterialSymbolContext: isIcon });
          if (!rule) continue;

          findings.push({
            rule,
            repoRelativePath, namedScope: scope, contextKind: CONTEXT_KIND.JSX_STYLE_ATTRIBUTE,
            property: name, normalizedValue: normalizeValue(raw),
            line: line + 1, column: character + 1,
            varCompliance: null,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
}
