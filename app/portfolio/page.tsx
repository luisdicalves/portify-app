'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import Fab from '@/components/ui/Fab';
import TradeDateDialog from '@/components/ui/TradeDateDialog';
import TransactionCard, { Transaction } from '@/components/ui/TransactionCard';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { buildCashFlowForecast } from '@/lib/cashFlowForecast';
import { fetchQuote, type Quote } from '@/lib/marketApi';
import { useUser } from '@/lib/hooks/useUser';
import { usePortfolioData } from '@/lib/hooks/usePortfolioData';
import { useTrade } from '@/lib/hooks/useTrade';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TAB_IDS = ['positions', 'dividends', 'history'] as const;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function PortfolioPage() {
  const router = useRouter();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);
  const { assets, loading, txns, dividends, cashSettings, removeTxn } = usePortfolioData(user?.id, lang);
  const [tab, setTab] = useState<typeof TAB_IDS[number]>('positions');
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);

  // ── Buy sheet ────────────────────────────────────────────────────────────────
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyInput, setBuyInput] = useState('');
  const [buyQuote, setBuyQuote] = useState<Quote | null>(null);
  const [buyQuoteState, setBuyQuoteState] = useState<'idle' | 'loading' | 'found' | 'error'>('idle');
  const buyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sell sheet ───────────────────────────────────────────────────────────────
  const [sellOpen, setSellOpen] = useState(false);
  const [sellTicker, setSellTicker] = useState('');

  // ── Shared form state ────────────────────────────────────────────────────────
  const [formShares, setFormShares] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDate, setFormDate] = useState(todayIso());
  const [formTime, setFormTime] = useState(nowTime());
  const [formError, setFormError] = useState('');
  const [dateDialogOpen, setDateDialogOpen] = useState(false);

  const { saving, confirmTrade } = useTrade();

  function resetForm() {
    setFormShares(''); setFormPrice(''); setFormDate(todayIso()); setFormTime(nowTime()); setFormError('');
  }

  function openBuy() {
    setBuyInput(''); setBuyQuote(null); setBuyQuoteState('idle'); resetForm(); setBuyOpen(true);
  }
  function closeBuy() { setBuyOpen(false); }

  function openSell() {
    setSellTicker(''); resetForm(); setSellOpen(true);
  }
  function closeSell() { setSellOpen(false); }

  useEffect(() => {
    const raw = buyInput.trim().toUpperCase();
    if (!raw) { setBuyQuote(null); setBuyQuoteState('idle'); return; }
    setBuyQuoteState('loading');
    if (buyDebounce.current) clearTimeout(buyDebounce.current);
    buyDebounce.current = setTimeout(async () => {
      const q = await fetchQuote(raw);
      if (q) { setBuyQuote(q); setBuyQuoteState('found'); }
      else { setBuyQuote(null); setBuyQuoteState('error'); }
    }, 600);
  }, [buyInput]);

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);
  const totalInvested = assets.reduce((sum, a) => sum + a.cost, 0);
  const totalReturn = totalValue - totalInvested;
  const dayChangeValue = assets.reduce((sum, a) => sum + a.dayChange, 0);
  const dayChangeBase = totalValue - dayChangeValue;
  const dayChangePct = dayChangeBase > 0 ? (dayChangeValue / dayChangeBase) * 100 : 0;
  const dayGain = dayChangeValue >= 0;

  const dividends12mo = dividends
    .filter(d => Date.now() - new Date(d.executed_at).getTime() < 365 * 86400000)
    .reduce((sum, d) => sum + d.amount, 0);
  const dividendYieldPct = totalValue > 0 ? (dividends12mo / totalValue) * 100 : 0;

  const forecast = buildCashFlowForecast(
    assets.map(a => ({ ticker: a.ticker, units: a.units })),
    dividends.map(d => ({ ticker: d.ticker, amount: d.amount, executed_at: d.executed_at })),
    cashSettings.uninvestedCash,
    cashSettings.freeFundsAnnualRatePct,
    { horizonMonths: 12 },
  );

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{t.navPort}</span>
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
          {TAB_IDS.map(id => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '8px 0', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              background: tab === id ? 'var(--surface-lowest)' : 'transparent',
              color: tab === id ? 'var(--primary)' : 'var(--on-surface-variant)',
              boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,0.14)' : 'none',
            }}>{t[id]}</button>
          ))}
        </div>

        {/* Posições tab */}
        {tab === 'positions' && (
          <>
            {loading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
            {!loading && assets.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24 }}>{t.noPositions}</div>
            )}
            {assets.map(a => (
              <div key={a.ticker} onClick={() => router.push(`/portfolio/${a.ticker}`)} style={{ cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {a.letter}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{a.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} {t.sharesUnit}</div>
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
                <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.dividendsReceived12mo}</div>
                <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{eur.format(dividends12mo)} €</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{t.yieldLabel}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{dividendYieldPct.toFixed(1)}%</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>{t.upcoming}</div>
              {(() => {
                const threeMonthsFromNow = new Date();
                threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
                const upcomingDividends = forecast.dividends.filter(d => new Date(d.expectedDate) <= threeMonthsFromNow);
                return upcomingDividends.length === 0 ? (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                  {t.noUpcomingDividends}
                </div>
              ) : (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  {upcomingDividends.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < upcomingDividends.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                        {d.ticker.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{d.ticker}</span>
                          {d.confidence === 'low' && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', color: 'var(--on-surface-variant)' }}>
                              {t.lowConfidence}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                          {new Date(d.expectedDate).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+{eur.format(d.netAmount)} €</div>
                        <div style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>{t.grossLabel} {eur.format(d.grossAmount)} €</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
              })()}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>{t.received}</div>
              {(() => {
                const grouped = Object.values(
                  dividends.reduce((acc, d) => {
                    if (!acc[d.ticker]) acc[d.ticker] = { ticker: d.ticker, letter: d.letter, total: 0, count: 0 };
                    acc[d.ticker].total += d.amount;
                    acc[d.ticker].count += 1;
                    return acc;
                  }, {} as Record<string, { ticker: string; letter: string; total: number; count: number }>)
                ).sort((a, b) => b.total - a.total);
                return grouped.length === 0 ? (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                  {t.noDividendsReceived}
                </div>
              ) : (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  {grouped.map((d, i) => (
                    <div key={d.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < grouped.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{d.letter}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{d.ticker}</div>
                        <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                          {d.count} {d.count === 1 ? (lang === 'pt' ? 'pagamento' : 'payment') : (lang === 'pt' ? 'pagamentos' : 'payments')}
                        </div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums' }}>+{eur.format(d.total)} €</span>
                    </div>
                  ))}
                </div>
              );
              })()}
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
                onDelete={() => removeTxn(tx.id)}
                labels={{
                  buy: t.txcBuy, sell: t.txcSell, dividend: t.txcDiv,
                  deposit: t.txcDeposit, interest: t.txcInterest,
                  withholdingTax: t.txcWht, interestTax: t.txcInterestTax,
                  units: t.txcUnits, unitVal: t.txcUnitVal, delete: t.txcDelete,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Fab actions={[
        { icon: 'add', label: t.buy, color: 'var(--gain)', onClick: openBuy },
        { icon: 'remove', label: t.sell, color: 'var(--loss)', onClick: openSell },
      ]} />

      {/* ── Buy sheet ──────────────────────────────────────────────────────── */}
      {buyOpen && (() => {
        const fieldStyle = { display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 13px' } as const;
        const inputStyle = { flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' } as const;
        const tradeDateText = new Date(formDate).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB');
        return (
          <div onClick={closeBuy} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)', maxHeight: '90dvh', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{t.bsBuyTitle}</span>
                <span onClick={closeBuy} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
              </div>

              {/* Ticker search */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{lang === 'pt' ? 'Ação / ETF' : 'Stock / ETF'}</div>
                <div style={{ ...fieldStyle, border: buyQuoteState === 'error' ? '1px solid var(--loss)' : buyQuoteState === 'found' ? '1px solid var(--gain)' : '1px solid var(--card-border)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>search</span>
                  <input
                    value={buyInput}
                    onChange={e => setBuyInput(e.target.value.toUpperCase())}
                    placeholder="Ex: AAPL, NVDA, VWCE"
                    autoFocus
                    style={{ ...inputStyle, textTransform: 'uppercase' }}
                  />
                  {buyQuoteState === 'loading' && <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>…</span>}
                  {buyQuoteState === 'found' && <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--gain)' }}>check_circle</span>}
                  {buyQuoteState === 'error' && <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--loss)' }}>error</span>}
                </div>
                {buyQuoteState === 'error' && (
                  <div style={{ fontSize: 12, color: 'var(--loss)', marginTop: 4 }}>{lang === 'pt' ? 'Ativo não encontrado. Verifica o ticker.' : 'Asset not found. Check the ticker.'}</div>
                )}
                {buyQuoteState === 'found' && buyQuote && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', background: 'var(--gain-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--gain)' }}>
                      {buyInput.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{buyInput.trim().toUpperCase()}</div>
                      {buyQuote.companyName && <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{buyQuote.companyName}</div>}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{eur.format(buyQuote.price)} €</span>
                  </div>
                )}
              </div>

              {/* Form — only shown when ticker is valid */}
              {buyQuoteState === 'found' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsShares}</div>
                    <div style={fieldStyle}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>tag</span>
                      <input value={formShares} onChange={e => setFormShares(e.target.value)} type="text" inputMode="decimal" placeholder="0" style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsAvgPrice}</div>
                    <div style={fieldStyle}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>payments</span>
                      <input value={formPrice} onChange={e => setFormPrice(e.target.value)} type="text" inputMode="decimal" placeholder="0,00" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsDate}</div>
                      <div onClick={() => setDateDialogOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 10px', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)', flex: 'none' }}>calendar_month</span>
                        <span style={{ flex: 1, minWidth: 0, padding: '13px 0', fontSize: 14, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tradeDateText}</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsTime}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)', flex: 'none' }}>schedule</span>
                        <input value={formTime} onChange={e => setFormTime(e.target.value)} type="text" placeholder="14:32" style={{ ...inputStyle, minWidth: 0, width: '100%' }} />
                      </div>
                    </div>
                  </div>
                  {formError && <div style={{ fontSize: 13, color: 'var(--loss)' }}>{formError}</div>}
                  <button
                    onClick={() => confirmTrade('buy', buyInput.trim().toUpperCase(), formShares, formPrice, formDate, formTime, t.bsError, setFormError, closeBuy)}
                    disabled={saving}
                    style={{ background: 'var(--gain-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, opacity: saving ? 0.7 : 1 }}
                  >
                    {t.bsConfirm}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Sell sheet ─────────────────────────────────────────────────────── */}
      {sellOpen && (() => {
        const fieldStyle = { display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 13px' } as const;
        const inputStyle = { flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' } as const;
        const tradeDateText = new Date(formDate).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB');
        const selectedAsset = assets.find(a => a.ticker === sellTicker);
        return (
          <div onClick={closeSell} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)', maxHeight: '90dvh', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{t.bsSellTitle}</span>
                  {selectedAsset && (
                    <span style={{ fontSize: 13, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)', color: 'var(--loss)', background: 'var(--loss-container)' }}>
                      {sellTicker}
                    </span>
                  )}
                </span>
                <span onClick={closeSell} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
              </div>

              {/* Step 1: pick asset from portfolio */}
              {!selectedAsset ? (
                assets.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24, fontSize: 14 }}>
                    {t.noPositions}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {assets.map(a => (
                      <div key={a.ticker} onClick={() => { setSellTicker(a.ticker); resetForm(); }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--surface-container)' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                          {a.letter}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{a.ticker}</div>
                          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} {t.sharesUnit}</div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{eur.format(a.value)} €</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>chevron_right</span>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                /* Step 2: form */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Asset preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', background: 'var(--loss-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--loss)' }}>
                      {selectedAsset.letter}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedAsset.ticker}</div>
                      <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{lang === 'pt' ? 'Em carteira' : 'In portfolio'}: {selectedAsset.units} {t.sharesUnit}</div>
                    </div>
                    <span onClick={() => setSellTicker('')} style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>
                      {lang === 'pt' ? 'Alterar' : 'Change'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsShares}</div>
                    <div style={fieldStyle}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>tag</span>
                      <input value={formShares} onChange={e => setFormShares(e.target.value)} type="text" inputMode="decimal" placeholder={`0 – ${selectedAsset.units}`} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsAvgPrice}</div>
                    <div style={fieldStyle}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>payments</span>
                      <input value={formPrice} onChange={e => setFormPrice(e.target.value)} type="text" inputMode="decimal" placeholder="0,00" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsDate}</div>
                      <div onClick={() => setDateDialogOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 10px', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)', flex: 'none' }}>calendar_month</span>
                        <span style={{ flex: 1, minWidth: 0, padding: '13px 0', fontSize: 14, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tradeDateText}</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsTime}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)', flex: 'none' }}>schedule</span>
                        <input value={formTime} onChange={e => setFormTime(e.target.value)} type="text" placeholder="14:32" style={{ ...inputStyle, minWidth: 0, width: '100%' }} />
                      </div>
                    </div>
                  </div>
                  {formError && <div style={{ fontSize: 13, color: 'var(--loss)' }}>{formError}</div>}
                  <button
                    onClick={() => {
                      const units = parseFloat(formShares.replace(',', '.'));
                      if (units > selectedAsset.units) { setFormError(lang === 'pt' ? `Máximo disponível: ${selectedAsset.units} ações` : `Max available: ${selectedAsset.units} shares`); return; }
                      confirmTrade('sell', sellTicker, formShares, formPrice, formDate, formTime, t.bsError, setFormError, closeSell);
                    }}
                    disabled={saving}
                    style={{ background: 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, opacity: saving ? 0.7 : 1 }}
                  >
                    {t.bsSellConfirm}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {dateDialogOpen && (
        <TradeDateDialog
          value={formDate}
          lang={lang}
          confirmLabel={t.confirm}
          onClose={() => setDateDialogOpen(false)}
          onConfirm={iso => { setFormDate(iso); setDateDialogOpen(false); }}
        />
      )}

      <BottomNav />
    </div>
  );
}
