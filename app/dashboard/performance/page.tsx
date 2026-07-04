'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { Skeleton, SkeletonChart } from '@/components/ui/Skeleton';
import { createClient } from '@/lib/supabase/client';
import {
  calcTotalValue, calcTotalInvested, buildPortfolioSeries, buildLinePath,
  calcWeightedAvgDaysHeld, calcAnnualizedReturn, type Holding,
} from '@/lib/portfolioMetrics';
import { fetchQuote, fetchHistory, type Quote, type HistoryPoint } from '@/lib/marketApi';
import { useUser } from '@/lib/hooks/useUser';

const TIMEFRAMES = ['1S', '1M', '3M', '6M', '1A', 'Max'];
const TIMEFRAME_OUTPUTSIZE = [7, 30, 90, 180, 365, 500];

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });


export default function PerformancePage() {
  const router = useRouter();
  const { user } = useUser();
  const [tf, setTf] = useState(4);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [avgDaysHeld, setAvgDaysHeld] = useState(365);
  const [chartValues, setChartValues] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = createClient();

      const [{ data: holdingsData }, { data: buys }] = await Promise.all([
        supabase.from('holdings').select('ticker, units, avg_price').eq('user_id', user.id),
        supabase.from('transactions').select('amount, executed_at').eq('user_id', user.id).eq('type', 'buy'),
      ]);

      const hs = holdingsData ?? [];
      setHoldings(hs);

      const validBuys = (buys ?? []).filter((b): b is typeof b & { executed_at: string } => b.executed_at != null);
      if (validBuys.length > 0) {
        setAvgDaysHeld(calcWeightedAvgDaysHeld(validBuys));
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
    })();
  }, [holdings, tf]);

  const totalValue = calcTotalValue(holdings, ticker => quotes[ticker]?.price);
  const totalInvested = calcTotalInvested(holdings);
  const totalReturn = totalValue - totalInvested;
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
  const annualizedPct = totalInvested > 0 ? calcAnnualizedReturn(totalReturnPct, avgDaysHeld) : 0;

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
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Anualizado</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: annualizedPct >= 0 ? 'var(--on-surface)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? <Skeleton width={50} height={22} /> : `${annualizedPct >= 0 ? '+' : ''}${annualizedPct.toFixed(1)}%`}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ display: 'flex', background: 'var(--surface-container)', borderRadius: 'var(--radius-full)', padding: 3, marginBottom: 12 }}>
            {TIMEFRAMES.map((t, i) => (
              <button key={t} onClick={() => setTf(i)} style={{
                flex: 1, padding: '6px 0', borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: tf === i ? 'var(--surface-lowest)' : 'transparent',
                color: tf === i ? 'var(--primary)' : 'var(--on-surface-variant)',
                boxShadow: tf === i ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{t}</button>
            ))}
          </div>
          {chartValues && chartValues.length > 1 ? (
            <svg viewBox="0 0 320 120" style={{ width: '100%', height: 110, display: 'block' }}>
              <defs>
                <linearGradient id="pPerfG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity="0.26" />
                  <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#pPerfG)" />
              <path d={line} fill="none" stroke={chartColor} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
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
