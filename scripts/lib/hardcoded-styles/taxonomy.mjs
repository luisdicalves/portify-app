// Violation taxonomy v1 — HARDSTYLE-012.
//
// This module owns *what counts as what*. It deliberately contains no
// scanning and no I/O, so both the TS/TSX scanner and the CSS scanner
// classify identically and the tests can exercise policy directly.
//
// Nothing here consults token values: HARDSTYLE-009 is explicit that token
// awareness must never change whether a literal is a violation.

/** Bumped only when stable-signature composition changes (HARDSTYLE-005). */
export const FINDING_IDENTITY_VERSION = 1;

export const RULES = Object.freeze({
  RAW_VISUAL_COLOR_LITERAL: 'RAW_VISUAL_COLOR_LITERAL',
  TEXT_TYPOGRAPHY_LITERAL: 'TEXT_TYPOGRAPHY_LITERAL',
  SPACING_LITERAL: 'SPACING_LITERAL',
  BORDER_RADIUS_LITERAL: 'BORDER_RADIUS_LITERAL',
  GEOMETRY_LITERAL: 'GEOMETRY_LITERAL',
  ELEVATION_LITERAL: 'ELEVATION_LITERAL',
  INTERACTION_LITERAL: 'INTERACTION_LITERAL',
  DYNAMIC_STYLE_EXPRESSION: 'DYNAMIC_STYLE_EXPRESSION',
});

/** A finding's enforcement standing. Only ENFORCED_V1 may ever fail CI. */
export const STATUS = Object.freeze({
  ENFORCED_V1: 'ENFORCED_V1',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  MEASURE_ONLY: 'MEASURE_ONLY',
  BLOCKED_BY_MISSING_CANONICAL_TOKEN: 'BLOCKED_BY_MISSING_CANONICAL_TOKEN',
});

export const RULE_STATUS = Object.freeze({
  [RULES.RAW_VISUAL_COLOR_LITERAL]: STATUS.ENFORCED_V1,
  [RULES.TEXT_TYPOGRAPHY_LITERAL]: STATUS.ENFORCED_V1,
  [RULES.SPACING_LITERAL]: STATUS.ENFORCED_V1,
  [RULES.BORDER_RADIUS_LITERAL]: STATUS.ENFORCED_V1,
  // Geometry is deliberately review-only in v1 (HARDSTYLE-012 REVIEW list).
  [RULES.GEOMETRY_LITERAL]: STATUS.REVIEW_REQUIRED,
  // No canonical elevation or interaction token exists in the distributed
  // artifact, so these cannot be enforced against any target.
  [RULES.ELEVATION_LITERAL]: STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN,
  [RULES.INTERACTION_LITERAL]: STATUS.BLOCKED_BY_MISSING_CANONICAL_TOKEN,
  // A value we cannot statically reduce is never reported as a literal.
  [RULES.DYNAMIC_STYLE_EXPRESSION]: STATUS.REVIEW_REQUIRED,
});

// ---------------------------------------------------------------------------
// Property classification
// ---------------------------------------------------------------------------

const TYPOGRAPHY_PROPS = new Set(['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFamily']);

const SPACING_PROPS = new Set([
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'rowGap', 'columnGap',
]);

const RADIUS_PROPS = new Set([
  'borderRadius',
  'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
]);

const GEOMETRY_PROPS = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'top', 'right', 'bottom', 'left', 'inset',
  'zIndex', 'transform', 'aspectRatio', 'flexBasis',
  'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'strokeWidth',
]);

const ELEVATION_PROPS = new Set(['boxShadow', 'textShadow', 'filter', 'backdropFilter']);

const INTERACTION_PROPS = new Set([
  'transition', 'transitionDuration', 'transitionTimingFunction', 'transitionProperty',
  'animation', 'animationDuration', 'animationTimingFunction',
  'opacity', 'cursor', 'outline', 'outlineWidth',
]);

