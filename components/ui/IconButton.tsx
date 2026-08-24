'use client';

type IconButtonVariant = 'filled' | 'tonal' | 'plain' | 'danger';
// PDS-131: minimum touch target is 44x44, so no size below that is offered.
type IconButtonSize = 44 | 48 | 52 | 60;

const VARIANT_STYLE: Record<IconButtonVariant, { background: string; color: string }> = {
  filled: { background: 'var(--primary-strong)', color: '#fff' },
  tonal: { background: 'var(--surface-high)', color: 'var(--on-surface-variant)' },
  plain: { background: 'transparent', color: 'var(--on-surface-variant)' },
  danger: { background: 'var(--critical-container)', color: 'var(--critical)' },
};

const ICON_SIZE: Record<IconButtonSize, number> = { 44: 20, 48: 22, 52: 24, 60: 26 };

// IconButton — PDS-131/132: 14px radius, NEVER circular by default.
export default function IconButton({
  icon,
  size = 48,
  variant = 'tonal',
  onClick,
  ariaLabel,
}: {
  icon: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  onClick?: () => void;
  ariaLabel: string;
}) {
  const { background, color } = VARIANT_STYLE[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        background, color,
        width: size, height: size,
        border: 'none',
        borderRadius: 'var(--radius-button)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: ICON_SIZE[size] }}>{icon}</span>
    </button>
  );
}
