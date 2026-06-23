'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TIMEFRAMES = ['1S','1M','3M','6M','1A','Max'];

export default function PerformancePage() {
  const router = useRouter();
  const [tf, setTf] = useState(4);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Performance</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* KPI row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Retorno total</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+15.780 €</div>
          </div>
          <div style={{ flex: 1, background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Anualizado</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+8,9%</div>
          </div>
        </div>

        {/* Chart card */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          {/* Timeframe pills */}
          <div style={{ display: 'flex', background: 'var(--surface-container)', borderRadius: 'var(--radius-full)', padding: 3, marginBottom: 12 }}>
            {TIMEFRAMES.map((t, i) => (
              <button key={t} onClick={() => setTf(i)} style={{
                flex: 1, padding: '6px 0', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: tf === i ? 'var(--surface-lowest)' : 'transparent',
                color: tf === i ? 'var(--primary)' : 'var(--on-surface-variant)',
                boxShadow: tf === i ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{t}</button>
            ))}
          </div>

          <svg viewBox="0 0 320 120" style={{ width: '100%', height: 110, display: 'block' }}>
            <defs>
              <linearGradient id="pPerfG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gain)" stopOpacity="0.26" />
                <stop offset="100%" stopColor="var(--gain)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,96 Q50,90 90,84 T170,58 T240,66 T320,18 L320,120 L0,120 Z" fill="url(#pPerfG)" />
            <path d="M0,96 Q50,90 90,84 T170,58 T240,66 T320,18" fill="none" stroke="var(--gain)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Best / Worst */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: '1px solid var(--hairline)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--gain)' }}>trending_up</span>
              Melhor ativo
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>NVDA <span style={{ color: 'var(--gain)' }}>+42%</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--loss)' }}>trending_down</span>
              Pior ativo
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>TSLA <span style={{ color: 'var(--loss)' }}>-12%</span></span>
          </div>
        </div>

      </div>
    </div>
  );
}