/** kebab-case (CSS) -> camelCase (JSX), so both scanners share one taxonomy. */
export function toCamelCase(prop) {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Value semantics
// ---------------------------------------------------------------------------

/** Contextual CSS keywords that carry no authored visual value. */
const ALLOWED_KEYWORDS = new Set([
  'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert',
  'none', 'auto', 'normal',
]);

const NAMED_COLORS = new Set([
  'aqua', 'aquamarine', 'beige', 'black', 'blue', 'brown', 'chocolate', 'coral', 'crimson',
  'cyan', 'darkblue', 'darkgray', 'darkgreen', 'darkgrey', 'darkred', 'fuchsia', 'gold',
  'gray', 'green', 'grey', 'indigo', 'ivory', 'khaki', 'lavender', 'lightblue', 'lightgray',
  'lightgreen', 'lightgrey', 'lime', 'magenta', 'maroon', 'navy', 'olive', 'orange', 'orchid',
  'pink', 'plum', 'purple', 'red', 'salmon', 'salmon', 'sienna', 'silver', 'tan', 'teal',
  'tomato', 'turquoise', 'violet', 'wheat', 'white', 'yellow',
]);

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR_RE = /\b(rgba?|hsla?)\s*\(/i;
const HEX_ANYWHERE_RE = /#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/** true when the value is (or contains) an authored colour literal. */
export function containsColorLiteral(raw) {
  if (typeof raw !== 'string') return false;
  const v = raw.trim();
  if (!v) return false;
  if (ALLOWED_KEYWORDS.has(v.toLowerCase())) return false;
  if (HEX_ANYWHERE_RE.test(v)) return true;
  if (FUNC_COLOR_RE.test(v)) return true;
  if (NAMED_COLORS.has(v.toLowerCase())) return true;
  return false;
}

/** true when the value defers to a CSS custom property rather than authoring one. */
export function isVarReference(raw) {
  return typeof raw === 'string' && /\bvar\(\s*--/.test(raw);
}

/**
 * HARDSTYLE-002: a `var(--x)` reference is compliant with the anti-hardcoded
 * policy, but that is NOT canonical Design System consumption. The two are
 * reported as separate fields and must never be merged into one metric.
 */
export function varCompliance(raw) {
  if (!isVarReference(raw)) return null;
  const names = [...String(raw).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
  const canonical = names.filter((n) => n.startsWith('--ds-'));
  return {
    antiHardcodedCompliant: true,
    canonicalDsReference: canonical.length > 0,
    variables: names,
  };
}

/** HARDSTYLE-014: cascade keywords are neutral on every ENFORCED_V1 property. */
const CASCADE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/** Margins are the only v1 spacing properties for which `auto` is valid CSS. */
const AUTO_VALID_SPACING = new Set(['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']);

/** Any unit-bearing (or unitless) zero: 0, -0, 0.0, 0px, 0rem, 0em, 0%, ... */
const ZERO_RE = /^[+-]?(0+(\.0*)?|\.0+)([a-z]+|%)?$/;

function isZeroToken(t) {
  return ZERO_RE.test(t);
}

/**
 * Measurement-only neutrality for properties OUTSIDE the ENFORCED_V1
 * taxonomy (geometry, elevation, interaction, colour-carrying shorthands).
 * HARDSTYLE-014 does not govern these; this is the unchanged Tranche A
 * behaviour, kept so REVIEW/BLOCKED measurement does not move for reasons
 * no decision covers.
 */
const MEASUREMENT_NEUTRAL = new Set([
  'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert',
  'none', 'auto', 'normal',
]);
function isMeasurementNeutral(v) {
  return MEASUREMENT_NEUTRAL.has(v) || v === '0' || v === '0px' || v === '100%';
}

/**
 * HARDSTYLE-014 — neutral, cascade and non-magnitude values.
 *
 * Property-aware on purpose: there is no generic "keyword = allowed" rule.
 *   typography : only cascade keywords are neutral. `normal`, `bold`,
 *                `small`, `large`... remain TEXT_TYPOGRAPHY_LITERAL.
 *   spacing    : cascade keywords; any zero; `auto` on margins; and a
 *                composite made ONLY of those (`0 auto`). One non-zero
 *                component (`0 auto 16px`) makes the whole value a literal.
 *   radius     : cascade keywords; any zero, including composites of zeros.
 * String and numeric zero are treated identically.
 */
export function isNeutralValue(property, raw) {
  const prop = toCamelCase(property);
  const enforcedProp = TYPOGRAPHY_PROPS.has(prop) || SPACING_PROPS.has(prop) || RADIUS_PROPS.has(prop);

  if (typeof raw === 'number') {
    // Outside ENFORCED_V1 no number was ever neutral (Tranche A behaviour),
    // so `top: 0` / `zIndex: 0` keep being measured as REVIEW geometry.
    if (!enforcedProp) return false;
    return raw === 0 && (SPACING_PROPS.has(prop) || RADIUS_PROPS.has(prop));
  }
  const v = String(raw).trim().toLowerCase();
  if (!v) return false;
  if (!enforcedProp) return isMeasurementNeutral(v);

  if (CASCADE_KEYWORDS.has(v)) return true;
  if (TYPOGRAPHY_PROPS.has(prop)) return false;

  const parts = v.split(/\s+/);
  if (SPACING_PROPS.has(prop)) {
    return parts.every((t) => isZeroToken(t) || (t === 'auto' && AUTO_VALID_SPACING.has(prop)));
  }
  return parts.every(isZeroToken); // radius
}

/**
 * Canonical string form of an authored literal. Participates in stable
 * identity (HARDSTYLE-005), so equivalent authored spellings must normalise
 * to the same string — `#FFF` and `#ffffff` are one violation, not two.
 */
export function normalizeValue(raw) {
  if (typeof raw === 'number') return String(raw);
  let v = String(raw).trim().replace(/\s+/g, ' ');
  if (HEX_RE.test(v)) {
    let hex = v.slice(1).toLowerCase();
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    return `#${hex}`;
  }
  return v.toLowerCase();
}

/**
 * Which rule, if any, an authored literal on `property` belongs to.
 * `property` is camelCase. Returns null when nothing applies.
 *
 * Colour is value-driven rather than property-driven, so
 * `background: '#fff'` is caught as well as `color: '#fff'`.
 */
export function classify({ property, value, isMaterialSymbolContext = false }) {
  const prop = toCamelCase(property);

  // HARDSTYLE-013: a property whose whole policy is non-enforceable wins over
  // value-driven colour detection, so `boxShadow: '0 1px 2px #0000001a'` is
  // never promoted to ENFORCED_V1. The embedded literal stays visible as the
  // `embeddedColorLiteral` diagnostic. This is not a generic colour
  // exemption: a composite such as `border` is not wholly non-enforceable,
  // so its colour is still caught below.
  if (ELEVATION_PROPS.has(prop)) return RULES.ELEVATION_LITERAL;
  if (INTERACTION_PROPS.has(prop)) return RULES.INTERACTION_LITERAL;

  if (containsColorLiteral(value)) return RULES.RAW_VISUAL_COLOR_LITERAL;

  if (TYPOGRAPHY_PROPS.has(prop)) {
    // HARDSTYLE-004: icon geometry on a structurally proven Material Symbols
    // element is not semantic typography. Colour on the same element is still
    // caught, because colour is handled above and never reaches this branch.
    if (isMaterialSymbolContext && (prop === 'fontSize' || prop === 'fontFamily')) return null;
    return RULES.TEXT_TYPOGRAPHY_LITERAL;
  }
  if (SPACING_PROPS.has(prop)) return RULES.SPACING_LITERAL;
  if (RADIUS_PROPS.has(prop)) {
    // HARDSTYLE-015: any percentage radius is element-relative geometry with
    // no canonical target -> REVIEW_REQUIRED, never BORDER_RADIUS_LITERAL.
    if (typeof value === 'string' && value.includes('%')) return RULES.GEOMETRY_LITERAL;
    return RULES.BORDER_RADIUS_LITERAL;
  }
  if (GEOMETRY_PROPS.has(prop)) return RULES.GEOMETRY_LITERAL;
  return null;
}

export function statusForRule(rule) {
  return RULE_STATUS[rule] ?? STATUS.REVIEW_REQUIRED;
}

export const PROPERTY_SETS = Object.freeze({
  TYPOGRAPHY_PROPS, SPACING_PROPS, RADIUS_PROPS, GEOMETRY_PROPS, ELEVATION_PROPS, INTERACTION_PROPS,
});
