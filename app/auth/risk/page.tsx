'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';

const OPTIONS = [
  { id: 'conservative', label: 'Conservador', desc: 'Prefiro proteger o capital.',              icon: 'shield' },
  { id: 'moderate',     label: 'Moderado',    desc: 'Equilíbrio entre risco e retorno.',        icon: 'balance' },
  { id: 'aggressive',   label: 'Agressivo',   desc: 'Aceito volatilidade por mais retorno.',    icon: 'local_fire_department' },
];

export default function RiskPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(1);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={3} total={5} back={() => router.back()} title="Perfil de risco" sub="Define quanto risco está disposto a aceitar." />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {OPTIONS.map((o, i) => {
          const on = selected === i;
          return (
            <div key={o.id} onClick={() => setSelected(i)} style={{
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

        <div style={{ flex: 1 }} />
        <button onClick={() => router.push('/auth/objective')} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
