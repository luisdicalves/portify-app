'use client';

// SegmentedControl — PDS-186..192: local mutually-exclusive choice, shared
// capsule container. Renders real <button> elements (not styled <div>s) so
// role="button" locators (e2e, screen readers) keep working.
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--surface-container)', borderRadius: 'var(--radius-button)', padding: 3 }}>
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            style={{
              flex: 1,
              minHeight: 38,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 11,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: active ? 'var(--surface-lowest)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.14)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
