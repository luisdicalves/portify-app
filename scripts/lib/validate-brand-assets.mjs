// Offline validation of the vendored PORTIFY-KNOWLEDGE Brand snapshot and of
// this repository's Brand consumption bindings (Brand Consumer Contract v1,
// PORTIFY-KNOWLEDGE 11-engineering/CLAUDE-ARCHITECTURE/INTERFACES/
// BRAND-CONSUMER-CONTRACT-V1.md; DS-RUNTIME-002 T1).
//
// NO network access, NO credential awareness: it reads only files under the
// given repository root. Shared by the secretless CI check
// (scripts/check-brand-assets.mjs) and by the privileged sync's pre-flight
// (scripts/sync-brand-assets.mjs), which runs it against a staged candidate
// before anything is written into the real tree.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

// Registry schemaVersion values this validator knows how to interpret; any
// other value fails closed instead of being read under an assumed shape.
export const SUPPORTED_REGISTRY_SCHEMA_VERSIONS = Object.freeze(['1.0.0']);
// registryVersion MAJOR this consumer understands (BRAND-REG-008: a MAJOR
// bump is a breaking change to the consumer contract).
export const SUPPORTED_REGISTRY_MAJOR_VERSIONS = Object.freeze([1]);

// Registry sourcePath prefix in PORTIFY-KNOWLEDGE; the vendored path of an
// asset is its sourcePath with this prefix replaced by vendor/brand/assets/.
export const CANONICAL_PATH_PREFIX = '10-design/DESIGN-SYSTEM/BRAND-ASSETS/';
export const DISTRIBUTABLE_STATUS = 'APPROVED';

export const PATHS = Object.freeze({
  registry: 'vendor/brand/registry.json',
  registrySchema: 'vendor/brand/registry.schema.json',
  assetsDir: 'vendor/brand/assets',
  lock: 'vendor/brand.lock.json',
  consumption: 'brand-consumption.json',
  consumptionSchema: 'brand-consumption.schema.json',
});

// T1 contract guard: the ONLY runtime bindings the Product Owner approved for
// portify-app in DS-RUNTIME-002 T1. Platform icon metadata only — appIcon is
// not authorized as a brandMark/splash/login/header/wordmark (placement is T4
// and needs its own approval, which would change this list in a reviewed PR).
export const AUTHORIZED_BINDINGS = Object.freeze([
  Object.freeze({ target: 'app/icon.png', assetId: 'app-icon-on-green-png-512', usage: 'platform-app-icon' }),
  Object.freeze({ target: 'app/apple-icon.png', assetId: 'app-icon-on-green-png-180', usage: 'apple-touch-icon' }),
]);

// Belt and braces for the same guard: in-product brand placement surfaces
// that must never receive a T1 binding, even with an otherwise valid entry.
const PLACEMENT_TARGET_PATTERNS = Object.freeze([
  /^app\/page\.tsx$/,
  /^app\/auth\//,
  /^components\//,
  /(^|\/)(header|brand|logo|splash|login|wordmark)[^/]*$/i,
]);

// Usage → required role, media type and dimension rule.
const USAGE_RULES = Object.freeze({
  'platform-app-icon': { role: 'appIcon', mediaType: 'image/png', dims: (w, h) => w === h && w >= 192 },
  'apple-touch-icon': { role: 'appIcon', mediaType: 'image/png', dims: (w, h) => w === 180 && h === 180 },
});

const HEX40_RE = /^[0-9a-f]{40}$/;
const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const LOCK_KEYS = Object.freeze(['sourceRepository', 'sourceCommit', 'registryVersion', 'schemaVersion', 'contentHash', 'assetCount']);

/** Recursively sort object keys (arrays keep their order) — the same
 * canonicalisation as PORTIFY-KNOWLEDGE validate_brand_registry.deep_sort.
 * @param {any} value @returns {any} */
function deepSort(value) {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = deepSort(value[key]);
    return out;
  }
  return value;
}

/**
 * BRAND-REG-007 contentHash: SHA-256 over the canonical JSON of
 * {registryVersion, schemaVersion, assets} — keys deep-sorted, 2-space indent,
 * non-ASCII unescaped, trailing newline. Byte-identical to Python's
 * json.dumps(deep_sort(x), indent=2, ensure_ascii=False) + "\n".
 * @param {any} registry @returns {string}
 */
