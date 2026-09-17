import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeContentHash,
  deepSortKeys,
  validateManifestSchema,
  validateTokensSchema,
  validateLockProvenance,
  validateLockManifestConsistency,
  validateContentHash,
  validateSupportedSchemaVersion,
  validateLightDarkParity,
  validateSpacingExactSet,
  validateTypographyRuntimeCompatibility,
  validateVendoredArtifact,
  APPROVED_SPACING_VALUES,
  SUPPORTED_SCHEMA_VERSIONS,
} from './validate-design-tokens.mjs';
import { FAMILY_BINDINGS, camelToKebab } from './typography-runtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = join(__dirname, '..', '..', 'vendor');

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Fresh, independent copies for every test — tests must never mutate a
// shared fixture object and leak state into another test.
function loadFixture() {
  return {
    manifest: readJson(join(VENDOR_DIR, 'design-system', 'manifest.json')),
    tokens: readJson(join(VENDOR_DIR, 'design-system', 'tokens.json')),
    manifestSchema: readJson(join(VENDOR_DIR, 'design-system', 'manifest.schema.json')),
    tokensSchema: readJson(join(VENDOR_DIR, 'design-system', 'tokens.schema.json')),
    lock: readJson(join(VENDOR_DIR, 'design-tokens.lock.json')),
  };
}

