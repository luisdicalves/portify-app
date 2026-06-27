import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooHistory } from '@/lib/marketData';
import { getCached } from '@/lib/cache';

// Daily candles only change once a day — safe to cache for hours.
const HISTORY_TTL_SECONDS = 6 * 60 * 60;

// XTB-style suffix (.US, .FR, .NL, ...) -> Twelve Data exchange name, used to
// disambiguate tickers that exist on multiple exchanges. US needs no exchange param.
const EXCHANGE_MAP: Record<string, string> = {
  FR: 'Euronext',
  NL: 'Euronext',
  BE: 'Euronext',
  PT: 'Euronext Lisbon',
  DE: 'XETRA',
  ES: 'BME',
  IT: 'Borsa Italiana',
  UK: 'LSE',
  GB: 'LSE',
  CH: 'SIX',
};

function toTwelveDataParams(ticker: string): { symbol: string; exchange?: string } {
  const [base, suffix] = ticker.split('.');
  if (!suffix || suffix.toUpperCase() === 'US') return { symbol: base };
  const exchange = EXCHANGE_MAP[suffix.toUpperCase()];
  return exchange ? { symbol: base, exchange } : { symbol: base };
}

async function fetchTwelveDataHistory(ticker: string, outputsize: string, apiKey: string) {
  const { symbol, exchange } = toTwelveDataParams(ticker);
  const params = new URLSearchParams({ symbol, interval: '1day', outputsize, apikey: apiKey });
  if (exchange) params.set('exchange', exchange);

  const res = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`);
  const data = await res.json();
  if (data.status === 'error' || !Array.isArray(data.values)) return null;

  const points = data.values
    .map((v: { datetime: string; close: string }) => ({ date: v.datetime, close: parseFloat(v.close) }))
    .filter((p: { close: number }) => !Number.isNaN(p.close))
    .reverse(); // Twelve Data returns most-recent-first; chart wants chronological order.

  return points.length > 1 ? points : null;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('symbol');
  if (!ticker) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });

  const apiKey = process.env.TWELVEDATA_API_KEY;
  const outputsize = req.nextUrl.searchParams.get('outputsize') ?? '30';

  try {
    const points = await getCached(`history:${ticker}:${outputsize}`, HISTORY_TTL_SECONDS, async () => {
      const twelveData = apiKey ? await fetchTwelveDataHistory(ticker, outputsize, apiKey) : null;
      if (twelveData) return twelveData;

      // Free Twelve Data doesn't cover most non-US exchanges — fall back to Yahoo Finance.
      return fetchYahooHistory(ticker, parseInt(outputsize, 10));
    });

    if (points) return NextResponse.json({ points });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
