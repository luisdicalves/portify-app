'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import TransactionCard, { Transaction } from '@/components/ui/TransactionCard';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.price === 'number' ? data.price : null;
  } catch {
    return null;
  }
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

export default function PortfolioPage() {
  const router = useRouter();
  const { lang } = useApp();
  const t = useDict(lang);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof TABS[number]['id']>('positions');
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);

  async function fetchHoldings() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: holdings } = await supabase
      .from('holdings')
      .select('ticker, units, avg_price')
      .eq('user_id', user.id);

    const prices = await Promise.all((holdings ?? []).map(h => fetchCurrentPrice(h.ticker)));

    const mapped: Asset[] = (holdings ?? []).map((h, i) => {
      const price = prices[i] ?? h.avg_price;
      const gainPct = h.avg_price > 0 ? (price - h.avg_price) / h.avg_price : 0;
      return {
        ticker: h.ticker,
        letter: h.ticker.charAt(0),
        units: h.units,
        value: h.units * price,
        gainPct,
        gain: gainPct >= 0,
      };
    });

    setAssets(mapped);
    setLoading(false);
  }

  async function fetchTransactions() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('transactions')
      .select('id, ticker, type, units, price, amount, executed_at')
      .eq('user_id', user.id)
      .order('executed_at', { ascending: false });

    const mapped: Transaction[] = (data ?? []).map(row => {
      const gain = row.type === 'buy' ? false : row.amount >= 0;
      return {
        id: row.id,
        sym: row.ticker,
        avatar: row.ticker.charAt(0),
        type: row.type as Transaction['type'],
        dateText: new Date(row.executed_at).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        total: `${gain ? '+' : '-'}${eur.format(Math.abs(row.amount))} €`,
        totalColor: gain ? 'var(--gain)' : 'var(--on-surface)',
        units: row.units != null ? String(row.units) : undefined,
        unitVal: row.price != null ? `${eur.format(row.price)} €` : undefined,
      };
    });
    setTxns(mapped);
  }

  async function deleteTransaction(id: string) {
    const supabase = createClient();
    await supabase.from('transactions').delete().eq('id', id);
    setTxns(prev => prev.filter(tx => tx.id !== id));
  }

  useEffect(() => { fetchHoldings(); fetchTransactions(); }, []);

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
        <span onClick={() => router.push('/portfolio/add')} className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>search</span>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {txns.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24 }}>{t.noTransactions}</div>
            )}
            {txns.map(tx => (
              <TransactionCard
                key={tx.id}
                tx={tx}
                expanded={openTxnId === tx.id}
                onToggle={() => setOpenTxnId(id => id === tx.id ? null : tx.id)}
                onDelete={() => deleteTransaction(tx.id)}
                labels={{ buy: t.txcBuy, sell: t.txcSell, dividend: t.txcDiv, units: t.txcUnits, unitVal: t.txcUnitVal, delete: t.txcDelete }}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
