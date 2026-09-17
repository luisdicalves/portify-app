// Single App-owned source of truth for Typography runtime binding —
// shared by scripts/lib/validate-design-tokens.mjs (compatibility checking)
// and scripts/generate-design-tokens.mjs (CSS generation), so the two never
// independently duplicate this mapping.
//
// PORTIFY-KNOWLEDGE's canonical artifact only knows a family's real name
// ("Space Grotesk", "Space Mono") — it has no concept of this App's local
// next/font/google loader variables. This module is the one place that
// maps a canonical family key to (a) the canonical name the App expects to
// see (so a future upstream rename fails closed instead of silently
// mis-binding), and (b) the App's own already-working CSS binding for it.
//
// This is NOT automatic name-based bridging (forbidden elsewhere in this
// pipeline for existing App design tokens) — it is a literal, factual
// statement of the App's own next/font/google wiring, declared once here.
//
// Updating this file (e.g. because app/layout.tsx's font loader changes)
// is a deliberate, reviewable App-side edit — never inferred from canon.
export const FAMILY_BINDINGS = Object.freeze({
  primary: Object.freeze({
    expectedCanonicalName: 'Space Grotesk',
    cssValue: 'var(--font-sans)',
  }),
  structured: Object.freeze({
    expectedCanonicalName: 'Space Mono',
    cssValue: 'var(--font-mono)',
  }),
});

/**
 * Deterministic camelCase (or PascalCase-in-the-middle, e.g. "titleLg") to
 * kebab-case transform for canonical Typography JSON keys. No manual
 * per-key table — every style-slot/role key the canonical artifact ever
 * introduces is handled mechanically.
 *
 * "brandDisplay" -> "brand-display"
 * "cardFinancialValue" -> "card-financial-value"
 * "numericPrimary" -> "numeric-primary"
 * "titleLg" -> "title-lg"
 * "metadata" -> "metadata"
 */
export function camelToKebab(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