describe('the current committed vendored artifact', () => {
  it('passes full validation as-is', () => {
    const result = validateVendoredArtifact(loadFixture());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('reproduces the known-good contentHash exactly (known-answer test)', () => {
    const { tokens } = loadFixture();
    const hash = computeContentHash(tokens);
    expect(hash).toBe('sha256:809de2341610ccb07745b2b4c3d1bcbdd5b8310d5dc2820641b387fd318ce231');
  });

  it('produces bytes byte-identical to the vendored tokens.json file', () => {
    const { tokens } = loadFixture();
    const canonicalBytes = Buffer.from(JSON.stringify(deepSortKeys(tokens), null, 2) + '\n', 'utf8');
    const committedBytes = readFileSync(join(VENDOR_DIR, 'design-system', 'tokens.json'));
    expect(Buffer.compare(canonicalBytes, committedBytes)).toBe(0);
  });
});

describe('validateManifestSchema', () => {
  it('rejects a manifest missing a required field', () => {
    const { manifest, manifestSchema } = loadFixture();
    const broken = { ...manifest };
    delete broken.contentHash;
    const result = validateManifestSchema(broken, manifestSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a manifest with a malformed knowledgeCommit', () => {
    const { manifest, manifestSchema } = loadFixture();
    const broken = { ...manifest, knowledgeCommit: 'not-a-commit-sha' };
    const result = validateManifestSchema(broken, manifestSchema);
    expect(result.valid).toBe(false);
  });
});

describe('validateTokensSchema', () => {
  it('rejects tokens missing the required radius domain', () => {
    const { tokens, tokensSchema } = loadFixture();
    const broken = { ...tokens };
    delete broken.radius;
    const result = validateTokensSchema(broken, tokensSchema);
    expect(result.valid).toBe(false);
  });

  it('rejects a spacing primitive value outside the approved enum', () => {
    const { tokens, tokensSchema } = loadFixture();
    const broken = structuredClone(tokens);
    broken.spacing.primitive['space-4'] = '2px';
    const result = validateTokensSchema(broken, tokensSchema);
    expect(result.valid).toBe(false);
  });
});

describe('validateLockProvenance', () => {
  it('passes on the current lock file', () => {
    const { lock } = loadFixture();
    expect(validateLockProvenance(lock).valid).toBe(true);
  });

  it('fails when a required field is missing', () => {
    const { lock } = loadFixture();
    const broken = { ...lock };
    delete broken.distributionCommit;
    const result = validateLockProvenance(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('distributionCommit'))).toBe(true);
  });

  it('fails on a malformed contentHash shape', () => {
    const { lock } = loadFixture();
    const broken = { ...lock, contentHash: 'not-a-hash' };
    expect(validateLockProvenance(broken).valid).toBe(false);
  });
});

describe('validateLockManifestConsistency', () => {
  it('fails when lock and manifest disagree (lock mismatch)', () => {
    const { lock, manifest } = loadFixture();
    const staleLock = { ...lock, knowledgeCommit: '0'.repeat(40) };
    const result = validateLockManifestConsistency(staleLock, manifest);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('knowledgeCommit');
  });

  it('does NOT compare distributionCommit against manifest (manifest has no such field)', () => {
    const { lock, manifest } = loadFixture();
    // distributionCommit legitimately differs from anything in manifest.json —
    // this must never be treated as a mismatch.
    const result = validateLockManifestConsistency(lock, manifest);
    expect(result.valid).toBe(true);
  });
});

describe('validateContentHash', () => {
  it('fails closed when tokens.json content does not match the declared hash', () => {
    const { tokens, manifest } = loadFixture();
    const tampered = structuredClone(tokens);
    tampered.radius.btn = '99px';
    const result = validateContentHash(tampered, manifest);
    expect(result.valid).toBe(false);
  });
});

describe('validateSupportedSchemaVersion', () => {
  it('accepts the current supported version', () => {
    const { manifest } = loadFixture();
    expect(validateSupportedSchemaVersion(manifest).valid).toBe(true);
  });

  it('fails closed on an unrecognized schemaVersion', () => {
    const { manifest } = loadFixture();
    const broken = { ...manifest, schemaVersion: '99.0.0' };
    const result = validateSupportedSchemaVersion(broken);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('99.0.0');
  });
});

describe('validateLightDarkParity', () => {
  it('passes on the current tokens (light/dark key sets match)', () => {
    const { tokens } = loadFixture();
    expect(validateLightDarkParity(tokens).valid).toBe(true);
  });

  it('fails when a key exists in light but not dark', () => {
    const { tokens } = loadFixture();
    const broken = structuredClone(tokens);
    broken.semantic.color.light['only-in-light'] = '#000000';
    const result = validateLightDarkParity(broken);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('only-in-light');
  });

  it('fails when a key exists in dark but not light', () => {
    const { tokens } = loadFixture();
    const broken = structuredClone(tokens);
    broken.semantic.color.dark['only-in-dark'] = '#000000';
    const result = validateLightDarkParity(broken);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('only-in-dark');
  });
});

describe('validateSpacingExactSet', () => {
  it('passes on the current, approved ten-value set', () => {
    const { tokens } = loadFixture();
    expect(validateSpacingExactSet(tokens).valid).toBe(true);
  });

  it('fails when an unapproved value (e.g. 32px) is present', () => {
    const { tokens } = loadFixture();
    const broken = structuredClone(tokens);
    broken.spacing.primitive['space-32'] = '32px';
    const result = validateSpacingExactSet(broken);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('32px');
  });

  it('fails when an unapproved value (2px) is present', () => {
    const { tokens } = loadFixture();
    const broken = structuredClone(tokens);
    broken.spacing.primitive['space-4'] = '2px';
    const result = validateSpacingExactSet(broken);
    expect(result.valid).toBe(false);
  });

  it('fails when an approved primitive is missing entirely', () => {
    const { tokens } = loadFixture();
    const broken = structuredClone(tokens);
    delete broken.spacing.primitive['space-24'];
    const result = validateSpacingExactSet(broken);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('24px');
  });

  it('the approved set is exactly the Product Owner-approved ten values', () => {
    expect([...APPROVED_SPACING_VALUES].sort()).toEqual(
      ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '4px', '6px', '8px'].sort(),
    );
    expect(APPROVED_SPACING_VALUES).not.toContain('2px');
    expect(APPROVED_SPACING_VALUES).not.toContain('32px');
  });
});

// Controlled 3.1.0 Typography fixture — mirrors the real canonical values
// for realism (per Tranche 2B instruction), but exists purely to exercise
// generator/consumer BEHAVIOR (presence coherence, family-identity
// fail-closed, referential resolvability). It is not a second canonical
// value table: no test below asserts the individual fontSize/lineHeight/
// fontWeight/letterSpacing values are "the" approved ones — that is
// tokens.schema.json's (AJV) and contentHash's job, already proven
// end-to-end during the Tranche 2B preflight against the real 3.1.0
// artifact, not restated here.
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
  const manifest = {
    ...base.manifest,
    schemaVersion: '3.1.0',
    artifactVersion: '3.1.0',
    generatorVersion: '3.1.0',
    domainsIncluded: tokens.domainsIncluded,
  };
  return { ...base, tokens, manifest };
}

describe('SUPPORTED_SCHEMA_VERSIONS (Tranche 2B Stage 1)', () => {
  it('supports both 3.0.0 and 3.1.0', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain('3.0.0');
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain('3.1.0');
  });
});

