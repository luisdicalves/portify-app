'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { Skeleton, SkeletonChart } from '@/components/ui/Skeleton';
import { createClient } from '@/lib/supabase/client';
import { getHoldings } from '@/lib/db/holdings';
import { getTransactions } from '@/lib/db/transactions';
import {
  calcTotalValue, calcTotalInvested, buildPortfolioSeries, buildPortfolioDates, buildLinePath, type Holding,
} from '@/lib/portfolioMetrics';
import { evaluatePerformance, type CashFlow, type ValuationPoint } from '@/lib/models/performanceEngine';
import { fetchQuote, fetchHistory, type Quote, type HistoryPoint } from '@/lib/marketApi';
import { useUser } from '@/lib/hooks/useUser';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

const TIMEFRAMES = ['1S', '1M', '3M', '6M', '1A', 'Max'];
const TIMEFRAME_OUTPUTSIZE = [7, 30, 90, 180, 365, 500];

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });


export default function PerformancePage() {
  const router = useRouter();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);
  const [tf, setTf] = useState(4);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [externalFlows, setExternalFlows] = useState<CashFlow[]>([]);
  const [inceptionDate, setInceptionDate] = useState<string | null>(null);
  const [chartValues, setChartValues] = useState<number[] | null>(null);
  const [chartDates, setChartDates] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = createClient();

      const [hs, { data: transactions }] = await Promise.all([
        getHoldings(supabase, user.id),
        getTransactions(supabase, user.id), // descending by executed_at
      ]);
      setHoldings(hs);

      const validTransactions = (transactions ?? []).filter(
        (tx): tx is typeof tx & { executed_at: string } => tx.executed_at != null,
      );
      if (validTransactions.length > 0) {
        setInceptionDate(validTransactions[validTransactions.length - 1].executed_at);
        setExternalFlows(
          validTransactions
            .filter(tx => tx.type === 'deposit' && Number.isFinite(tx.amount))
            .map(tx => ({ date: tx.executed_at, amount: Math.abs(tx.amount) })),
        );
      }

      const quoteResults = await Promise.all(hs.map(h => fetchQuote(h.ticker)));
      const quoteMap: Record<string, Quote> = {};
      hs.forEach((h, i) => { if (quoteResults[i]) quoteMap[h.ticker] = quoteResults[i]!; });
      setQuotes(quoteMap);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (holdings.length === 0) { setChartValues(null); return; }
    (async () => {
      const outputsize = TIMEFRAME_OUTPUTSIZE[tf];
      const histories = await Promise.all(holdings.map(h => fetchHistory(h.ticker, outputsize)));
      setChartValues(buildPortfolioSeries(holdings, histories));
      setChartDates(buildPortfolioDates(histories));
    })();
  }, [holdings, tf]);

  const totalValue = calcTotalValue(holdings, ticker => quotes[ticker]?.price);
  const totalInvested = calcTotalInvested(holdings);
  const totalReturn = totalValue - totalInvested;

  // XIRR "desde o início": só 2 pontos de valorização (início da conta,
  // hoje) — suficiente para um money-weighted return real e datado, mas
  // não para TWR (precisaria de preços históricos para tickers já
  // vendidos, fora de âmbito aqui — ver lib/models/performanceEngine.ts).
  // Assume valor 0 antes da primeira transação registada; pode subestimar
  // a data de início real para carteiras importadas sem depósito
  // correspondente, por isso a UI rotula isto como estimativa.
  const xirr = inceptionDate
    ? evaluatePerformance({
        valuationSeries: [
          { date: inceptionDate, value: 0 },
          { date: new Date().toISOString(), value: totalValue },
        ] satisfies ValuationPoint[],
        externalFlows,
      }).xirr
    : null;

  const movers = holdings
    .filter(h => quotes[h.ticker] !== undefined)
    .map(h => ({
      ticker: h.ticker,
      companyName: quotes[h.ticker].companyName ?? h.ticker,
      gainPct: h.avg_price > 0 ? ((quotes[h.ticker].price - h.avg_price) / h.avg_price) * 100 : 0,
    }))
    .sort((a, b) => b.gainPct - a.gainPct);
  const best = movers[0];
  const worst = movers.length > 1 ? movers[movers.length - 1] : null;

  const chartColor = chartValues && chartValues.length > 1 && chartValues[chartValues.length - 1] >= chartValues[0] ? 'var(--gain)' : 'var(--loss)';
  const { line, area } = chartValues && chartValues.length > 1 ? buildLinePath(chartValues, { height: 120 }) : { line: '', area: '' };

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Retorno Total</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Retorno total</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: totalReturn >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? <Skeleton width={80} height={22} /> : `${totalReturn >= 0 ? '+' : ''}${eur.format(totalReturn)} €`}
            </div>
          </div>
          <div style={{ flex: 1, background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{t.performanceAnnualizedLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: xirr === null || xirr >= 0 ? 'var(--on-surface)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? <Skeleton width={50} height={22} /> : xirr === null ? t.performanceXirrUnavailable : `${xirr >= 0 ? '+' : ''}${(xirr * 100).toFixed(1)}%`}
            </div>
            {!loading && xirr !== null && (
              <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{t.performanceXirrCaption}</div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ display: 'flex', background: 'var(--surface-container)', borderRadius: 'var(--radius-full)', padding: 3, marginBottom: 12 }}>
            {TIMEFRAMES.map((label, i) => (
              <button key={label} onClick={() => setTf(i)} style={{
                flex: 1, padding: '6px 0', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: tf === i ? 'var(--surface-lowest)' : 'transparent',
                color: tf === i ? 'var(--primary)' : 'var(--on-surface-variant)',
                boxShadow: tf === i ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
            ))}
          </div>
          {chartValues && chartValues.length > 1 ? (
            <>
              <svg viewBox="0 0 320 120" style={{ width: '100%', height: 110, display: 'block' }}>
                <title>Retorno Total</title>
                <desc>{`${t.chartDescFrom} ${eur.format(chartValues[0])} € ${t.chartDescTo} ${eur.format(chartValues[chartValues.length - 1])} €`}</desc>
                <defs>
                  <linearGradient id="pPerfG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity="0.26" />
                    <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[20, 45, 70, 95].map(y => (
                  <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="var(--chart-grid)" strokeWidth="1" />
                ))}
                <path d={area} fill="url(#pPerfG)" />
                <path d={line} fill="none" stroke={chartColor} strokeWidth="2.5" strokeLinecap="round" />
                {chartDates && chartDates.length > 1 && [0, Math.floor((chartDates.length - 1) / 2), chartDates.length - 1]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map(i => {
                    const x = (i / (chartDates.length - 1)) * 320;
                    const anchor = i === 0 ? 'start' : i === chartDates.length - 1 ? 'end' : 'middle';
                    const label = new Intl.DateTimeFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short' }).format(new Date(`${chartDates[i]}T12:00:00Z`));
                    return <text key={i} x={x} y={116} textAnchor={anchor} fill="var(--chart-axis)" fontSize="9">{label}</text>;
                  })}
              </svg>
              <table className="sr-only">
                <caption>{t.chartTableCaption}</caption>
                <thead><tr><th>{t.chartDateColumn}</th><th>{t.chartValueColumn}</th></tr></thead>
                <tbody>
                  {chartValues.map((v, i) => (
                    <tr key={i}><td>{chartDates?.[i] ?? i}</td><td>{eur.format(v)} €</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : loading ? (
            <SkeletonChart height={110} />
          ) : (
            <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
              Sem dados históricos suficientes.
            </div>
          )}
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {loading && <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}><Skeleton height={20} /><Skeleton height={20} /></div>}
          {!loading && !best && <div style={{ padding: 14, fontSize: 13, color: 'var(--on-surface-variant)' }}>Sem posições registadas.</div>}
          {!loading && best && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: worst ? '1px solid var(--hairline)' : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--gain)' }}>trending_up</span>
                Melhor ativo
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{best.companyName} <span style={{ color: 'var(--gain)' }}>{best.gainPct >= 0 ? '+' : ''}{best.gainPct.toFixed(0)}%</span></span>
            </div>
          )}
          {!loading && worst && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--loss)' }}>trending_down</span>
                Pior ativo
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{worst.companyName} <span style={{ color: 'var(--loss)' }}>{worst.gainPct >= 0 ? '+' : ''}{worst.gainPct.toFixed(0)}%</span></span>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
