// Token-aware diagnostics — HARDSTYLE-009.
//
// Canonical values are READ from vendor/design-system/tokens.json at runtime
// and are never duplicated into this source. Token matching affects only the
// quality of a diagnostic; it must never decide whether a literal is a
// violation. A hardcoded literal equal to a canonical token value is still a
// finding.

import { readFileSync, existsSync } from 'node:fs';
import { normalizeValue } from './taxonomy.mjs';

export const CANONICAL_TOKENS_PATH = 'vendor/design-system/tokens.json';
export const LEGACY_TOKENS_PATH = 'app/globals.css';

/** Walk the canonical artifact and collect every leaf string value. */
function collectCanonical(node, path, out) {
  if (typeof node === 'string') {
    const key = normalizeValue(node);
    if (!out.has(key)) out.set(key, path.join('.'));
    return;
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) collectCanonical(v, [...path, k], out);
  }
}

/**
 * Builds { canonical, legacy } value -> identity maps.
 *
 * `legacy` is derived from the App's own globals.css custom properties. It is
 * reported under a deliberately separate key so that a legacy match is never
 * presented as canonical Design System consumption (HARDSTYLE-002).
 */
export function buildTokenIndex(repoRoot, {
  canonicalPath = CANONICAL_TOKENS_PATH,
  legacyPath = LEGACY_TOKENS_PATH,
} = {}) {
  const canonical = new Map();
  const legacy = new Map();

  const canonicalFile = `${repoRoot}/${canonicalPath}`;
  if (existsSync(canonicalFile)) {
    const parsed = JSON.parse(readFileSync(canonicalFile, 'utf8'));
    for (const domain of ['semantic', 'radius', 'spacing', 'typography']) {
      if (parsed[domain] !== undefined) collectCanonical(parsed[domain], [domain], canonical);
    }
  }

  const legacyFile = `${repoRoot}/${legacyPath}`;
  if (existsSync(legacyFile)) {
    const css = readFileSync(legacyFile, 'utf8');
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
      const key = normalizeValue(m[2]);
      if (!legacy.has(key)) legacy.set(key, m[1]);
    }
  }

  return { canonical, legacy };
}

/**
 * Diagnostic only. Returns which known token(s) a literal happens to equal.
 * Matching neither is a perfectly normal outcome and carries no verdict.
 */
export function matchToken(index, normalizedValue) {
  // Independent fields, deliberately: a literal may equal a canonical token
  // value AND a legacy variable value at once. There is no single "kind",
  // because collapsing the two would present overlapping matches as
  // mutually exclusive categories.
  const canonical = index.canonical.get(normalizedValue) ?? null;
  const legacy = index.legacy.get(normalizedValue) ?? null;
  return { canonical, legacy };
}