describe('camelToKebab', () => {
  it('transforms every real canonical style-slot and role key exactly as expected', () => {
    expect(camelToKebab('brandDisplay')).toBe('brand-display');
    expect(camelToKebab('cardFinancialValue')).toBe('card-financial-value');
    expect(camelToKebab('numericPrimary')).toBe('numeric-primary');
    expect(camelToKebab('titleLg')).toBe('title-lg');
    expect(camelToKebab('metadata')).toBe('metadata');
    expect(camelToKebab('bodyLg')).toBe('body-lg');
    expect(camelToKebab('bodyMd')).toBe('body-md');
    expect(camelToKebab('numericSecondary')).toBe('numeric-secondary');
    expect(camelToKebab('numericInline')).toBe('numeric-inline');
    expect(camelToKebab('numericHero')).toBe('numeric-hero');
    expect(camelToKebab('sectionTitle')).toBe('section-title');
    expect(camelToKebab('secondaryBody')).toBe('secondary-body');
    expect(camelToKebab('pageTitle')).toBe('page-title');
    expect(camelToKebab('financialHero')).toBe('financial-hero');
  });
});

describe('validateTypographyRuntimeCompatibility', () => {
  it('does not require typography for a legacy 3.0.0 snapshot', () => {
    const { manifest, tokens } = loadFixture();
    expect(tokens.typography).toBeUndefined();
    const result = validateTypographyRuntimeCompatibility(manifest, tokens);
    expect(result.valid).toBe(true);
  });

  it('requires typography to be present for schemaVersion 3.1.0', () => {
    const { manifest } = loadFixture();
    const broken31Manifest = { ...manifest, schemaVersion: '3.1.0', domainsIncluded: manifest.domainsIncluded };
    const tokensWithoutTypography = loadFixture().tokens;
    const result = validateTypographyRuntimeCompatibility(broken31Manifest, tokensWithoutTypography);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("requires tokens.typography"))).toBe(true);
  });

  it('accepts a valid 3.1.0 fixture with correct family identities', () => {
    const { manifest, tokens } = load31Fixture();
    const result = validateTypographyRuntimeCompatibility(manifest, tokens);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails closed when domainsIncluded and tokens.typography disagree', () => {
    const { manifest, tokens } = load31Fixture();
    const inconsistentManifest = { ...manifest, domainsIncluded: ['color', 'radius', 'spacing'] };
    const result = validateTypographyRuntimeCompatibility(inconsistentManifest, tokens);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('inconsistent'))).toBe(true);
  });

  it('fails closed when family.primary.name no longer matches this App\'s Space Grotesk loader binding', () => {
    const { manifest, tokens } = load31Fixture();
    const renamed = structuredClone(tokens);
    renamed.typography.family.primary.name = 'Some Other Font';
    const result = validateTypographyRuntimeCompatibility(manifest, renamed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Space Grotesk'))).toBe(true);
  });

  it('fails closed when family.structured.name no longer matches this App\'s Space Mono loader binding', () => {
    const { manifest, tokens } = load31Fixture();
    const renamed = structuredClone(tokens);
    renamed.typography.family.structured.name = 'Some Other Mono Font';
    const result = validateTypographyRuntimeCompatibility(manifest, renamed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Space Mono'))).toBe(true);
  });

  it('fails closed when a style slot references a family key with no local runtime binding', () => {
    const { manifest, tokens } = load31Fixture();
    const broken = structuredClone(tokens);
    broken.typography.style.display.family = 'unbound-family-key';
    const result = validateTypographyRuntimeCompatibility(manifest, broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('unbound-family-key'))).toBe(true);
  });

  it('the App owns exactly the two families the canonical artifact names, bound to its own next/font loader', () => {
    expect(FAMILY_BINDINGS.primary).toEqual({ expectedCanonicalName: 'Space Grotesk', cssValue: 'var(--font-sans)' });
    expect(FAMILY_BINDINGS.structured).toEqual({ expectedCanonicalName: 'Space Mono', cssValue: 'var(--font-mono)' });
  });
});

describe('validateVendoredArtifact aggregation', () => {
  it('surfaces multiple independent problems at once, not just the first', () => {
    const fixture = loadFixture();
    const broken = {
      ...fixture,
      lock: { ...fixture.lock, knowledgeCommit: '0'.repeat(40) },
      manifest: { ...fixture.manifest, schemaVersion: '99.0.0' },
    };
    const result = validateVendoredArtifact(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
