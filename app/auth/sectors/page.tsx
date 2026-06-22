'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';

const SECTORS = [
  { id: 'tech', label: 'Tecnologia', icon: 'computer' },
  { id: 'health', label: 'Saúde', icon: 'health_and_safety' },
  { id: 'finance', label: 'Finanças', icon: 'account_balance' },
  { id: 'energy', label: 'Energia', icon: 'bolt' },
  { id: 'consumer', label: 'Consumo', icon: 'shopping_bag' },
  { id: 'industry', label: 'Indústria', icon: 'factory' },
  { id: 'realestate', label: 'Imobiliário', icon: 'apartment' },
  { id: 'materials', label: 'Materiais', icon: 'diamond' },
  { id: 'comms', label: 'Comunicações', icon: 'cell_tower' },
];

export default function SectorsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(['tech']));

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      <StepHeader step={5} total={6} back={() => router.back()} title="Setores de interesse" sub="Escolha as áreas que quer acompanhar." />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {SECTORS.map(s => {
            const on = selected.has(s.id);
            return (
              <button key={s.id} onClick={() => toggle(s.id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '16px 8px',
                background: on ? 'var(--primary-container)' : 'var(--surface-lowest)',
                border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                borderRadius: 'var(--radius-xl)', cursor: 'pointer', transition: 'all .15s',
              }}>
                <span className={`material-symbols-outlined${on ? ' icf' : ''}`} style={{ fontSize: 28, color: on ? 'var(--primary-strong)' : 'var(--on-surface-variant)' }}>{s.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: on ? 'var(--primary)' : 'var(--on-surface)', textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '24px 24px 48px' }}>
        <button className="btn-primary" disabled={selected.size === 0} onClick={() => router.push('/auth/plan-ask')} style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
