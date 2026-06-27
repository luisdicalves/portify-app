import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooQuote } from '@/lib/marketData';

// XTB-style suffix (.US, .FR, .NL, ...) -> Finnhub exchange suffix.
// US tickers have no suffix on Finnhub; others use the exchange's MIC-derived suffix.
const SUFFIX_MAP: Record<string, string> = {
  US: '',
  FR: '.PA',
  NL: '.AS',
  DE: '.DE',
  PT: '.LS',
  ES: '.MC',
  IT: '.MI',
  UK: '.L',
  GB: '.L',
  BE: '.BR',
  CH: '.SW',
};

function toFinnhubSymbol(ticker: string): string {
  const [base, suffix] = ticker.split('.');
  if (!suffix) return base;
  const mapped = SUFFIX_MAP[suffix.toUpperCase()];
  return mapped === undefined ? ticker : `${base}${mapped}`;
}

async function fetchFinnhubQuote(ticker: string, apiKey: string) {
  const symbol = toFinnhubSymbol(ticker);
  const [quoteRes, profileRes] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
  ]);
  if (!quoteRes.ok) return null;
  const quote = await quoteRes.json();
  const profile = profileRes.ok ? await profileRes.json() : {};

  // Finnhub returns all-zero quote when the symbol isn't found / not covered by the plan.
  if (quote.c === 0 && quote.h === 0 && quote.l === 0) return null;

  return {
    symbol,
    price: quote.c,
    change: quote.d,
    changePercent: quote.dp,
    open: quote.o,
    high: quote.h,
    low: quote.l,
    prevClose: quote.pc,
    companyName: profile.name ?? null,
    industry: profile.finnhubIndustry ?? null,
    exchange: profile.exchange ?? null,
  };
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('symbol');
  if (!ticker) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });

  const apiKey = process.env.FINNHUB_API_KEY;

  try {
    const finnhub = apiKey ? await fetchFinnhubQuote(ticker, apiKey) : null;
    if (finnhub) return NextResponse.json(finnhub);

    // Free Finnhub doesn't cover most non-US exchanges — fall back to Yahoo Finance.
    const yahoo = await fetchYahooQuote(ticker);
    if (yahoo) return NextResponse.json(yahoo);

    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
