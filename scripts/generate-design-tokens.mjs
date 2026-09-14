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

export function generateCss({ manifest, tokens }) {
  const lightColor = colorEntries(tokens.semantic.color.light);
  const darkColor = colorEntries(tokens.semantic.color.dark);
  const radius = radiusEntries(tokens.radius);
  const spacing = spacingEntries(tokens.spacing.primitive);

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

  const rootBlock = cssBlock(':root', [...lightColor, ...radius, ...spacing]);
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
