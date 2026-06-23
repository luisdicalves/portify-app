'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';

const ASSETS = [
  { ticker: 'AAPL', name: 'Apple Inc.',      price: '189,45 €', letter: 'A' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.',     price: '875,30 €', letter: 'N' },
  { ticker: 'MSFT', name: 'Microsoft Corp.',  price: '415,20 €', letter: 'M' },
  { ticker: 'TSLA', name: 'Tesla Inc.',       price: '242,80 €', letter: 'T' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.',  price: '182,60 €', letter: 'A' },
];

export default function AddAssetPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const filtered = ASSETS.filter(a =>
    a.ticker.includes(q.toUpperCase()) || a.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Adicionar ativo</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 13px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>search</span>
          <input placeholder="Pesquisar ativo..." value={q} onChange={e => setQ(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'inherit' }} />
        </div>

        {filtered.map(a => (
          <div key={a.ticker} onClick={() => router.push(`/portfolio/${a.ticker.toLowerCase()}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
              {a.letter}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{a.ticker}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.name}</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{a.price}</span>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
