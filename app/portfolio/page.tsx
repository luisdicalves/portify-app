'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import Fab from '@/components/ui/Fab';
import TransactionCard, { Transaction } from '@/components/ui/TransactionCard';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchQuote(ticker: string): Promise<{ price: number; change: number } | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.price !== 'number') return null;
    return { price: data.price, change: typeof data.change === 'number' ? data.change : 0 };
  } catch {
    return null;
  }
}

type Asset = {
  ticker: string;
  letter: string;
  units: number;
  value: number;
  cost: number;
  dayChange: number;
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
  const [dividends, setDividends] = useState<{ ticker: string; letter: string; amount: number; executed_at: string }[]>([]);
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);
  const [sellPickerOpen, setSellPickerOpen] = useState(false);

  async function fetchHoldings() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: holdings } = await supabase
      .from('holdings')
      .select('ticker, units, avg_price')
      .eq('user_id', user.id);

    const quotes = await Promise.all((holdings ?? []).map(h => fetchQuote(h.ticker)));

    const mapped: Asset[] = (holdings ?? []).map((h, i) => {
      const quote = quotes[i];
      const price = quote?.price ?? h.avg_price;
      const gainPct = h.avg_price > 0 ? (price - h.avg_price) / h.avg_price : 0;
      return {
        ticker: h.ticker,
        letter: h.ticker.charAt(0),
        units: h.units,
        value: h.units * price,
        cost: h.units * h.avg_price,
        dayChange: h.units * (quote?.change ?? 0),
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

    const divs = (data ?? [])
      .filter(row => row.type === 'dividend')
      .map(row => ({ ticker: row.ticker, letter: row.ticker.charAt(0), amount: row.amount, executed_at: row.executed_at }));
    setDividends(divs);
  }

  async function deleteTransaction(id: string) {
    const supabase = createClient();
    await supabase.from('transactions').delete().eq('id', id);
    setTxns(prev => prev.filter(tx => tx.id !== id));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  useEffect(() => { fetchHoldings(); fetchTransactions(); }, []);

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);
  const totalInvested = assets.reduce((sum, a) => sum + a.cost, 0);
  const totalReturn = totalValue - totalInvested;
  const dayChangeValue = assets.reduce((sum, a) => sum + a.dayChange, 0);
  const dayChangeBase = totalValue - dayChangeValue;
  const dayChangePct = dayChangeBase > 0 ? (dayChangeValue / dayChangeBase) * 100 : 0;
  const dayGain = dayChangeValue >= 0;

  const totalDividends = dividends.reduce((sum, d) => sum + d.amount, 0);
  const dividends12mo = dividends
    .filter(d => Date.now() - new Date(d.executed_at).getTime() < 365 * 86400000)
    .reduce((sum, d) => sum + d.amount, 0);
  const dividendYieldPct = totalValue > 0 ? (dividends12mo / totalValue) * 100 : 0;

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Portfólio</span>
        <span onClick={() => router.push('/portfolio/add')} className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>search</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Cartão de Portfólio */}
        <div style={{ background: 'var(--primary-strong)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', color: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8 }}>{t.totalValue}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{eur.format(totalValue)} €</span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.18)', padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: 14, fontWeight: 600, marginTop: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{dayGain ? 'trending_up' : 'trending_down'}</span>
            {dayGain ? '+' : ''}{dayChangePct.toFixed(2)}% · {t.dayChange}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{t.investedLabel}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{eur.format(totalInvested)} €</div>
            </div>
            <div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{t.returnLabel}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{totalReturn >= 0 ? '+' : ''}{eur.format(totalReturn)} €</div>
            </div>
          </div>
        </div>

        {/* Posições / Dividendos / Histórico */}
        <div style={{ display: 'flex', background: 'var(--surface-container)', borderRadius: 'var(--radius-full)', padding: 4 }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
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

        {/* Dividendos tab */}
        {tab === 'dividends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--primary-strong)', borderRadius: 'var(--radius-lg)', padding: 16, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recebido (12 meses)</div>
                <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{eur.format(dividends12mo)} €</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Yield</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{dividendYieldPct.toFixed(1)}%</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>Próximos</div>
              <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                Sem dados de dividendos futuros disponíveis.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>Recebidos</div>
              {dividends.length === 0 ? (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                  Sem dividendos recebidos.
                </div>
              ) : (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  {dividends.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < dividends.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{d.letter}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{d.ticker}</div>
                        <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                          {new Date(d.executed_at).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+{eur.format(d.amount)} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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

      <Fab actions={[
        { icon: 'add', label: 'Comprar', color: 'var(--gain)', onClick: () => router.push('/portfolio/add') },
        {
          icon: 'remove', label: 'Vender', color: 'var(--loss)',
          onClick: () => { if (assets.length > 0) setSellPickerOpen(true); },
        },
      ]} />

      {sellPickerOpen && (
        <div onClick={() => setSellPickerOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 30 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: '20px 20px 0 0', padding: '20px 16px 34px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70%', overflow: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Vender ativo</div>
            {assets.map(a => (
              <div key={a.ticker} onClick={() => { setSellPickerOpen(false); router.push(`/portfolio/${a.ticker}?action=sell`); }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--surface-container)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                  {a.letter}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{a.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} ações</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{eur.format(a.value)} €</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