export function computeBrandContentHash(registry) {
  const hashable = {
    registryVersion: registry.registryVersion,
    schemaVersion: registry.schemaVersion,
    assets: registry.assets,
  };
  const bytes = Buffer.from(JSON.stringify(deepSort(hashable), null, 2) + '\n', 'utf8');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** @param {Buffer} bytes @returns {string} */
export function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** @param {Buffer} bytes @returns {{width: number, height: number} | null} */
export function pngDimensions(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** @param {any} registry @returns {any[]} */
export function distributableAssets(registry) {
  return (registry.assets ?? []).filter((/** @type {any} */ a) => a.status === DISTRIBUTABLE_STATUS);
}

/** Vendored repository-relative path for a registry sourcePath, or null if
 * the sourcePath is outside the canonical Brand directory or unsafe.
 * @param {string} sourcePath @returns {string | null} */
export function vendoredPathFor(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.startsWith(CANONICAL_PATH_PREFIX)) return null;
  const rel = sourcePath.slice(CANONICAL_PATH_PREFIX.length);
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) return null;
  return `${PATHS.assetsDir}/${rel}`;
}

/** @param {string} dir @param {string} root @returns {string[]} */
function listFiles(dir, root) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs, root));
    else out.push(relative(root, abs).split(sep).join('/'));
  }
  return out;
}

/** @param {string} root @param {string} rel @param {string[]} errors @returns {any} */
function readJson(root, rel, errors) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (err) {
    errors.push(`${rel}: cannot read/parse (${/** @type {Error} */ (err).message})`);
    return null;
  }
}

/** @param {any} schema @param {any} doc @param {string} label @param {string[]} errors */
function schemaCheck(schema, doc, label, errors) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    errors.push(`${label}: schema does not compile (${/** @type {Error} */ (err).message})`);
    return;
  }
  if (!validate(doc)) {
    for (const e of validate.errors ?? []) errors.push(`${label}: schema violation at ${e.instancePath || '/'} ${e.message}`);
  }
}

/**
 * Full local consumer-integrity check (contract §4, checks 1–12).
 * @param {{ root: string }} args
 * @returns {{ valid: boolean, errors: string[], summary: any }}
 */
