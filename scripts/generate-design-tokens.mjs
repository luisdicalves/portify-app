#!/usr/bin/env node
// Offline, deterministic generator: vendor/design-system/* (+ the lock file)
// -> app/generated/design-tokens.css.
//
// NO network access, NO credential/secret awareness — reads only the
// already-committed vendor/ snapshot. Refuses to generate (fails closed,
// non-zero exit) if that snapshot doesn't pass the full offline validation
// pass first (scripts/lib/validate-design-tokens.mjs).
//
// Naming rule for the generated --ds-* custom properties (mechanical,
// reversible, not a semantic alias): `--ds-<domain>-<canonicalKey>`, except
// spacing keys, whose canonical names already self-identify their domain
// ("space-4"), so they are not double-prefixed. This keeps every generated
// property traceable 1:1 back to its exact path in the canonical
// tokens.json, and keeps the three domains from ever colliding with each
// other in one flat namespace.
//
// AUTOMATIC_NAME_BASED_BRIDGING IS FORBIDDEN: this script never looks at,
// reads, or writes anything under app/globals.css — it has no knowledge of
// portify-app's own existing --on-surface/--primary/--space-N vocabulary,
// by design.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVendoredArtifact } from './lib/validate-design-tokens.mjs';
import { camelToKebab, FAMILY_BINDINGS } from './lib/typography-runtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(REPO_ROOT, 'vendor');
const VENDOR_ARTIFACT_DIR = join(VENDOR_DIR, 'design-system');
const OUTPUT_PATH = join(REPO_ROOT, 'app', 'generated', 'design-tokens.css');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadVendoredArtifact() {
  return {
    manifest: readJson(join(VENDOR_ARTIFACT_DIR, 'manifest.json')),
    tokens: readJson(join(VENDOR_ARTIFACT_DIR, 'tokens.json')),
    manifestSchema: readJson(join(VENDOR_ARTIFACT_DIR, 'manifest.schema.json')),
    tokensSchema: readJson(join(VENDOR_ARTIFACT_DIR, 'tokens.schema.json')),
    lock: readJson(join(VENDOR_DIR, 'design-tokens.lock.json')),
  };
}

