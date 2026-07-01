'use client';

export type SelectOption = { id: string; label: string; desc: string; icon: string };

export function SelectList({ options, selected, onSelect }: { options: SelectOption[]; selected: number | null; onSelect: (i: number) => void }) {
  return (
    <>
      {options.map((o, i) => {
        const on = selected === i;
        return (
          <div key={o.id} onClick={() => onSelect(i)} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: 15, cursor: 'pointer', transition: 'all .15s',
            borderRadius: 'var(--radius-lg)',
            background: on ? 'var(--primary-container)' : 'var(--surface-low)',
            border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
          }}>
            <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 'var(--radius-md)', background: on ? 'var(--primary-strong)' : 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined icf" style={{ fontSize: 24, color: on ? '#fff' : 'var(--on-surface-variant)' }}>{o.icon}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{o.label}</div>
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', textWrap: 'pretty' as never }}>{o.desc}</div>
            </div>
            <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary-strong)' : 'transparent', border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--outline)'}` }}>
              {on && <span className="material-symbols-outlined icf" style={{ fontSize: 16, color: '#fff' }}>check</span>}
            </span>
          </div>
        );
      })}
    </>
  );
}
