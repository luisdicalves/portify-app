'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import TradeDateDialog from '@/components/ui/TradeDateDialog';
import RiskReport from '@/components/ui/RiskReport';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { useUser } from '@/lib/hooks/useUser';
import { useAssetDetail } from '@/lib/hooks/useAssetDetail';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Builds an SVG line/area path from a series of values, scaled to the viewBox.
// Used both for the real Twelve Data history and, as a fallback, for a
// representative day-range sparkline from open/low/high/price.
function buildLinePath(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 320, h = 110, pad = 10;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return { line, area };
}

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);
  const { id } = use(params);
  const ticker = id.toUpperCase();

  const { holding, quote, quoteLoading, history, riskReport, riskLoading, riskRequested, saving, loadRiskReport, confirmTrade } = useAssetDetail(ticker, user?.id, lang);
  const [sheet, setSheet] = useState<'buy' | 'sell' | null>(null);
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [tradeDate, setTradeDate] = useState(todayIso());
  const [time, setTime] = useState(nowTime());
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [error, setError] = useState('');

  function openSheet(mode: 'buy' | 'sell') {
    setShares('');
    setAvgPrice('');
    setTradeDate(todayIso());
    setTime(nowTime());
    setError('');
    setSheet(mode);
  }

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'buy' || action === 'sell') openSheet(action);
  }, [searchParams]);

  function closeSheet() {
    setSheet(null);
    setError('');
  }


  const tradeDateText = new Date(tradeDate).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB');
  const fieldStyle = { display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 13px' } as const;
  const inputStyle = { flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' } as const;

  return (
    <div className="phone-shell" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{ticker}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 160px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          {quoteLoading ? (
            <span style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>…</span>
          ) : quote ? (
            <>
              <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{eur.format(quote.price)} €</span>
              <span style={{ color: quote.change >= 0 ? 'var(--gain)' : 'var(--loss)', fontSize: 14, fontWeight: 600 }}>
                {quote.change >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </span>
            </>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{t.detailNoQuote}</span>
          )}
        </div>

        {quote && (() => {
          const gain = history && history.length > 1
            ? history[history.length - 1].close >= history[0].close
            : quote.change >= 0;
          const values = history && history.length > 1
            ? history.map(p => p.close)
            : [quote.open, quote.low, quote.high, quote.price];
          const { line, area } = buildLinePath(values);
          return (
            <svg viewBox="0 0 320 110" style={{ width: '100%', height: 100, display: 'block' }}>
              <defs>
                <linearGradient id="pDetG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gain ? 'var(--gain)' : 'var(--loss)'} stopOpacity="0.26" />
                  <stop offset="100%" stopColor={gain ? 'var(--gain)' : 'var(--loss)'} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#pDetG)" />
              <path d={line} fill="none" stroke={gain ? 'var(--gain)' : 'var(--loss)'} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          );
        })()}

        {quote && (
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 12 }}>{t.detailStats}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[[t.open, quote.open], [t.prevClose, quote.prevClose], [t.dayHigh, quote.high], [t.dayLow, quote.low]].map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{l}</span>
                  <b style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{eur.format(v as number)} €</b>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>{t.detailAbout}</div>
          {quote?.companyName || quote?.industry || quote?.exchange ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {quote.companyName && (
                <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.detailAboutName}</span><b style={{ color: 'var(--on-surface)' }}>{quote.companyName}</b>
                </div>
              )}
              {quote.industry && (
                <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.detailAboutSector}</span><b style={{ color: 'var(--on-surface)' }}>{quote.industry}</b>
                </div>
              )}
              {quote.exchange && (
                <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.detailAboutExchange}</span><b style={{ color: 'var(--on-surface)' }}>{quote.exchange}</b>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{t.detailNoInfo}</div>
          )}
        </div>

        {/* Análise de risco */}
        {riskReport ? (
          <RiskReport report={riskReport} price={quote?.price ?? 0} lang={lang} />
        ) : (
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 10 }}>{t.riskTitle}</div>
            {riskLoading ? (
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{t.riskLoading}</div>
            ) : riskRequested ? (
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{t.riskUnavailable}</div>
            ) : (
              <button onClick={loadRiskReport} style={{ width: '100%', background: 'var(--surface-high)', color: 'var(--on-surface)', border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>analytics</span>{t.riskCta}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 82, display: 'flex', gap: 10 }}>
        <button onClick={() => openSheet('buy')}
          style={{ flex: 1, background: 'var(--gain-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.buy}
        </button>
        <button onClick={() => openSheet('sell')}
          style={{ flex: 1, background: 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.sell}
        </button>
      </div>

      {sheet && (
        <div onClick={closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{sheet === 'buy' ? t.bsBuyTitle : t.bsSellTitle}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)',
                  color: sheet === 'buy' ? 'var(--gain)' : 'var(--loss)',
                  background: sheet === 'buy' ? 'var(--gain-container)' : 'var(--loss-container)',
                }}>{ticker}</span>
              </span>
              <span onClick={closeSheet} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsShares}</div>
                <div style={fieldStyle}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>tag</span>
                  <input value={shares} onChange={e => setShares(e.target.value)} type="text" inputMode="decimal" placeholder="0" style={inputStyle} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.bsAvgPrice}</div>
                <div style={fieldStyle}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>payments</span>
                  <input value={avgPrice} onChange={e => setAvgPrice(e.target.value)} type="text" inputMode="decimal" placeholder="0,00" style={inputStyle} />
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
                    <input value={time} onChange={e => setTime(e.target.value)} type="text" placeholder="14:32" style={{ ...inputStyle, minWidth: 0, width: '100%' }} />
                  </div>
                </div>
              </div>

              {error && <div style={{ fontSize: 13, color: 'var(--loss)' }}>{error}</div>}

              <button onClick={() => sheet && confirmTrade(sheet, shares, avgPrice, tradeDate, time, t.bsError, setError, closeSheet)} disabled={saving} style={{
                background: sheet === 'buy' ? 'var(--gain-strong)' : 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, opacity: saving ? 0.7 : 1,
              }}>
                {sheet === 'buy' ? t.bsConfirm : t.bsSellConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {dateDialogOpen && (
        <TradeDateDialog
          value={tradeDate}
          lang={lang}
          confirmLabel={t.confirm}
          onClose={() => setDateDialogOpen(false)}
          onConfirm={iso => { setTradeDate(iso); setDateDialogOpen(false); }}
        />
      )}

      <BottomNav />
    </div>
  );
}
