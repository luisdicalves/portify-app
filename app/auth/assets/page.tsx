'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { createClient } from '@/lib/supabase/client';

const ASSETS = [
  { id: 'stocks', icon: 'show_chart',  iconBg: 'var(--primary-strong)', label: 'Ações', desc: 'Apple, Tesla, Nvidia e outras cotadas.' },
  { id: 'etfs',   icon: 'donut_small', iconBg: 'var(--gain-strong)',    label: 'ETFs',  desc: 'S&P 500, MSCI World e fundos indexados.' },
];

export default function AssetsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  async function handleContinue() {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('profiles').update({ preferred_assets: Array.from(selected) }).eq('id', user.id);
        if (error) throw error;
      }
      router.push('/auth/experience');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={1} total={9} back={() => router.back()} title="O que pretende gerir?" sub="Escolha os tipos de ativo para o seu portfólio." />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ASSETS.map(a => {
          const on = selected.has(a.id);
          return (
            <div key={a.id} onClick={() => toggle(a.id)} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: 16, cursor: 'pointer', transition: 'all .15s',
              borderRadius: 'var(--radius-lg)',
              background: on ? 'var(--primary-container)' : 'var(--surface-low)',
              border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
            }}>
              <div style={{ width: 48, height: 48, flex: 'none', borderRadius: 'var(--radius-md)', background: a.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined icf" style={{ fontSize: 26, color: '#fff' }}>{a.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{a.label}</div>
                <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{a.desc}</div>
              </div>
              <span style={{
                width: 26, height: 26, flex: 'none', borderRadius: 'var(--radius-full)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: on ? 'var(--primary-strong)' : 'transparent',
                border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--outline)'}`,
              }}>
                {on && <span className="material-symbols-outlined icf" style={{ fontSize: 18, color: '#fff' }}>check</span>}
              </span>
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        {saveError && <div style={{ fontSize: 13, color: 'var(--loss)', textAlign: 'center' }}>{saveError}</div>}
        <button
          disabled={selected.size === 0 || saving}
          onClick={handleContinue}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 || saving ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
