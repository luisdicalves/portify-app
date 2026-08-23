'use client';

// Badge — PDS-142..146. Non-interactive status/category/metadata label
// (PDS-142), using semantic tokens such as neutral/information/warning/
// critical (PDS-144) — never used to display financial gain/loss performance
// directly, which has dedicated components (PDS-145).
type BadgeIntent = 'information' | 'warning' | 'critical' | 'neutral';
type BadgeSize = 'sm' | 'md';

const INTENT_STYLE: Record<BadgeIntent, { bg: string; color: string }> = {
  information: { bg: 'var(--information-container)', color: 'var(--information-strong)' },
  warning: { bg: 'var(--warning-container)', color: 'var(--warning-strong)' },
  critical: { bg: 'var(--loss-container)', color: 'var(--loss)' },
  neutral: { bg: 'var(--surface-high)', color: 'var(--on-surface-variant)' },
};

const SIZE_STYLE: Record<BadgeSize, { fontSize: number; padding: string }> = {
  sm: { fontSize: 11, padding: '2px 8px' },
  md: { fontSize: 13, padding: '3px 9px' },
};

export default function Badge({
  label,
  intent,
  size = 'sm',
}: {
  label: string;
  intent: BadgeIntent;
  size?: BadgeSize;
}) {
  const { bg, color } = INTENT_STYLE[intent];
  const { fontSize, padding } = SIZE_STYLE[size];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontWeight: 700,
      borderRadius: 'var(--radius-full)', background: bg, color, fontSize, padding,
    }}>
      {label}
    </span>
  );
}
