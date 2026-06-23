'use client';

import BottomNav from '@/components/ui/BottomNav';

export default function ActivityPage() {
  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Dividendos</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary card */}
        <div style={{ background: 'var(--primary-strong)', borderRadius: 'var(--radius-lg)', padding: 16, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rendimento anual</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+1.284,40 €</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Yield</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>2,4%</div>
          </div>
        </div>

        {/* Upcoming */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>Próximos</div>
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {[
              { letter: 'A', ticker: 'AAPL', date: '15 Mai', amount: '+42,00 €' },
              { letter: 'M', ticker: 'MSFT', date: '22 Mai', amount: '+33,75 €' },
            ].map((d, i, arr) => (
              <div key={d.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < arr.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{d.letter}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{d.ticker}</div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Pagamento: {d.date}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>{d.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Received */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>Recebidos</div>
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', background: 'var(--gain-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--gain)' }}>payments</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Dividendo recebido</div>
                <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Hoje</div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+128,40 €</span>
            </div>
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}
