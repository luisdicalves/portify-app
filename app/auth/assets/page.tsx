'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';

const ASSET_TYPES = [
  { id: 'stocks', icon: 'candlestick_chart', label: 'Ações', desc: 'Apple, Tesla, Nvidia e outras cotadas.' },
  { id: 'etfs', icon: 'donut_small', label: 'ETFs', desc: 'S&P 500, MSCI World e fundos indexados.' },
  { id: 'crypto', icon: 'currency_bitcoin', label: 'Cripto', desc: 'Bitcoin, Ethereum e outros ativos digitais.' },
  { id: 'bonds', icon: 'account_balance', label: 'Obrigações', desc: 'Dívida pública e corporativa.' },
];

export default function AssetsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(['stocks', 'etfs']));

  const toggle = (id: string) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      <StepHeader step={1} total={6} back={() => router.back()} title="O que pretende gerir?" sub="Escolha os tipos de ativo para o seu portfólio." />

      {/* Asset types */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 24px 0' }}>
        {ASSET_TYPES.map(a => {
          const on = selected.has(a.id);
          return (
            <button key={a.id} onClick={() => toggle(a.id)} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px',
              background: on ? 'var(--primary-container)' : 'var(--surface-lowest)',
              border: `2px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
              borderRadius: 'var(--radius-xl)', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: on ? 'var(--primary-strong)' : 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <span className={`material-symbols-outlined${on ? ' icf' : ''}`} style={{ fontSize: 24, color: on ? '#fff' : 'var(--on-surface-variant)' }}>{a.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: on ? 'var(--primary)' : 'var(--on-surface)' }}>{a.label}</div>
                <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>{a.desc}</div>
              </div>
              {on && <span className="material-symbols-outlined icf" style={{ fontSize: 22, color: 'var(--primary-strong)', flex: 'none' }}>check_circle</span>}
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div style={{ padding: '24px 24px 48px' }}>
        <button
          className="btn-primary"
          disabled={selected.size === 0}
          onClick={() => router.push('/auth/experience')}
          style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
