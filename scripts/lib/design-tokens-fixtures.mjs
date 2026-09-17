// Test-only fixture builders, deliberately decoupled from whatever the
// live vendor/ directory happens to contain at any given moment.
//
// Tranche 2B Stage 2 found that several Stage-1-era tests implicitly
// assumed "the live vendored artifact is always shaped like X" — true only
// until a real sync legitimately changed it. This module exists so that
// assumption is never silently baked into a test again: each fixture below
// is an explicit, self-contained, version-labeled synthetic snapshot, never
// derived from vendor/design-system/* on disk.
//
// Four distinct concepts, kept separate on purpose (see the Tranche 2B
// Stage 2 test-fixture-decoupling record for the full rationale):
//   - the LIVE VENDOR FIXTURE (each test file's own loadFixture(), reading
//     vendor/ directly) — appropriate ONLY for integration/drift tests that
//     must track whatever is actually currently vendored.
//   - LEGACY_3_0 fixture (this file) — a stable, synthetic, explicitly
//     3.0.0-shaped snapshot with no Typography domain at all.
//   - TYPOGRAPHY_3_1 fixture (this file) — a stable, synthetic, explicitly
//     3.1.0-shaped snapshot with a complete Typography domain. Mirrors real
//     canonical values for realism; never restated as a second canonical
//     value table (schema/contentHash own exactness, not this fixture).
//   - HASH_KNOWN_ANSWER vector (this file) — an immutable algorithm test
//     vector, deliberately unrelated to any artifact release version, so a
//     future legitimate re-sync never invalidates the hashing-algorithm test.

/** Minimal, self-contained, explicitly 3.0.0-shaped snapshot — no Typography
 * domain. Only as much structure as the compatibility boundary actually
 * needs to be exercised faithfully; not a duplicate of the full historical
 * canonical artifact.
 * @returns {{ manifest: object, tokens: { domainsIncluded: string[], semantic: object, radius: object, spacing: object, typography?: object } }} */
export function makeLegacy30Fixture() {
  /** @type {{ domainsIncluded: string[], semantic: object, radius: object, spacing: object, typography?: object }} */
  const tokens = {
    domainsIncluded: ['color', 'radius', 'spacing'],
    semantic: {
      color: {
        light: { brand: '#025963', canvas: '#ffffff' },
        dark: { brand: '#025963', canvas: '#000000' },
      },
    },
    radius: { btn: '14px', card: '18px' },
    spacing: { primitive: { 'space-4': '4px' }, semantic: {} },
  };
  const manifest = {
    artifactVersion: '3.0.0',
    schemaVersion: '3.0.0',
    generatorVersion: '3.0.0',
    knowledgeCommit: '0'.repeat(40),
    generatedAt: '2026-01-01T00:00:00Z',
    contentHash: 'sha256:' + '0'.repeat(64),
    domainsIncluded: tokens.domainsIncluded,
    sourceFiles: [
      '10-design/DESIGN-SYSTEM/RUNTIME/portify-shared.css',
      '10-design/DESIGN-SYSTEM/CANONICAL-RADIUS-DECISIONS.json',
      '10-design/DESIGN-SYSTEM/CANONICAL-SPACING-DECISIONS.json',
    ],
    sourceWorktreeClean: true,
  };
  return { manifest, tokens };
}

/** Self-contained (never derived from live vendor), explicitly 3.1.0-shaped
 * snapshot with a complete Typography domain. Values mirror the real
 * canonical TYPO-001..012 contract for realism, but exist purely to
 * exercise generator/consumer BEHAVIOR — never a second canonical value
 * table (that stays owned by tokens.schema.json/contentHash upstream). */
export function makeTypography31Fixture() {
  const tokens = {
    domainsIncluded: ['color', 'radius', 'spacing', 'typography'],
    semantic: {
      color: {
        light: { brand: '#025963', canvas: '#ffffff' },
        dark: { brand: '#025963', canvas: '#000000' },
      },
    },
    radius: { btn: '14px', card: '18px' },
    spacing: { primitive: { 'space-4': '4px' }, semantic: {} },
    typography: {
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
    },
  };
  const manifest = {
    artifactVersion: '3.1.0',
    schemaVersion: '3.1.0',
    generatorVersion: '3.1.0',
    knowledgeCommit: '4'.repeat(40),
    generatedAt: '2026-01-01T00:00:00Z',
    contentHash: 'sha256:' + '4'.repeat(64),
    domainsIncluded: tokens.domainsIncluded,
    sourceFiles: [
      '10-design/DESIGN-SYSTEM/RUNTIME/portify-shared.css',
      '10-design/DESIGN-SYSTEM/CANONICAL-RADIUS-DECISIONS.json',
      '10-design/DESIGN-SYSTEM/CANONICAL-SPACING-DECISIONS.json',
      '10-design/DESIGN-SYSTEM/CANONICAL-TYPOGRAPHY-DECISIONS.json',
    ],
    sourceWorktreeClean: true,
  };
  return { manifest, tokens };
}

/** Immutable algorithm test vector for computeContentHash — deliberately
 * unrelated to any real canonical token value or artifact version, so a
 * future legitimate re-sync (which changes real values) never invalidates
 * this known-answer test. Includes nested objects and out-of-order keys to
 * actually exercise the deep-sort step, not just flat serialization. */
export const HASH_KNOWN_ANSWER_INPUT = Object.freeze({
  zebra: 1,
  alpha: { nested: { zulu: 3, alpha: 2 } },
  middle: [3, 1, 2],
});

// Computed once via computeContentHash(HASH_KNOWN_ANSWER_INPUT) — see
// scripts/lib/validate-design-tokens.test.ts's own test, which recomputes
// and asserts this exact value on every run (it is not merely trusted here).
export const HASH_KNOWN_ANSWER_EXPECTED = 'sha256:86ec30def21abc0e8a6ac85f0ada830c2428e468bc4594eefcbd3d09bce564e6';
