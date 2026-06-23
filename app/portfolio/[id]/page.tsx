'use client';

import { useRouter } from 'next/navigation';

export default function AssetDetailPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>AAPL</span>
        <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Apple Inc.</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>189,45 €</span>
          <span style={{ color: 'var(--gain)', fontSize: 14, fontWeight: 600 }}>+15,20%</span>
        </div>

        {/* Chart */}
        <svg viewBox="0 0 320 110" style={{ width: '100%', height: 100, display: 'block' }}>
          <defs>
            <linearGradient id="pDetG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gain)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--gain)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,88 Q40,84 70,80 T140,52 T210,60 T270,24 T320,30 L320,110 L0,110 Z" fill="url(#pDetG)" />
          <path d="M0,88 Q40,84 70,80 T140,52 T210,60 T270,24 T320,30" fill="none" stroke="var(--gain)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        {/* Stats */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 12 }}>Estatísticas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['Abertura','186,20'],['Volume','48,2M'],['Máx. dia','190,10'],['Mín. dia','185,80']].map(([l,v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{l}</span>
                <b style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{v}</b>
              </div>
            ))}
          </div>
        </div>

        {/* About */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>Sobre</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Apple Inc. projeta, fabrica e comercializa smartphones, computadores pessoais, tablets, wearables e acessórios, além de serviços de software.
          </div>
        </div>
      </div>

      {/* Buy / Sell buttons */}
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, display: 'flex', gap: 10 }}>
        <button onClick={() => router.push('/portfolio/buy')}
          style={{ flex: 1, background: 'var(--gain-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Comprar
        </button>
        <button onClick={() => router.push('/portfolio/sell')}
          style={{ flex: 1, background: 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Vender
        </button>
      </div>
    </div>
  );
}
