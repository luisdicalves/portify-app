// Offline validation for the vendored PORTIFY-KNOWLEDGE design-token artifact.
//
// NO network access, NO credential/secret awareness. Operates only on
// already-committed files under vendor/. Shared by the local generation
// script, the secretless CI check, and the privileged sync workflow's own
// pre-flight gate (which runs this same validation against a *staged*
// candidate snapshot before ever opening a PR).

import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Closed set, per the Product Owner-approved Option 3B decision
// (PORTIFY-KNOWLEDGE 00-governance/TRANCHE-1A-2-SPACING-DECISION-PACKAGE-2026-09-01.md §14).
// 2px is a calibration unit, never a primitive; 32px (portify-app's own former
// --space-8) has no canonical evidence and is explicitly excluded.
export const APPROVED_SPACING_VALUES = Object.freeze([
  '4px', '6px', '8px', '10px', '12px', '14px', '16px', '18px', '20px', '24px',
]);

// schemaVersion values this validator explicitly knows how to interpret.
// A vendored artifact with any other value fails closed rather than being
// silently (mis)interpreted under an assumed-compatible shape.
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['3.0.0']);

const HEX40_RE = /^[0-9a-f]{40}$/;
const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * Recursively sort object keys (arrays keep their order). Mirrors Python's
 * `json.dumps(..., sort_keys=True)` at every nesting level.
 */
