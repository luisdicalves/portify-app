'use client';

export default function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 48, height: 28, borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
        position: 'relative', background: checked ? 'var(--primary-strong)' : 'var(--surface-highest)',
        transition: 'background .2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3, width: 22, height: 22,
        borderRadius: 'var(--radius-full)', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        transition: 'left .2s',
      }} />
    </button>
  );
}
