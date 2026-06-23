'use client';

import { useRouter } from 'next/navigation';

const ROWS = [
  { label: 'Username',     value: '@investidor' },
  { label: 'Experiência',  value: 'Iniciante' },
  { label: 'Risco',        value: 'Moderado' },
  { label: 'Objetivo',     value: 'Longo prazo' },
  { label: 'Ativos',       value: 'Ações, ETFs' },
  { label: 'Investimento', value: '250 €/Mensal' },
  { label: 'Horizonte',    value: '5 – 10 anos' },
];

export default function SummaryPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'auto', padding: '14px 20px 24px' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6, marginTop: 8 }}>
        Tudo pronto! 🎉
      </div>

      {/* Projection */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', textWrap: 'pretty' as never, marginBottom: 12, textAlign: 'center' }}>
          Com <b style={{ color: 'var(--on-surface)' }}>250 €/Mensal</b> durante <b style={{ color: 'var(--on-surface)' }}>5 – 10 anos</b>, podes atingir
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
          110 032 € – 138 612 €
        </div>
        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 8, marginBottom: 18 }}>
          Estimativa com CAGR entre 5% e 7%
        </div>
      </div>

      {/* Summary card */}
      <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: '6px 16px', marginBottom: 18 }}>
        {ROWS.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < ROWS.length - 1 ? '1px solid var(--gain)' : 'none' }}>
            <span style={{ fontSize: 14, color: 'var(--gain-strong)' }}>{r.label}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.value}</span>
          </div>
        ))}
      </div>

      <button onClick={() => router.push('/dashboard')}
        style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Finalizar e entrar
      </button>
    </div>
  );
}
