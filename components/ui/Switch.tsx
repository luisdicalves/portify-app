'use client';

export default function Switch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      style={{
        width: 42, height: 24, borderRadius: 'var(--radius-full)', border: 'none',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        position: 'relative', background: checked ? 'var(--primary-strong)' : 'var(--surface-highest)',
        transition: 'background .2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 20, height: 20,
        borderRadius: 'var(--radius-full)', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        transition: 'left .2s',
      }} />
    </button>
  );
}
