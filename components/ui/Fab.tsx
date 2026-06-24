'use client';

import { useState } from 'react';

export type FabAction = { icon: string; label: string; onClick: () => void; color?: string };

export default function Fab({ actions }: { actions: FabAction[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'absolute', right: 16, bottom: 92, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, zIndex: 20 }}>
      {open && actions.map(a => (
        <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', color: 'var(--on-surface)', fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>{a.label}</span>
          <button
            onClick={() => { a.onClick(); setOpen(false); }}
            style={{ width: 46, height: 46, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', cursor: 'pointer', background: 'var(--surface-lowest)', color: a.color ?? 'var(--on-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{a.icon}</span>
          </button>
        </div>
      ))}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: 60, height: 60, borderRadius: 'var(--radius-xl)', border: 'none', cursor: 'pointer', background: 'var(--primary-strong)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(0,82,204,0.35)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 26, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s' }}>add</span>
      </button>
    </div>
  );
}