export function deepSortKeys(value) {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = deepSortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * The exact algorithm PORTIFY-KNOWLEDGE's generator uses (verified against
 * generate_tokens_artifact.py's own canonical_json_bytes: `json.dumps(data,
 * sort_keys=True, indent=2, ensure_ascii=False) + "\n"`, UTF-8 encoded, then
 * sha256). Python's indent-mode separators (",", no trailing space; ": ",
 * one space after the colon) are exactly what JSON.stringify(obj, null, 2)
 * already produces, so the only transformation needed on the JS side is the
 * deep key sort before stringifying.
 */
export function computeContentHash(tokens) {
  const canonicalBytes = Buffer.from(JSON.stringify(deepSortKeys(tokens), null, 2) + '\n', 'utf8');
  return 'sha256:' + createHash('sha256').update(canonicalBytes).digest('hex');
}

function makeAjv() {
  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: false });
  addFormats(ajv);
  return ajv;
}

/** Validate `instance` against `schema`. Returns {valid, errors: string[]}. */
export function validateAgainstSchema(instance, schema) {
  const ajv = makeAjv();
  let validateFn;
  try {
    validateFn = ajv.compile(schema);
  } catch (err) {
    // AJV strict mode throws at compile time on unknown/unsupported keywords
    // or ambiguous schema constructs — this IS the fail-closed behavior, not
    // an error to swallow.
    return { valid: false, errors: [`schema compilation failed (fail-closed): ${err.message}`] };
  }
  const valid = validateFn(instance);
  const errors = valid
    ? []
    : (validateFn.errors ?? []).map((e) => `${e.instancePath || '$'} ${e.message}`);
  return { valid, errors };
}

export function validateManifestSchema(manifest, manifestSchema) {
  return validateAgainstSchema(manifest, manifestSchema);
}

export function validateTokensSchema(tokens, tokensSchema) {
  return validateAgainstSchema(tokens, tokensSchema);
}

const REQUIRED_LOCK_FIELDS = [
  'sourceRepository',
  'distributionCommit',
  'artifactVersion',
  'schemaVersion',
  'generatorVersion',
  'knowledgeCommit',
  'contentHash',
  'domainsIncluded',
];

/** Structural/shape validation of the lock file itself — it carries fields
 * (sourceRepository, distributionCommit) that manifest.schema.json does not
 * define, so it is checked explicitly rather than against Knowledge's schema. */
export function validateLockProvenance(lock) {
  const errors = [];
  for (const field of REQUIRED_LOCK_FIELDS) {
    if (!(field in lock)) errors.push(`lock missing required field '${field}'`);
  }
  if (lock.sourceRepository !== undefined && typeof lock.sourceRepository !== 'string') {
    errors.push("lock.sourceRepository must be a string");
  }
  if (lock.distributionCommit !== undefined && !HEX40_RE.test(lock.distributionCommit)) {
    errors.push("lock.distributionCommit must be a 40-character hex commit SHA");
  }
  if (lock.knowledgeCommit !== undefined && !HEX40_RE.test(lock.knowledgeCommit)) {
    errors.push("lock.knowledgeCommit must be a 40-character hex commit SHA");
  }
  if (lock.contentHash !== undefined && !CONTENT_HASH_RE.test(lock.contentHash)) {
    errors.push("lock.contentHash must match 'sha256:<64 hex chars>'");
  }
  for (const versionField of ['artifactVersion', 'schemaVersion', 'generatorVersion']) {
    if (lock[versionField] !== undefined && !SEMVER_RE.test(lock[versionField])) {
      errors.push(`lock.${versionField} must be a semver string (X.Y.Z)`);
    }
  }
  if (lock.domainsIncluded !== undefined && !Array.isArray(lock.domainsIncluded)) {
    errors.push('lock.domainsIncluded must be an array');
  }
  return { valid: errors.length === 0, errors };
}

const LOCK_MANIFEST_SHARED_FIELDS = [
  'artifactVersion',
  'schemaVersion',
  'generatorVersion',
  'knowledgeCommit',
  'contentHash',
];

/** The lock's own claim about the manifest must actually match the vendored
 * manifest.json — lock.distributionCommit is intentionally NOT compared here,
 * since manifest.json has no such field (see module docstring / design docs
 * for the distributionCommit vs. knowledgeCommit distinction). */
export function validateLockManifestConsistency(lock, manifest) {
  const errors = [];
  for (const field of LOCK_MANIFEST_SHARED_FIELDS) {
    if (lock[field] !== manifest[field]) {
      errors.push(`lock.${field} (${JSON.stringify(lock[field])}) !== manifest.${field} (${JSON.stringify(manifest[field])})`);
    }
  }
  const lockDomains = Array.isArray(lock.domainsIncluded) ? [...lock.domainsIncluded].sort() : null;
  const manifestDomains = Array.isArray(manifest.domainsIncluded) ? [...manifest.domainsIncluded].sort() : null;
  if (JSON.stringify(lockDomains) !== JSON.stringify(manifestDomains)) {
    errors.push(`lock.domainsIncluded (${JSON.stringify(lock.domainsIncluded)}) !== manifest.domainsIncluded (${JSON.stringify(manifest.domainsIncluded)})`);
  }
  return { valid: errors.length === 0, errors };
}

/** Recompute contentHash from the vendored tokens.json and compare to what
 * the manifest declares — entirely offline, no trust in the generator that
 * produced it. */
export function validateContentHash(tokens, manifest) {
  const computed = computeContentHash(tokens);
  if (computed !== manifest.contentHash) {
    return {
      valid: false,
      errors: [`computed contentHash ${computed} !== manifest.contentHash ${manifest.contentHash}`],
    };
  }
  return { valid: true, errors: [] };
}

export function validateSupportedSchemaVersion(manifest, supported = SUPPORTED_SCHEMA_VERSIONS) {
  if (!supported.includes(manifest.schemaVersion)) {
    return {
      valid: false,
      errors: [`schemaVersion '${manifest.schemaVersion}' is not in the supported set [${supported.join(', ')}] — refusing to generate rather than silently assume compatibility`],
    };
  }
  return { valid: true, errors: [] };
}

export function validateLightDarkParity(tokens) {
  const light = tokens?.semantic?.color?.light;
  const dark = tokens?.semantic?.color?.dark;
  if (!light || !dark) {
    return { valid: false, errors: ['tokens.semantic.color.light and/or .dark missing'] };
  }
  const lightKeys = Object.keys(light).sort();
  const darkKeys = Object.keys(dark).sort();
  if (JSON.stringify(lightKeys) !== JSON.stringify(darkKeys)) {
    const onlyLight = lightKeys.filter((k) => !darkKeys.includes(k));
    const onlyDark = darkKeys.filter((k) => !lightKeys.includes(k));
    return {
      valid: false,
      errors: [`Light/Dark key mismatch — light-only: [${onlyLight.join(', ')}], dark-only: [${onlyDark.join(', ')}]`],
    };
  }
  return { valid: true, errors: [] };
}

export function validateSpacingExactSet(tokens, approved = APPROVED_SPACING_VALUES) {
  const primitive = tokens?.spacing?.primitive;
  if (!primitive || typeof primitive !== 'object') {
    return { valid: false, errors: ['tokens.spacing.primitive missing'] };
  }
  const actualValues = Object.values(primitive).sort();
  const approvedSorted = [...approved].sort();
  const missing = approvedSorted.filter((v) => !actualValues.includes(v));
  const unexpected = actualValues.filter((v) => !approvedSorted.includes(v));
  const errors = [];
  if (missing.length) errors.push(`missing approved spacing primitive(s): [${missing.join(', ')}]`);
  if (unexpected.length) errors.push(`unapproved spacing primitive value(s) present: [${unexpected.join(', ')}]`);
  return { valid: errors.length === 0, errors };
}

/**
 * Run the full offline validation pass against an already-loaded vendored
 * snapshot. Returns { valid: boolean, errors: string[] } — an aggregate of
 * every check, not short-circuited, so a caller sees every problem at once.
 */
export function validateVendoredArtifact({ manifest, tokens, manifestSchema, tokensSchema, lock }) {
  const results = [
    ['manifest schema', validateManifestSchema(manifest, manifestSchema)],
    ['tokens schema', validateTokensSchema(tokens, tokensSchema)],
    ['lock provenance', validateLockProvenance(lock)],
    ['lock/manifest consistency', validateLockManifestConsistency(lock, manifest)],
    ['contentHash', validateContentHash(tokens, manifest)],
    ['supported schemaVersion', validateSupportedSchemaVersion(manifest)],
    ['Light/Dark parity', validateLightDarkParity(tokens)],
    ['spacing exact set', validateSpacingExactSet(tokens)],
  ];

  const errors = [];
  for (const [label, result] of results) {
    for (const err of result.errors) errors.push(`[${label}] ${err}`);
  }
  return { valid: errors.length === 0, errors };
}
