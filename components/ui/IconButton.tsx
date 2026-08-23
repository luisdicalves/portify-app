'use client';

type IconButtonVariant = 'filled' | 'tonal' | 'plain';
type IconButtonSize = 34 | 40 | 46 | 60;

const VARIANT_STYLE: Record<IconButtonVariant, { background: string; color: string }> = {
  filled: { background: 'var(--primary-strong)', color: '#fff' },
  tonal: { background: 'var(--surface-high)', color: 'var(--on-surface-variant)' },
  plain: { background: 'transparent', color: 'var(--on-surface-variant)' },
};

const ICON_SIZE: Record<IconButtonSize, number> = { 34: 18, 40: 20, 46: 22, 60: 26 };

// IconButton — PDS-131/132: 14px radius, NEVER circular by default.
export default function IconButton({
  icon,
  size = 40,
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
