'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';

const ASSETS = [
  { ticker: 'AAPL', name: 'Apple Inc.', units: 42, avgPrice: '€ 152,40', value: '€ 24.342,80', gain: '+€ 3.841,60', gainPct: '+18,7%', positive: true },
  { ticker: 'MSFT', name: 'Microsoft Corp.', units: 18, avgPrice: '€ 890,00', value: '€ 18.120,00', gain: '+€ 1.120,00', gainPct: '+6,6%', positive: true },
  { ticker: 'TSLA', name: 'Tesla Inc.', units: 24, avgPrice: '€ 300,00', value: '€ 6.540,00', gain: '-€ 660,00', gainPct: '-9,2%', positive: false },
  { ticker: 'NVDA', name: 'Nvidia Corp.', units: 10, avgPrice: '€ 420,00', value: '€ 8.760,00', gain: '+€ 4.560,00', gainPct: '+108,6%', positive: true },
];

export default function PortfolioPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [tab, setTab] = useState<'positions' | 'dividends' | 'history'>('positions');

  const tabs = [
    { id: 'positions', label: t.positions },
    { id: 'dividends', label: t.dividends },
    { id: 'history', label: t.history },
  ] as const;

  return (
    <div className="phone-shell">
      {/* Header */}
      <div className="top-bar" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)' }}>
            {lang === 'pt' ? 'Portfólio' : 'Portfolio'}
          </div>
          <button onClick={() => router.push('/portfolio/add')} style={{
            background: 'var(--primary-strong)', border: 'none', borderRadius: 'var(--radius-full)',
            width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: '#fff' }}>add</span>
          </button>
        </div>

        {/* Summary row */}
        <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
          <div><div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{lang === 'pt' ? 'Investido' : 'Invested'}</div><div style={{ fontSize: 16, fontWeight: 700 }}>€ 44.480,00</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{t.totalGain}</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gain)' }}>+€ 8.360,00</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{lang === 'pt' ? 'Retorno' : 'Return'}</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gain)' }}>+18,8%</div></div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 16, background: 'var(--surface-high)', borderRadius: 'var(--radius-full)', padding: 3 }}>
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              padding: '7px 16px', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: tab === tb.id ? 'var(--surface-lowest)' : 'transparent',
              color: tab === tb.id ? 'var(--primary-strong)' : 'var(--on-surface-variant)',
              boxShadow: tab === tb.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s',
            }}>{tb.label}</button>
          ))}
        </div>
      </div>

      <div className="screen-content">
        {tab === 'positions' && (
          <div style={{ background: 'var(--surface-lowest)', margin: '16px 20px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
            {ASSETS.map((a, i) => (
              <div key={a.ticker} className="list-row" style={i === ASSETS.length - 1 ? { borderBottom: 'none' } : {}}>
                <div className="asset-icon">{a.ticker.slice(0, 2)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{a.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} {t.units} · {t.avgPrice} {a.avgPrice}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{a.value}</div>
                  <div style={{ fontSize: 12, color: a.positive ? 'var(--gain)' : 'var(--loss)', fontWeight: 600, marginTop: 2 }}>{a.gainPct}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'dividends' && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12, opacity: 0.4 }}>payments</span>
            {lang === 'pt' ? 'Próximo dividendo: MSFT · 15 Jul' : 'Next dividend: MSFT · 15 Jul'}
          </div>
        )}

        {tab === 'history' && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: 'arrow_downward', label: lang === 'pt' ? 'Dividendo recebido' : 'Dividend received', sub: 'MSFT', amount: '+€ 42,80', date: lang === 'pt' ? 'Hoje, 14:32' : 'Today, 14:32', gain: true },
              { icon: 'shopping_cart', label: lang === 'pt' ? 'Compra' : 'Buy', sub: 'AAPL · 5 ações', amount: '-€ 880,00', date: lang === 'pt' ? 'Ontem, 09:15' : 'Yesterday, 09:15', gain: false },
              { icon: 'sell', label: lang === 'pt' ? 'Venda' : 'Sell', sub: 'TSLA · 2 ações', amount: '+€ 510,00', date: lang === 'pt' ? 'Há 3 dias' : '3 days ago', gain: true },
            ].map((tx, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--card-border)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: tx.gain ? 'var(--gain-container)' : 'var(--loss-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: tx.gain ? 'var(--gain)' : 'var(--loss)' }}>{tx.icon}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>{tx.sub} · {tx.date}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: tx.gain ? 'var(--gain)' : 'var(--on-surface)' }}>{tx.amount}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
    </div>
  );
}
