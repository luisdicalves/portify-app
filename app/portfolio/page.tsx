'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import Fab from '@/components/ui/Fab';
import TransactionCard, { Transaction } from '@/components/ui/TransactionCard';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { buildCashFlowForecast } from '@/lib/cashFlowForecast';
import { useUser } from '@/lib/hooks/useUser';
import { usePortfolioData } from '@/lib/hooks/usePortfolioData';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TAB_IDS = ['positions', 'dividends', 'history'] as const;

export default function PortfolioPage() {
  const router = useRouter();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);
  const { assets, loading, txns, dividends, cashSettings, removeTxn } = usePortfolioData(user?.id, lang);
  const [tab, setTab] = useState<typeof TAB_IDS[number]>('positions');
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);
  const [sellPickerOpen, setSellPickerOpen] = useState(false);

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
              {forecast.dividends.length === 0 ? (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                  {t.noUpcomingDividends}
                </div>
              ) : (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  {forecast.dividends.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: i < forecast.dividends.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
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
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 4px 8px' }}>{t.received}</div>
              {dividends.length === 0 ? (
                <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                  {t.noDividendsReceived}
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
        { icon: 'add', label: t.buy, color: 'var(--gain)', onClick: () => router.push('/portfolio/add') },
        {
          icon: 'remove', label: t.sell, color: 'var(--loss)',
          onClick: () => { if (assets.length > 0) setSellPickerOpen(true); },
        },
      ]} />

      {sellPickerOpen && (
        <div onClick={() => setSellPickerOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 30 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: '20px 20px 0 0', padding: '20px 16px 34px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70%', overflow: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t.sellAssetTitle}</div>
            {assets.map(a => (
              <div key={a.ticker} onClick={() => { setSellPickerOpen(false); router.push(`/portfolio/${a.ticker}?action=sell`); }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--surface-container)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                  {a.letter}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{a.ticker}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} {t.sharesUnit}</div>
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
