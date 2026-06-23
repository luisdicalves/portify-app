'use client';

import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="material-symbols-outlined icf" style={{ fontSize: 30, color: 'var(--primary)' }}>account_circle</span>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Bem-vindo de volta</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.01em' }}>Luís</div>
          </div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)' }}>notifications</span>
      </div>

      {/* Scroll content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Portfolio value */}
        <div onClick={() => router.push('/dashboard/net-worth')} style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Valor total do portfólio</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>€ 142.580,42</span>
            <span style={{ color: 'var(--gain)', fontSize: 13, fontWeight: 600 }}>+2,45%</span>
          </div>
        </div>

        {/* Performance chart */}
        <div onClick={() => router.push('/dashboard/performance')} style={{ cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <svg viewBox="0 0 320 96" style={{ width: '100%', height: 88, display: 'block' }}>
            <defs>
              <linearGradient id="pHomeG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,76 Q40,70 70,72 T140,44 T210,54 T270,16 T320,28 L320,96 L0,96 Z" fill="url(#pHomeG)" />
            <path d="M0,76 Q40,70 70,72 T140,44 T210,54 T270,16 T320,28" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Stat cards row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div onClick={() => router.push('/dashboard/net-worth')} style={{ flex: 1, cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>savings</span>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>Património líquido</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>131.4k €</div>
          </div>
          <div onClick={() => router.push('/dashboard/performance')} style={{ flex: 1, cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--gain)' }}>trending_up</span>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>Retorno total</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+12,4%</div>
          </div>
        </div>

        {/* Daily performance */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Destaques do dia</div>

          <div onClick={() => router.push('/portfolio/NVDA')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--gain-container)', borderRadius: 'var(--radius-md)', padding: '9px 11px', marginBottom: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: 'var(--gain)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined icf" style={{ fontSize: 18, color: 'var(--bg)' }}>arrow_upward</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>NVDA</div>
                <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>NVIDIA Corp</div>
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+4,28%</span>
          </div>

          <div onClick={() => router.push('/portfolio/TSLA')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--loss-container)', borderRadius: 'var(--radius-md)', padding: '9px 11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: 'var(--loss)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined icf" style={{ fontSize: 18, color: 'var(--bg)' }}>arrow_downward</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>TSLA</div>
                <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Tesla, Inc.</div>
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>-1,92%</span>
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}
