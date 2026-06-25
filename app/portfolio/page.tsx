'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import Fab from '@/components/ui/Fab';
import { createClient } from '@/lib/supabase/client';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sem feed de preços de mercado: simula um ganho estável (não aleatório a cada render) a partir do ticker.
function simulatedGainPct(ticker: string) {
  const hash = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ((hash % 41) - 15) / 100; // entre -15% e +25%
}

type Asset = {
  ticker: string;
  letter: string;
  units: number;
  value: number;
  gainPct: number;
  gain: boolean;
};

const TABS = [
  { id: 'positions', label: 'Posições' },
  { id: 'dividends', label: 'Dividendos' },
  { id: 'history', label: 'Histórico' },
] as const;

const HISTORY = [
  { icon: 'payments', bg: 'var(--gain-container)', color: 'var(--gain)', label: 'Dividendo recebido', date: 'Hoje', amount: '+128,40 €', amountColor: 'var(--gain)' },
  { icon: 'arrow_downward', bg: 'var(--primary-container)', color: 'var(--primary)', label: 'Compra · AAPL', date: 'Ontem', amount: '-1.894,50 €', amountColor: 'var(--on-surface)' },
  { icon: 'arrow_upward', bg: 'var(--loss-container)', color: 'var(--loss)', label: 'Venda · TSLA', date: 'Há 3 dias', amount: '+2.380,00 €', amountColor: 'var(--on-surface)' },
];

export default function PortfolioPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof TABS[number]['id']>('positions');

  async function fetchHoldings() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: holdings } = await supabase
      .from('holdings')
      .select('ticker, units, avg_price')
      .eq('user_id', user.id);

    const mapped: Asset[] = (holdings ?? []).map(h => {
      const gainPct = simulatedGainPct(h.ticker);
      const cost = h.units * h.avg_price;
      return {
        ticker: h.ticker,
        letter: h.ticker.charAt(0),
        units: h.units,
        value: cost * (1 + gainPct),
        gainPct,
        gain: gainPct >= 0,
      };
    });

    setAssets(mapped);
    setLoading(false);
  }

  useEffect(() => { fetchHoldings(); }, []);

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);

  function selectTab(id: typeof TABS[number]['id']) {
    if (id === 'dividends') { router.push('/activity'); return; }
    setTab(id);
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Portfólio</span>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)' }}>search</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Total value */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Valor estimado</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{eur.format(totalValue)} €</div>
        </div>

        {/* Posições / Dividendos / Histórico */}
        <div style={{ display: 'flex', background: 'var(--surface-container)', borderRadius: 'var(--radius-full)', padding: 4 }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => selectTab(tb.id)} style={{
              flex: 1, padding: '8px 0', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              background: tab === tb.id ? 'var(--surface-lowest)' : 'transparent',
              color: tab === tb.id ? 'var(--primary)' : 'var(--on-surface-variant)',
              boxShadow: tab === tb.id ? '0 1px 3px rgba(0,0,0,0.14)' : 'none',
            }}>{tb.label}</button>
          ))}
        </div>

        {/* Posições tab */}
        {tab === 'positions' && (
          <>
            {loading && <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24 }}>A carregar...</div>}
            {!loading && assets.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24 }}>Sem posições registadas.</div>
            )}
            {assets.map(a => (
              <div key={a.ticker} onClick={() => router.push(`/portfolio/${a.ticker}`)} style={{ cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {a.letter}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{a.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} ações</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{eur.format(a.value)} €</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: a.gain ? 'var(--gain)' : 'var(--loss)' }}>{a.gain ? '+' : ''}{(a.gainPct * 100).toFixed(2)}%</div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>chevron_right</span>
              </div>
            ))}
          </>
        )}

        {/* Histórico tab */}
        {tab === 'history' && (
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {HISTORY.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < HISTORY.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: h.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: h.color }}>{h.icon}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{h.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{h.date}</div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: h.amountColor, fontVariantNumeric: 'tabular-nums' }}>{h.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Fab actions={[
        { icon: 'trending_down', label: 'Vender', onClick: () => router.push('/portfolio/sell'), color: 'var(--loss)' },
        { icon: 'add', label: 'Adicionar', onClick: () => router.push('/portfolio/add'), color: 'var(--gain)' },
      ]} />

      <BottomNav />
    </div>
  );
}
