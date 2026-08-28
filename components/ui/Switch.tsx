'use client';

export default function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      style={{
        width: 44, height: 44, border: 'none', background: 'transparent', padding: 0,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{
        position: 'relative', width: 42, height: 24, borderRadius: 'var(--radius-full)',
        background: checked ? 'var(--primary-strong)' : 'var(--surface-highest)',
        transition: 'background .2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 20, height: 20,
          borderRadius: 'var(--radius-full)', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          transition: 'left .2s',
        }} />
      </span>
    </button>
  );
}
