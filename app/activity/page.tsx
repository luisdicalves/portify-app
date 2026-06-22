'use client';

import { useApp } from '@/lib/context';
import BottomNav from '@/components/ui/BottomNav';

const TXS = [
  { group: 'Hoje', items: [
    { icon: 'arrow_downward', label: 'Dividendo recebido', sub: 'MSFT · 0,82 € por ação', amount: '+€ 42,80', date: '14:32', gain: true },
  ]},
  { group: 'Ontem', items: [
    { icon: 'shopping_cart', label: 'Compra', sub: 'AAPL · 5 ações @ € 176,00', amount: '-€ 880,00', date: '09:15', gain: false },
    { icon: 'shopping_cart', label: 'Compra', sub: 'NVDA · 2 ações @ € 420,00', amount: '-€ 840,00', date: '08:42', gain: false },
  ]},
  { group: 'Há 3 dias', items: [
    { icon: 'sell', label: 'Venda', sub: 'TSLA · 2 ações @ € 255,00', amount: '+€ 510,00', date: '11:05', gain: true },
  ]},
];

const TXS_EN = [
  { group: 'Today', items: [
    { icon: 'arrow_downward', label: 'Dividend received', sub: 'MSFT · € 0.82 per share', amount: '+€ 42.80', date: '14:32', gain: true },
  ]},
  { group: 'Yesterday', items: [
    { icon: 'shopping_cart', label: 'Buy', sub: 'AAPL · 5 shares @ € 176.00', amount: '-€ 880.00', date: '09:15', gain: false },
    { icon: 'shopping_cart', label: 'Buy', sub: 'NVDA · 2 shares @ € 420.00', amount: '-€ 840.00', date: '08:42', gain: false },
  ]},
  { group: '3 days ago', items: [
    { icon: 'sell', label: 'Sell', sub: 'TSLA · 2 shares @ € 255.00', amount: '+€ 510.00', date: '11:05', gain: true },
  ]},
];

export default function ActivityPage() {
  const { lang } = useApp();
  const txs = lang === 'pt' ? TXS : TXS_EN;

  return (
    <div className="phone-shell">
      <div className="top-bar">
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)' }}>
          {lang === 'pt' ? 'Movimentos' : 'Activity'}
        </div>
        <button style={{ background: 'var(--surface-high)', border: 'none', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>filter_list</span>
          {lang === 'pt' ? 'Filtrar' : 'Filter'}
        </button>
      </div>

      <div className="screen-content">
        {txs.map(group => (
          <div key={group.group}>
            <div className="section-header">{group.group}</div>
            <div style={{ background: 'var(--surface-lowest)', borderRadius: 'var(--radius-xl)', margin: '0 20px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
              {group.items.map((tx, i) => (
                <div key={i} className="list-row" style={i === group.items.length - 1 ? { borderBottom: 'none' } : {}}>
                  <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: tx.gain ? 'var(--gain-container)' : 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: tx.gain ? 'var(--gain)' : 'var(--on-surface-variant)' }}>{tx.icon}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>{tx.sub} · {tx.date}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: tx.gain ? 'var(--gain)' : 'var(--on-surface)' }}>{tx.amount}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
    </div>
  );
}
