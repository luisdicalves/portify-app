'use client';

import { ReactNode } from 'react';

// Button — PDS-124..130. Base semantic variants are exactly primary/secondary/
// tertiary/critical (PDS-124); "critical" is reserved for destructive or
// irreversible actions (PDS-126), not generic attention-grabbing.
type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'critical';

const VARIANT_STYLE: Record<ButtonVariant, { background: string; color: string }> = {
  primary: { background: 'var(--primary-strong)', color: '#fff' },
  secondary: { background: 'var(--surface-high)', color: 'var(--on-surface)' },
  tertiary: { background: 'transparent', color: 'var(--primary)' },
  critical: { background: 'var(--loss-strong)', color: '#fff' },
};

export default function Button({
  variant = 'primary',
  fullWidth = true,
  icon,
  loading = false,
  disabled,
  onClick,
  type = 'button',
  children,
}: {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children: ReactNode;
}) {
  const { background, color } = VARIANT_STYLE[variant];
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      style={{
        background, color,
        border: 'none',
        borderRadius: 'var(--radius-button)',
        padding: variant === 'tertiary' ? '8px 4px' : 16,
        fontSize: variant === 'tertiary' ? 14 : 16,
        fontWeight: 600,
        cursor: isDisabled ? 'default' : 'pointer',
        width: fullWidth ? '100%' : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: loading ? 0.7 : 1,
        fontFamily: 'inherit',
        transition: 'opacity 0.15s',
      }}
    >
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>}
      {children}
    </button>
  );
}
