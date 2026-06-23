'use client';

import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';

const ASSETS = [
  { ticker: 'AAPL', letter: 'A', units: 42, value: '7.956,90 €', gainPct: '+15,20%', gain: true },
  { ticker: 'MSFT', letter: 'M', units: 15, value: '6.226,50 €', gainPct: '+8,45%',  gain: true },
  { ticker: 'TSLA', letter: 'T', units: 35, value: '8.493,00 €', gainPct: '-4,12%',  gain: false },
];

export default function PortfolioPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Portfólio</span>
        <button onClick={() => router.push('/portfolio/add')} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary-strong)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Total value */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Valor estimado</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>142.850,42 €</div>
        </div>

        {/* Asset cards */}
        {ASSETS.map(a => (
          <div key={a.ticker} onClick={() => router.push(`/portfolio/${a.ticker}`)} style={{ cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {a.letter}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{a.ticker}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} ações</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{a.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: a.gain ? 'var(--gain)' : 'var(--loss)' }}>{a.gainPct}</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>chevron_right</span>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
