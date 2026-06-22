'use client';

import { useRouter } from 'next/navigation';

const ROWS = [
  { label: 'Experiência', value: 'Iniciante', icon: 'school' },
  { label: 'Perfil de risco', value: 'Conservador', icon: 'shield' },
  { label: 'Objetivo', value: 'Independência financeira', icon: 'flag' },
  { label: 'Ativos', value: 'Ações, ETFs', icon: 'candlestick_chart' },
  { label: 'Investimento', value: '€ 100 · Mensal', icon: 'payments' },
  { label: 'Horizonte', value: '10 anos', icon: 'hourglass_bottom' },
];

export default function SummaryPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '40px 24px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gain-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 40, color: 'var(--gain)' }}>check_circle</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Tudo pronto!</div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 8, lineHeight: 1.5 }}>
            O teu perfil está configurado. Aqui está o resumo.
          </div>
        </div>

        {/* Summary card */}
        <div style={{ margin: '0 24px', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
          {ROWS.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < ROWS.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>{r.icon}</span>
              </div>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--on-surface-variant)' }}>{r.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Projection */}
        <div style={{ margin: '16px 24px 0', padding: '20px', background: 'var(--primary-strong)', borderRadius: 'var(--radius-xl)', color: '#fff' }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 600, marginBottom: 4 }}>PROJEÇÃO A 10 ANOS</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>€ 15k – € 18k</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>Estimativa com CAGR entre 4% e 6%</div>
        </div>
      </div>

      <div style={{ padding: '24px 24px 48px' }}>
        <button className="btn-primary" style={{ fontSize: 16 }} onClick={() => router.push('/dashboard')}>
          Finalizar e entrar
        </button>
      </div>
    </div>
  );
}
