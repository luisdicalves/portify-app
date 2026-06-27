// Yahoo Finance's chart endpoint is unofficial/undocumented — it can change or break
// without notice. Used only as a fallback for exchanges the free Finnhub/Twelve Data
// tiers don't cover (e.g. Euronext, XETRA).

// XTB-style suffix (.US, .FR, .NL, ...) -> Yahoo Finance ticker suffix.
const YAHOO_SUFFIX_MAP: Record<string, string> = {
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

export function toYahooSymbol(ticker: string): string {
  const [base, suffix] = ticker.split('.');
  if (!suffix) return base;
  const mapped = YAHOO_SUFFIX_MAP[suffix.toUpperCase()];
  return mapped === undefined ? ticker : `${base}${mapped}`;
}

type YahooChartResult = {
  meta: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    longName?: string;
    shortName?: string;
    fullExchangeName?: string;
  };
  timestamp?: number[];
  indicators: {
    quote: [{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }];
  };
};

async function fetchYahooChart(ticker: string, range: string): Promise<YahooChartResult | null> {
  const symbol = toYahooSymbol(ticker);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    return result ?? null;
  } catch {
    return null;
  }
}

export async function fetchYahooQuote(ticker: string) {
  const result = await fetchYahooChart(ticker, '5d');
  if (!result) return null;

  const { meta, indicators } = result;
  const quotes = indicators.quote[0];
  const lastIdx = (quotes.close ?? []).findLastIndex(v => v != null);
  if (lastIdx === -1 || meta.regularMarketPrice == null) return null;

  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
  const open = quotes.open?.[lastIdx] ?? price;
  const high = quotes.high?.[lastIdx] ?? price;
  const low = quotes.low?.[lastIdx] ?? price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol: toYahooSymbol(ticker),
    price,
    change,
    changePercent,
    open,
    high,
    low,
    prevClose,
    companyName: meta.longName ?? meta.shortName ?? null,
    industry: null as string | null,
    exchange: meta.fullExchangeName ?? null,
  };
}

export async function fetchYahooHistory(ticker: string, outputsize: number) {
  const range = outputsize <= 30 ? '1mo' : outputsize <= 90 ? '3mo' : '1y';
  const result = await fetchYahooChart(ticker, range);
  if (!result || !result.timestamp) return null;

  const closes = result.indicators.quote[0].close ?? [];
  const points = result.timestamp
    .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((p): p is { date: string; close: number } => p.close != null)
    .slice(-outputsize);

  return points.length > 1 ? points : null;
}
