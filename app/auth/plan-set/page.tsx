'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const GOALS = ['Independência financeira', 'Reforma', 'Habitação', 'Educação', 'Outro'];
const FREQUENCIES = ['Semanal', 'Mensal', 'Trimestral', 'Anual'];
const HORIZONS = [1, 2, 3, 5, 10, 15, 20, 30];
const AMOUNTS = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000];

export default function PlanSetPage() {
  const router = useRouter();
  const [goal, setGoal] = useState(0);
  const [freq, setFreq] = useState(1);
  const [horizon, setHorizon] = useState(4);
  const [amount, setAmount] = useState(3);

  return (
    <div className="phone-shell">
      <div style={{ padding: '20px 24px 0' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)' }}>arrow_back_ios_new</span>
        </button>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Define o teu plano</div>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 4 }}>Podes alterar estes valores em qualquer altura.</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Goal */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 10 }}>Objetivo financeiro</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GOALS.map((g, i) => (
              <button key={i} onClick={() => setGoal(i)} style={{
                padding: '8px 16px', borderRadius: 'var(--radius-full)', border: `1.5px solid ${i === goal ? 'var(--primary-strong)' : 'var(--outline-variant)'}`,
                background: i === goal ? 'var(--primary-container)' : 'transparent',
                color: i === goal ? 'var(--primary)' : 'var(--on-surface-variant)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>{g}</button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 10 }}>
            Investimento por período · <span style={{ color: 'var(--primary-strong)', fontSize: 16 }}>€ {AMOUNTS[amount]}</span>
          </div>
          <input type="range" min={0} max={AMOUNTS.length - 1} value={amount} onChange={e => setAmount(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--primary-strong)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--outline)', marginTop: 4 }}>
            <span>€ 50</span><span>€ 2.000</span>
          </div>
        </div>

        {/* Frequency */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 10 }}>Periodicidade</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {FREQUENCIES.map((f, i) => (
              <button key={i} onClick={() => setFreq(i)} style={{
                flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${i === freq ? 'var(--primary-strong)' : 'var(--outline-variant)'}`,
                background: i === freq ? 'var(--primary-container)' : 'transparent',
                color: i === freq ? 'var(--primary)' : 'var(--on-surface-variant)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{f}</button>
            ))}
          </div>
        </div>

        {/* Horizon */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 10 }}>
            Horizonte temporal · <span style={{ color: 'var(--primary-strong)', fontSize: 16 }}>{HORIZONS[horizon]} anos</span>
          </div>
          <input type="range" min={0} max={HORIZONS.length - 1} value={horizon} onChange={e => setHorizon(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--primary-strong)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--outline)', marginTop: 4 }}>
            <span>1 ano</span><span>30 anos</span>
          </div>
        </div>

        {/* Projection */}
        <div style={{ background: 'var(--primary-container)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700, marginBottom: 4 }}>PROJEÇÃO ESTIMADA</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>
            € {Math.round(AMOUNTS[amount] * 52 * HORIZONS[horizon] * 1.05 / 1000)}k – € {Math.round(AMOUNTS[amount] * 52 * HORIZONS[horizon] * 1.07 / 1000)}k
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>CAGR estimado entre 5% e 7%</div>
        </div>
      </div>

      <div style={{ padding: '24px 24px 48px' }}>
        <button className="btn-primary" onClick={() => router.push('/auth/summary')}>Ver resumo</button>
      </div>
    </div>
  );
}
