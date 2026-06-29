'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { Skeleton, SkeletonChart } from '@/components/ui/Skeleton';
import { createClient } from '@/lib/supabase/client';
import { calcTotalValue, calcTotalInvested, buildPortfolioSeries, buildLinePath } from '@/lib/portfolioMetrics';

const TIMEFRAMES = ['1S', '1M', '3M', '6M', '1A', 'Max'];
const TIMEFRAME_OUTPUTSIZE = [7, 30, 90, 180, 365, 500];

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurCompact = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 });

type Holding = { ticker: string; units: number; avg_price: number };
type Quote = { price: number; changePercent: number; companyName: string | null };
type HistoryPoint = { date: string; close: number };

async function fetchQuote(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.price !== 'number') return null;
    return { price: data.price, changePercent: data.changePercent ?? 0, companyName: data.companyName ?? null };
  } catch {
    return null;
  }
}

async function fetchHistory(ticker: string, outputsize: number): Promise<HistoryPoint[] | null> {
  try {
    const res = await fetch(`/api/history?symbol=${encodeURIComponent(ticker)}&outputsize=${outputsize}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.points) && data.points.length > 1 ? data.points : null;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [tf, setTf] = useState(4);
  const [fullName, setFullName] = useState('');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [chartValues, setChartValues] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: profile }, { data: holdingsData }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
        supabase.from('holdings').select('ticker, units, avg_price').eq('user_id', user.id),
      ]);
      if (profile) setFullName([profile.first_name, profile.last_name].filter(Boolean).join(' '));

      const hs = holdingsData ?? [];
      setHoldings(hs);

      const quoteResults = await Promise.all(hs.map(h => fetchQuote(h.ticker)));
      const quoteMap: Record<string, Quote> = {};
      hs.forEach((h, i) => { if (quoteResults[i]) quoteMap[h.ticker] = quoteResults[i]!; });
      setQuotes(quoteMap);
      setLoading(false);
    })();
  }, []);

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
  const totalReturnPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0;
  const dayChangeValue = holdings.reduce((sum, h) => {
    const q = quotes[h.ticker];
    if (!q) return sum;
    const price = q.price;
    const changeAbs = price - price / (1 + q.changePercent / 100);
    return sum + h.units * changeAbs;
  }, 0);
  const dayChangeBase = totalValue - dayChangeValue;
  const dayChangePct = dayChangeBase > 0 ? (dayChangeValue / dayChangeBase) * 100 : 0;

  const movers = holdings
    .filter(h => quotes[h.ticker] !== undefined)
    .map(h => ({ ticker: h.ticker, companyName: quotes[h.ticker].companyName ?? h.ticker, changePercent: quotes[h.ticker].changePercent }))
    .sort((a, b) => b.changePercent - a.changePercent);
  const topGainer = movers[0];
  const topLoser = movers.length > 1 ? movers[movers.length - 1] : null;

  const chartColor = chartValues && chartValues.length > 1 && chartValues[chartValues.length - 1] >= chartValues[0] ? 'var(--gain)' : 'var(--loss)';
  const { line, area } = chartValues && chartValues.length > 1 ? buildLinePath(chartValues, { height: 96 }) : { line: '', area: '' };

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="material-symbols-outlined icf" style={{ fontSize: 30, color: 'var(--primary)' }}>account_circle</span>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Bem-vindo de volta</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.01em' }}>{fullName || '...'}</div>
          </div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)' }}>notifications</span>
      </div>

      {/* Scroll content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Portfolio value */}
        <div onClick={() => router.push('/dashboard/net-worth')} style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Valor total do portfólio</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{loading ? '—' : `€ ${eur.format(totalValue)}`}</span>
            {!loading && holdings.length > 0 && (
              <span style={{ color: dayChangePct >= 0 ? 'var(--gain)' : 'var(--loss)', fontSize: 13, fontWeight: 600 }}>
                {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Performance chart */}
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
          <div onClick={() => router.push('/dashboard/performance')} style={{ cursor: 'pointer' }}>
            {chartValues && chartValues.length > 1 ? (
              <svg viewBox="0 0 320 96" style={{ width: '100%', height: 88, display: 'block' }}>
                <defs>
                  <linearGradient id="pHomeG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill="url(#pHomeG)" />
                <path d={line} fill="none" stroke={chartColor} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : loading ? (
              <SkeletonChart height={88} />
            ) : (
              <div style={{ height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', fontSize: 13 }}>
                Sem dados históricos suficientes.
              </div>
            )}
          </div>
        </div>

        {/* Stat cards row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div onClick={() => router.push('/dashboard/net-worth')} style={{ flex: 1, cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>savings</span>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>Património líquido</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{loading ? <Skeleton width={70} height={16} /> : `${eurCompact.format(totalValue)} €`}</div>
          </div>
          <div onClick={() => router.push('/dashboard/performance')} style={{ flex: 1, cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: totalReturnPct >= 0 ? 'var(--gain)' : 'var(--loss)' }}>trending_up</span>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>Retorno total</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: totalReturnPct >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? <Skeleton width={50} height={16} /> : `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(1)}%`}
            </div>
          </div>
        </div>

        {/* Daily performance */}
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Destaques do dia</div>

          {loading && <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}><Skeleton height={52} radius="var(--radius-md)" /><Skeleton height={52} radius="var(--radius-md)" /></div>}
          {!loading && holdings.length === 0 && <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Sem posições registadas.</div>}

          {!loading && topGainer && (
            <div onClick={() => router.push(`/portfolio/${topGainer.ticker}`)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: topGainer.changePercent >= 0 ? 'var(--gain-container)' : 'var(--loss-container)', borderRadius: 'var(--radius-md)', padding: '9px 11px', marginBottom: topLoser ? 9 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: topGainer.changePercent >= 0 ? 'var(--gain)' : 'var(--loss)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined icf" style={{ fontSize: 18, color: 'var(--bg)' }}>{topGainer.changePercent >= 0 ? 'arrow_upward' : 'arrow_downward'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{topGainer.companyName}</div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{topGainer.ticker}</div>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: topGainer.changePercent >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
                {topGainer.changePercent >= 0 ? '+' : ''}{topGainer.changePercent.toFixed(2)}%
              </span>
            </div>
          )}

          {!loading && topLoser && (
            <div onClick={() => router.push(`/portfolio/${topLoser.ticker}`)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: topLoser.changePercent >= 0 ? 'var(--gain-container)' : 'var(--loss-container)', borderRadius: 'var(--radius-md)', padding: '9px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: topLoser.changePercent >= 0 ? 'var(--gain)' : 'var(--loss)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined icf" style={{ fontSize: 18, color: 'var(--bg)' }}>{topLoser.changePercent >= 0 ? 'arrow_upward' : 'arrow_downward'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{topLoser.companyName}</div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{topLoser.ticker}</div>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: topLoser.changePercent >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums' }}>
                {topLoser.changePercent >= 0 ? '+' : ''}{topLoser.changePercent.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

      </div>

      <BottomNav />
    </div>
  );
}
