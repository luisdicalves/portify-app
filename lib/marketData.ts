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

// XTB-style suffix (.US, .FR, .NL, ...) -> Finnhub exchange suffix.
// US tickers have no suffix on Finnhub; others use the exchange's MIC-derived suffix.
const FINNHUB_QUOTE_SUFFIX_MAP: Record<string, string> = {
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

export function toFinnhubQuoteSymbol(ticker: string): string {
  const [base, suffix] = ticker.split('.');
  if (!suffix) return base;
  const mapped = FINNHUB_QUOTE_SUFFIX_MAP[suffix.toUpperCase()];
  return mapped === undefined ? ticker : `${base}${mapped}`;
}

export async function fetchFinnhubQuote(ticker: string, apiKey: string) {
  const symbol = toFinnhubQuoteSymbol(ticker);
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

// Tries Finnhub first (free tier only really covers US tickers); falls back to
// the unofficial Yahoo endpoint for everything else.
export async function getQuote(ticker: string, finnhubApiKey: string | undefined) {
  const finnhub = finnhubApiKey ? await fetchFinnhubQuote(ticker, finnhubApiKey) : null;
  if (finnhub) return finnhub;
  return fetchYahooQuote(ticker);
}

// XTB-style suffix (.US, .FR, .NL, ...) -> Twelve Data exchange name, used to
// disambiguate tickers that exist on multiple exchanges. US needs no exchange param.
const TWELVEDATA_EXCHANGE_MAP: Record<string, string> = {
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

export function toTwelveDataParams(ticker: string): { symbol: string; exchange?: string } {
  const [base, suffix] = ticker.split('.');
  if (!suffix || suffix.toUpperCase() === 'US') return { symbol: base };
  const exchange = TWELVEDATA_EXCHANGE_MAP[suffix.toUpperCase()];
  return exchange ? { symbol: base, exchange } : { symbol: base };
}

export async function fetchTwelveDataHistory(ticker: string, outputsize: string, apiKey: string) {
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

// Tries Twelve Data first (free tier only really covers US tickers); falls back
// to the unofficial Yahoo endpoint for everything else.
export async function getHistory(ticker: string, outputsize: string, twelveDataApiKey: string | undefined) {
  const twelveData = twelveDataApiKey ? await fetchTwelveDataHistory(ticker, outputsize, twelveDataApiKey) : null;
  if (twelveData) return twelveData;
  return fetchYahooHistory(ticker, parseInt(outputsize, 10));
}
