'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';

const OPTIONS = [
  { id: 'short', label: 'Curto prazo', desc: 'Comprar e vender no curto prazo.', icon: 'flash_on' },
  { id: 'long', label: 'Longo prazo', desc: 'Manter posições durante anos.', icon: 'hourglass_bottom' },
  { id: 'income', label: 'Rendimento', desc: 'Gerar rendimento com dividendos.', icon: 'payments' },
];

export default function ObjectivePage() {
  const router = useRouter();
  const [selected, setSelected] = useState('long');

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      <StepHeader step={4} total={6} back={() => router.back()} title="Objetivo ao investir" sub="O que procura ao negociar." />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 24px 0' }}>
        {OPTIONS.map(o => {
          const on = selected === o.id;
          return (
            <button key={o.id} onClick={() => setSelected(o.id)} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px',
              background: on ? 'var(--primary-container)' : 'var(--surface-lowest)',
              border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
              borderRadius: 'var(--radius-xl)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: on ? 'var(--primary-strong)' : 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <span className={`material-symbols-outlined${on ? ' icf' : ''}`} style={{ fontSize: 24, color: on ? '#fff' : 'var(--on-surface-variant)' }}>{o.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: on ? 'var(--primary)' : 'var(--on-surface)' }}>{o.label}</div>
                <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>{o.desc}</div>
              </div>
              {on && <span className="material-symbols-outlined icf" style={{ fontSize: 22, color: 'var(--primary-strong)', flex: 'none' }}>check_circle</span>}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '24px 24px 48px' }}>
        <button className="btn-primary" onClick={() => router.push('/auth/sectors')}>Continuar</button>
      </div>
    </div>
  );
}
