// Scanner orchestration: file discovery, stable identity, aggregation.
//
// Stable identity (HARDSTYLE-005) is composed ONLY of
//   rule | repoRelativePath | namedScope | contextKind | property | normalizedValue
// Line and column are emitted as diagnostics but never participate, so
// reformatting cannot churn a baseline. Multiplicity is mandatory: two
// semantically identical occurrences in one named scope stay visible as 2.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { scanTsxSource } from './scan-tsx.mjs';
import { scanCssSource } from './scan-css.mjs';
import { buildTokenIndex, matchToken } from './tokens.mjs';
import { FINDING_IDENTITY_VERSION, STATUS, statusForRule, containsColorLiteral, RULES } from './taxonomy.mjs';

export { FINDING_IDENTITY_VERSION, STATUS };

/** Authored UI source roots. New files are picked up automatically. */
export const SCAN_ROOTS = Object.freeze(['app', 'components', 'lib']);

/**
 * Never scanned. Generated canonical output must never be reported as
 * violating the system it defines; this scanner's own test fixtures contain
 * deliberate synthetic literals and are not product debt.
 */
export const EXCLUDED_PATHS = Object.freeze([
  'node_modules',
  '.next',
  'app/generated/design-tokens.css',
  'vendor/design-system',
  'vendor/design-tokens.lock.json',
  'e2e',
  'scripts/lib/design-tokens-fixtures.mjs',
  'scripts/lib/hardcoded-styles/__fixtures__',
  'tsconfig.tsbuildinfo',
]);

const SCANNABLE = /\.(tsx|jsx|css)$/;
const TEST_FILE = /\.test\.(ts|tsx|mts|mjs)$/;

function isExcluded(relPath) {
  const p = relPath.split(sep).join('/');
  return EXCLUDED_PATHS.some((ex) => p === ex || p.startsWith(`${ex}/`)) || TEST_FILE.test(p);
}

export function discoverFiles(repoRoot, roots = SCAN_ROOTS) {
  const out = [];
  const walk = (abs) => {
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = join(abs, e.name);
      const rel = relative(repoRoot, child);
      if (isExcluded(rel)) continue;
      if (e.isDirectory()) walk(child);
      else if (e.isFile() && SCANNABLE.test(e.name)) out.push(rel.split(sep).join('/'));
    }
  };
  for (const root of roots) {
    const abs = join(repoRoot, root);
    try { if (statSync(abs).isDirectory()) walk(abs); } catch { /* root absent */ }
  }
  return out.sort();
}

export function stableSignature(finding) {
  const parts = [
    String(FINDING_IDENTITY_VERSION),
    finding.rule ?? '',
    finding.repoRelativePath,
    finding.namedScope,
    finding.contextKind,
    finding.property,
    finding.normalizedValue,
  ];
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
}

/** Deterministic order: rule, path, namedScope, contextKind, property, value. */
function compareFindings(a, b) {
  const keys = ['rule', 'repoRelativePath', 'namedScope', 'contextKind', 'property', 'normalizedValue'];
  for (const k of keys) {
    const av = a[k] ?? '';
    const bv = b[k] ?? '';
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0);
}

export function scanSource(sourceText, repoRelativePath) {
  return repoRelativePath.endsWith('.css')
    ? scanCssSource(sourceText, repoRelativePath)
    : scanTsxSource(sourceText, repoRelativePath);
}

/**
 * Full scan. Returns findings (with signature + token diagnostics), the
 * signature aggregation Tranche B will turn into a baseline, and counts.
 */
export function scanRepository(repoRoot, { roots = SCAN_ROOTS } = {}) {
  const files = discoverFiles(repoRoot, roots);
  const tokenIndex = buildTokenIndex(repoRoot);

  const raw = [];
  for (const rel of files) {
    const text = readFileSync(join(repoRoot, rel), 'utf8');
    raw.push(...scanSource(text, rel));
  }

  const compliant = [];
  const findings = [];
  for (const f of raw) {
    if (f.rule === null) { compliant.push(f); continue; }
    const status = statusForRule(f.rule);
    const blocked = status === STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN;
    findings.push({
      ...f,
      status,
      // A blocked elevation/interaction value may still embed a raw colour.
      // Recorded so it stays measurable without being enforced — the open
      // policy question is raised for Tranche B, not resolved here.
      embeddedColorLiteral: blocked && containsColorLiteral(f.normalizedValue),
      signature: stableSignature(f),
      tokenMatch: matchToken(tokenIndex, f.normalizedValue),
    });
  }
  findings.sort(compareFindings);

  const bySignature = new Map();
  for (const f of findings) {
    if (!bySignature.has(f.signature)) {
      bySignature.set(f.signature, {
        signature: f.signature,
        rule: f.rule,
        status: f.status,
        repoRelativePath: f.repoRelativePath,
        namedScope: f.namedScope,
        contextKind: f.contextKind,
        property: f.property,
        normalizedValue: f.normalizedValue,
        multiplicity: 0,
      });
    }
    bySignature.get(f.signature).multiplicity += 1;
  }
  const signatures = [...bySignature.values()].sort(compareFindings);

  const enforced = findings.filter((f) => f.status === STATUS.ENFORCED_V1);
  const byRule = {};
  for (const f of enforced) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;

  // HARDSTYLE-002: these two counts are reported separately, on purpose.
  const antiHardcodedCompliant = compliant.filter((c) => c.varCompliance?.antiHardcodedCompliant).length;
  const canonicalDsReferences = compliant.filter((c) => c.varCompliance?.canonicalDsReference).length;
  const legacyTokenDefinitions = compliant.filter((c) => c.exempt === 'HARDSTYLE-003').length;

  return {
    identityVersion: FINDING_IDENTITY_VERSION,
    filesScanned: files.length,
    findings,
    signatures,
    counts: {
      enforcedV1: enforced.length,
      enforcedV1Files: new Set(enforced.map((f) => f.repoRelativePath)).size,
      byRule,
      reviewRequired: findings.filter((f) => f.status === STATUS.REVIEW_REQUIRED).length,
      measureOnly: findings.filter((f) => f.status === STATUS.MEASURE_ONLY).length,
      blockedByMissingCanonicalToken: findings.filter(
        (f) => f.status === STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN,
      ).length,
      blockedButEmbeddingColorLiteral: findings.filter((f) => f.embeddedColorLiteral).length,
      enforcedV1Signatures: new Set(enforced.map((f) => f.signature)).size,
      totalSignatures: signatures.length,
      totalMultiplicity: signatures.reduce((n, s) => n + s.multiplicity, 0),
      antiHardcodedCompliantReferences: antiHardcodedCompliant,
      canonicalDsReferences,
      legacyTokenDefinitions,
      tokenMatches: {
        CANONICAL_TOKEN_MATCH: enforced.filter((f) => f.tokenMatch.kind === 'CANONICAL_TOKEN_MATCH').length,
        LEGACY_TOKEN_MATCH: enforced.filter((f) => f.tokenMatch.kind === 'LEGACY_TOKEN_MATCH').length,
        NO_TOKEN_MATCH: enforced.filter((f) => f.tokenMatch.kind === 'NO_TOKEN_MATCH').length,
      },
    },
  };
}
