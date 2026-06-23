'use client';

import { useRouter } from 'next/navigation';

const ROWS = [
  { label: 'Investimentos',  value: '114.4k €', pct: 78, color: 'var(--primary)' },
  { label: 'Liquidez',       value: '22.0k €',  pct: 32, color: 'var(--gain)' },
  { label: 'Imobiliário',    value: '10.0k €',  pct: 18, color: 'var(--surface-highest)' },
  { label: 'Crédito',        value: '-15.0k €', pct: 24, color: 'var(--loss)', loss: true },
];

export default function NetWorthPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Património líquido</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary card */}
        <div style={{ background: 'var(--primary-strong)', borderRadius: 'var(--radius-lg)', padding: 18, color: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8 }}>Património líquido</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 4 }}>€ 131.430,00</div>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Total ativos</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+146.430 €</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Passivos</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>-15.000 €</div>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 14 }}>Distribuição</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {ROWS.map(r => (
              <div key={r.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: r.loss ? 'var(--loss)' : 'var(--on-surface)' }}>{r.label}</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', color: r.loss ? 'var(--loss)' : 'var(--on-surface)' }}>{r.value}</b>
                </div>
                <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-container)' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: 'var(--radius-full)', background: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