export function validateBrandConsumer({ root }) {
  /** @type {string[]} */
  const errors = [];
  const registry = readJson(root, PATHS.registry, errors);
  const registrySchema = readJson(root, PATHS.registrySchema, errors);
  const lock = readJson(root, PATHS.lock, errors);
  const consumption = readJson(root, PATHS.consumption, errors);
  const consumptionSchema = readJson(root, PATHS.consumptionSchema, errors);
  if (errors.length) return { valid: false, errors, summary: null };

  // 1. registry against the vendored canonical schema.
  schemaCheck(registrySchema, registry, 'registry', errors);

  // 2. supported versions.
  if (!SUPPORTED_REGISTRY_SCHEMA_VERSIONS.includes(registry.schemaVersion)) {
    errors.push(`registry: unsupported schemaVersion ${JSON.stringify(registry.schemaVersion)} (supported: ${SUPPORTED_REGISTRY_SCHEMA_VERSIONS.join(', ')})`);
  }
  const major = SEMVER_RE.exec(String(registry.registryVersion))?.[1];
  if (major === undefined || !SUPPORTED_REGISTRY_MAJOR_VERSIONS.includes(Number(major))) {
    errors.push(`registry: unsupported registryVersion ${JSON.stringify(registry.registryVersion)} (supported MAJOR: ${SUPPORTED_REGISTRY_MAJOR_VERSIONS.join(', ')})`);
  }

  // 3–4. contentHash, exact BRAND-REG-007 algorithm.
  const computed = computeBrandContentHash(registry);
  if (computed !== registry.contentHash) errors.push(`contentHash: registry declares ${registry.contentHash}, recomputed ${computed}`);
  if (lock.contentHash !== registry.contentHash) errors.push(`lock: contentHash ${lock.contentHash} != registry ${registry.contentHash}`);

  // 5–6. lock shape and consistency.
  const lockKeys = Object.keys(lock);
  const missingKeys = LOCK_KEYS.filter((k) => !lockKeys.includes(k));
  const extraKeys = lockKeys.filter((k) => !LOCK_KEYS.includes(k));
  if (missingKeys.length) errors.push(`lock: missing field(s) ${missingKeys.join(', ')}`);
  if (extraKeys.length) errors.push(`lock: unexpected field(s) ${extraKeys.join(', ')} (no snapshot/generator version, timestamps or consumer commit)`);
  if (typeof lock.sourceRepository !== 'string' || !lock.sourceRepository.startsWith('https://')) errors.push('lock: sourceRepository must be an https URL');
  if (!HEX40_RE.test(String(lock.sourceCommit))) errors.push('lock: sourceCommit must be a full 40-hex commit SHA');
  if (!CONTENT_HASH_RE.test(String(lock.contentHash))) errors.push('lock: contentHash must be sha256:<64 hex>');
  if (lock.registryVersion !== registry.registryVersion) errors.push(`lock: registryVersion ${lock.registryVersion} != registry ${registry.registryVersion}`);
  if (lock.schemaVersion !== registry.schemaVersion) errors.push(`lock: schemaVersion ${lock.schemaVersion} != registry ${registry.schemaVersion}`);
  const approved = distributableAssets(registry);
  if (lock.assetCount !== approved.length) errors.push(`lock: assetCount ${lock.assetCount} != ${approved.length} APPROVED assets`);

  // 7. every APPROVED asset vendored exactly once, bytes verified; nothing extra.
  /** @type {Map<string, any>} */
  const byId = new Map();
  for (const a of registry.assets ?? []) byId.set(a.assetId, a);
  /** @type {Set<string>} */
  const expected = new Set();
  for (const a of approved) {
    const rel = vendoredPathFor(a.sourcePath);
    if (!rel) { errors.push(`asset ${a.assetId}: sourcePath ${a.sourcePath} is outside ${CANONICAL_PATH_PREFIX} or unsafe`); continue; }
    if (expected.has(rel)) { errors.push(`asset ${a.assetId}: vendored path ${rel} is not unique`); continue; }
    expected.add(rel);
    const abs = join(root, rel);
    if (!existsSync(abs)) { errors.push(`asset ${a.assetId}: missing vendored file ${rel}`); continue; }
    const actual = sha256Bytes(readFileSync(abs));
    if (actual !== a.sha256) errors.push(`asset ${a.assetId}: ${rel} sha256 ${actual} != registry ${a.sha256}`);
  }
  for (const rel of listFiles(join(root, PATHS.assetsDir), root)) {
    if (!expected.has(rel)) errors.push(`unexpected vendored file ${rel} (not an APPROVED registry asset)`);
  }

  // 8. consumption document against its own strict schema.
  schemaCheck(consumptionSchema, consumption, 'brand-consumption', errors);
  const bindings = Array.isArray(consumption.bindings) ? consumption.bindings : [];

  // 9–11. each binding: known APPROVED asset, compatible usage, unique target, bytes equal.
  /** @type {Set<string>} */
  const targets = new Set();
  for (const b of bindings) {
    const label = `binding ${b.target} -> ${b.assetId}`;
    if (targets.has(b.target)) errors.push(`${label}: duplicate target`);
    targets.add(b.target);
    const asset = byId.get(b.assetId);
    if (!asset) { errors.push(`${label}: unknown assetId`); continue; }
    if (asset.status !== DISTRIBUTABLE_STATUS) { errors.push(`${label}: asset status ${asset.status} is not ${DISTRIBUTABLE_STATUS}`); continue; }
    const rule = USAGE_RULES[/** @type {keyof typeof USAGE_RULES} */ (b.usage)];
    if (!rule) { errors.push(`${label}: usage ${b.usage} is not an allowed usage`); continue; }
    if (asset.role !== rule.role) errors.push(`${label}: usage ${b.usage} requires role ${rule.role}, asset role is ${asset.role}`);
    if (asset.mediaType !== rule.mediaType) errors.push(`${label}: usage ${b.usage} requires ${rule.mediaType}, asset is ${asset.mediaType}`);
    if (!String(b.target).toLowerCase().endsWith(rule.mediaType === 'image/png' ? '.png' : '.svg')) errors.push(`${label}: target extension does not match ${rule.mediaType}`);
    const d = asset.dimensions;
    if (!d || !rule.dims(d.width, d.height)) errors.push(`${label}: dimensions ${d ? `${d.width}x${d.height}` : 'none'} not valid for ${b.usage}`);
    const vendored = vendoredPathFor(asset.sourcePath);
    const targetAbs = join(root, b.target);
    if (!existsSync(targetAbs)) { errors.push(`${label}: runtime target file missing`); continue; }
    if (vendored && existsSync(join(root, vendored)) && !readFileSync(targetAbs).equals(readFileSync(join(root, vendored)))) {
      errors.push(`${label}: runtime target bytes differ from vendored ${vendored}`);
    }
  }

  // 12. T1 contract guard: exactly the authorized bindings, no placement targets.
  for (const b of bindings) {
    if (PLACEMENT_TARGET_PATTERNS.some((re) => re.test(String(b.target)))) {
      errors.push(`binding ${b.target} -> ${b.assetId}: in-product brand placement target is not authorized in T1 (appIcon is not a brandMark)`);
    }
  }
  const key = (/** @type {any} */ b) => `${b.target}|${b.assetId}|${b.usage}`;
  const want = new Set(AUTHORIZED_BINDINGS.map(key));
  const got = new Set(bindings.map(key));
  for (const k of got) if (!want.has(k)) errors.push(`binding ${k}: not an authorized T1 binding`);
  for (const k of want) if (!got.has(k)) errors.push(`binding ${k}: authorized T1 binding missing`);

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      registryVersion: registry.registryVersion,
      schemaVersion: registry.schemaVersion,
      contentHash: registry.contentHash,
      sourceCommit: lock.sourceCommit,
      approvedAssets: approved.length,
      bindings: bindings.length,
    },
  };
}
