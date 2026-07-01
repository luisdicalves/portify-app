'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { createClient } from '@/lib/supabase/client';

const SECTORS = [
  { id: 'tech',        label: 'Tecnologia',     icon: 'computer' },
  { id: 'health',      label: 'Saúde',          icon: 'health_and_safety' },
  { id: 'finance',     label: 'Finanças',       icon: 'account_balance' },
  { id: 'energy',      label: 'Energia',        icon: 'bolt' },
  { id: 'consumer',    label: 'Consumo',        icon: 'shopping_bag' },
  { id: 'industry',    label: 'Indústria',      icon: 'factory' },
  { id: 'realestate',  label: 'Imobiliário',    icon: 'apartment' },
  { id: 'materials',   label: 'Materiais',      icon: 'diamond' },
  { id: 'comms',       label: 'Comunicações',   icon: 'cell_tower' },
];

export default function SectorsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  async function handleContinue() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ preferred_sectors: Array.from(selected) }).eq('id', user.id);
    }
    router.push('/auth/plan-ask');
  }

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      <StepHeader step={8} total={9} back={() => router.back()} title="Setores de interesse" sub="Escolhe as áreas que queres acompanhar." />

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {SECTORS.map(s => {
            const on = selected.has(s.id);
            return (
              <button key={s.id} onClick={() => toggle(s.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 14px',
                background: on ? 'var(--primary-strong)' : 'var(--surface-low)',
                border: `1px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all .15s',
                fontSize: 14, fontWeight: 600,
                color: on ? '#fff' : 'var(--on-surface)',
                fontFamily: 'inherit',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: on ? '#fff' : 'var(--on-surface-variant)' }}>{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '24px 24px 48px' }}>
        <button
          disabled={selected.size === 0 || saving}
          onClick={handleContinue}
          style={{
            width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600,
            cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: selected.size === 0 || saving ? 0.5 : 1,
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