function cssBlock(selector, entries) {
  const lines = entries.map(([name, value]) => `  --${name}: ${value};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

/** Build the sorted [name, value] entries for one theme's color block. */
function colorEntries(colorMap) {
  return Object.keys(colorMap)
    .sort()
    .map((key) => [`ds-color-${key}`, colorMap[key]]);
}

function radiusEntries(radiusMap) {
  return Object.keys(radiusMap)
    .sort()
    .map((key) => [`ds-radius-${key}`, radiusMap[key]]);
}

function spacingEntries(spacingPrimitiveMap) {
  // Canonical keys are already "space-4".."space-24" — self-identifying,
  // not double-prefixed with the domain name.
  return Object.keys(spacingPrimitiveMap)
    .sort()
    .map((key) => [`ds-${key}`, spacingPrimitiveMap[key]]);
}

// Typography: family + style + role (Tranche 2B). Values are read entirely
// from the vendored tokens.json — never embedded in this script — so a
// future canonical scale/weight/mapping change requires no generator edit,
// only a re-sync. Style-slot/role keys are whatever the vendored artifact
// actually contains; nothing here hardcodes the 13 slots or 9 roles.
const STYLE_PROPERTY_CSS_SUFFIX = Object.freeze({
  family: 'font-family',
  fontSize: 'font-size',
  lineHeight: 'line-height',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
});
const STYLE_PROPERTY_ORDER = Object.freeze(['family', 'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing']);

/** `--ds-typography-family-<kebabKey>: <this App's own CSS binding>;` — the
 * canonical artifact only names the font ("Space Grotesk"); the CSS value
 * itself always comes from FAMILY_BINDINGS (scripts/lib/typography-runtime.mjs),
 * this App's one owned source of truth for its own next/font/google wiring. */
function typographyFamilyEntries(familyMap, familyBindings = FAMILY_BINDINGS) {
  return Object.keys(familyMap)
    .sort()
    .map((key) => [`ds-typography-family-${camelToKebab(key)}`, familyBindings[key].cssValue]);
}

/** Five variables per style slot: font-family (aliasing the family
 * variable above), font-size, line-height, font-weight, letter-spacing —
 * every value read directly from the vendored slot entry, never embedded
 * here. */
function typographyStyleEntries(styleMap) {
  const entries = [];
  for (const slotKey of Object.keys(styleMap).sort()) {
    const slot = styleMap[slotKey];
    const kebabSlot = camelToKebab(slotKey);
    for (const prop of STYLE_PROPERTY_ORDER) {
      const suffix = STYLE_PROPERTY_CSS_SUFFIX[prop];
      const name = `ds-typography-style-${kebabSlot}-${suffix}`;
      const value = prop === 'family' ? `var(--ds-typography-family-${camelToKebab(slot.family)})` : slot[prop];
      entries.push([name, value]);
    }
  }
  return entries;
}

/** Five alias variables per semantic role, each a `var()` reference to its
 * mapped style slot's own five variables — never a copied literal value,
 * so a future style-slot value change propagates automatically with zero
 * drift risk between the two layers. */
function typographyRoleEntries(roleMap) {
  const entries = [];
  for (const roleKey of Object.keys(roleMap).sort()) {
    const styleSlotKey = roleMap[roleKey];
    const kebabRole = camelToKebab(roleKey);
    const kebabSlot = camelToKebab(styleSlotKey);
    for (const prop of STYLE_PROPERTY_ORDER) {
      const suffix = STYLE_PROPERTY_CSS_SUFFIX[prop];
      entries.push([`ds-typography-role-${kebabRole}-${suffix}`, `var(--ds-typography-style-${kebabSlot}-${suffix})`]);
    }
  }
  return entries;
}

/** Typography is theme-independent in v1 (TYPO-009: static scale) — these
 * entries belong in :root only, never duplicated under [data-theme='dark'],
 * unless a future canonical decision introduces theme-specific values. */
function typographyEntries(typography) {
  if (!typography) return [];
  return [
    ...typographyFamilyEntries(typography.family),
    ...typographyStyleEntries(typography.style),
    ...typographyRoleEntries(typography.role),
  ];
}

export function generateCss({ manifest, tokens }) {
  const lightColor = colorEntries(tokens.semantic.color.light);
  const darkColor = colorEntries(tokens.semantic.color.dark);
  const radius = radiusEntries(tokens.radius);
  const spacing = spacingEntries(tokens.spacing.primitive);
  // Absent entirely for a legacy 3.0.0-shaped snapshot (tokens.typography
  // undefined) — typographyEntries() then returns [], so :root is byte-for-
  // byte identical to pre-Tranche-2B output. Never assume presence.
  const typography = typographyEntries(tokens.typography);

  const header = `/* GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/generate-design-tokens.mjs from vendor/design-system/
 * (a committed snapshot of PORTIFY-KNOWLEDGE's canonical token artifact —
 * PORTIFY-KNOWLEDGE remains the sole canonical source of truth).
 *
 * Isolated --ds-* namespace only. No existing portify-app custom property
 * is read, referenced, or overridden by this file — see the Tranche 1B
 * design record for why automatic name-based bridging is forbidden.
 *
 * artifactVersion: ${manifest.artifactVersion}
 * schemaVersion:   ${manifest.schemaVersion}
 * knowledgeCommit: ${manifest.knowledgeCommit}
 * contentHash:     ${manifest.contentHash}
 * domainsIncluded: ${manifest.domainsIncluded.join(', ')}
 */\n\n`;

  const rootBlock = cssBlock(':root', [...lightColor, ...radius, ...spacing, ...typography]);
  const darkBlock = cssBlock("[data-theme='dark']", darkColor);

  return header + rootBlock + '\n' + darkBlock;
}

function main() {
  const artifact = loadVendoredArtifact();

  const { valid, errors } = validateVendoredArtifact(artifact);
  if (!valid) {
    console.error('ERROR: vendored design-token snapshot failed validation — refusing to generate.');
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const css = generateCss(artifact);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, css, 'utf8');
  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`  knowledgeCommit: ${artifact.manifest.knowledgeCommit}`);
  console.log(`  contentHash:     ${artifact.manifest.contentHash}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
