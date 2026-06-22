'use client';

import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';

const SECTORS = [
  { label: 'tech', pct: 48, color: '#0052cc' },
  { label: 'health', pct: 22, color: '#047a3d' },
  { label: 'energy', pct: 18, color: '#f59e0b' },
  { label: 'others', pct: 12, color: '#8d90a0' },
];

const HOLDINGS = [
  { ticker: 'AAPL', name: 'Apple Inc.', value: '€ 24.342,80', change: '+2,14%', gain: true },
  { ticker: 'MSFT', name: 'Microsoft Corp.', value: '€ 18.120,00', change: '+0,87%', gain: true },
  { ticker: 'TSLA', name: 'Tesla Inc.', value: '€ 6.540,00', change: '-1,23%', gain: false },
];

export default function DashboardPage() {
  const { lang, theme, toggleTheme } = useApp();
  const t = useDict(lang);

  return (
    <div className="phone-shell">
      {/* Top bar */}
      <div className="top-bar">
        <div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', fontWeight: 500 }}>{new Date().toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t.greeting}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={toggleTheme} style={{ background: 'var(--surface-high)', border: 'none', borderRadius: 'var(--radius-full)', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
          </button>
          <button style={{ background: 'var(--surface-high)', border: 'none', borderRadius: 'var(--radius-full)', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>notifications</span>
            <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--loss)', border: '2px solid var(--bg)' }} />
          </button>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--primary-strong)' }}>R</div>
        </div>
      </div>

      <div className="screen-content">
        {/* Portfolio value card */}
        <div style={{ margin: '20px 20px 0', padding: 24, background: 'var(--primary-strong)', borderRadius: 'var(--radius-2xl)', color: '#fff', boxShadow: '0 8px 32px rgba(0,82,204,0.35)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.75, marginBottom: 6 }}>{t.totalValue}</div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>€ 52.840,60</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 'var(--radius-full)', padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_upward</span>+€ 624,30 · +1,20%
            </span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{t.dailyPerf}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div><div style={{ fontSize: 11, opacity: 0.65 }}>{t.assets}</div><div style={{ fontSize: 15, fontWeight: 700 }}>12</div></div>
            <div><div style={{ fontSize: 11, opacity: 0.65 }}>{t.totalGain}</div><div style={{ fontSize: 15, fontWeight: 700 }}>+12,4%</div></div>
            <div><div style={{ fontSize: 11, opacity: 0.65 }}>{lang === 'pt' ? 'Desde início' : 'Since start'}</div><div style={{ fontSize: 15, fontWeight: 700 }}>2018</div></div>
          </div>
        </div>

        {/* Allocation */}
        <div style={{ margin: '20px 20px 0', padding: 20, background: 'var(--surface-lowest)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--card-border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{t.allocation}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SECTORS.map(s => (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{t[s.label as keyof typeof t] as string}</span>
                  <span style={{ fontWeight: 700, color: s.color }}>{s.pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${s.pct}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top holdings */}
        <div style={{ margin: '20px 0 0' }}>
          <div className="section-header">{lang === 'pt' ? 'Principais Posições' : 'Top Holdings'}</div>
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-xl)', margin: '0 20px', overflow: 'hidden' }}>
            {HOLDINGS.map((h, i) => (
              <div key={h.ticker} className="list-row" style={i === HOLDINGS.length - 1 ? { borderBottom: 'none' } : {}}>
                <div className="asset-icon">{h.ticker.slice(0, 2)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{h.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>{h.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{h.value}</div>
                  <div className={`stat-chip ${h.gain ? 'gain' : 'loss'}`} style={{ marginTop: 3, justifyContent: 'flex-end' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{h.gain ? 'arrow_upward' : 'arrow_downward'}</span>
                    {h.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* News card */}
        <div style={{ margin: '20px 20px 0', padding: 20, background: 'var(--surface-lowest)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--card-border)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--primary)', marginBottom: 8 }}>{t.markets}</div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>{t.newsTitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>{t.readMore}
          </div>
        </div>

        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
    </div>
  );
}
