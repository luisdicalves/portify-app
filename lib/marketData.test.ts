import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  toYahooSymbol, fetchYahooQuote, fetchYahooHistory,
  toFinnhubQuoteSymbol, fetchFinnhubQuote, getQuote,
  toTwelveDataParams, fetchTwelveDataHistory, getHistory,
} from './marketData';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJsonFetch(matchers: { match: string; body: unknown; ok?: boolean }[]) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const hit = matchers.find(m => url.includes(m.match));
    if (!hit) return Promise.resolve({ ok: false, json: async () => ({}) });
    return Promise.resolve({ ok: hit.ok ?? true, json: async () => hit.body });
  }));
}

function yahooChart(overrides: Record<string, unknown> = {}) {
  return {
    chart: {
      result: [{
        meta: {
          regularMarketPrice: 110,
          previousClose: 100,
          longName: 'Acme Corp',
          fullExchangeName: 'NASDAQ',
          ...overrides,
        },
        timestamp: [1700000000, 1700086400, 1700172800],
        indicators: { quote: [{ open: [98, 105, 108], high: [101, 107, 112], low: [97, 104, 107], close: [100, 105, 110] }] },
      }],
    },
  };
}

describe('toYahooSymbol', () => {
  it('returns the base ticker unchanged when there is no suffix', () => {
    expect(toYahooSymbol('AAPL')).toBe('AAPL');
  });

  it('maps known XTB-style suffixes to Yahoo Finance suffixes', () => {
    expect(toYahooSymbol('AIR.FR')).toBe('AIR.PA');
    expect(toYahooSymbol('ABN.NL')).toBe('ABN.AS');
    expect(toYahooSymbol('FB2A.DE')).toBe('FB2A.DE');
    expect(toYahooSymbol('GALP.PT')).toBe('GALP.LS');
  });

  it('strips the suffix for US tickers', () => {
    expect(toYahooSymbol('TSLA.US')).toBe('TSLA');
  });

  it('passes the ticker through unchanged for an unknown suffix', () => {
    expect(toYahooSymbol('XYZ.ZZ')).toBe('XYZ.ZZ');
  });
});

describe('fetchYahooQuote', () => {
  it('builds a quote from the chart endpoint, computing change from previousClose', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: yahooChart() }]);
    const quote = await fetchYahooQuote('AAPL.US');
    expect(quote).toMatchObject({ symbol: 'AAPL', price: 110, prevClose: 100, change: 10, companyName: 'Acme Corp', exchange: 'NASDAQ' });
    expect(quote!.changePercent).toBeCloseTo(10, 5);
  });

  it('returns null when the request fails', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: {}, ok: false }]);
    expect(await fetchYahooQuote('AAPL.US')).toBeNull();
  });

  it('returns null when there is no usable price data', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: { chart: { result: [{ meta: {}, indicators: { quote: [{ close: [] }] } }] } } }]);
    expect(await fetchYahooQuote('AAPL.US')).toBeNull();
  });
});

describe('fetchYahooHistory', () => {
  it('builds chronological date/close points from the chart endpoint', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: yahooChart() }]);
    const points = await fetchYahooHistory('AAPL.US', 30);
    expect(points).toEqual([
      { date: '2023-11-14', close: 100 },
      { date: '2023-11-15', close: 105 },
      { date: '2023-11-16', close: 110 },
    ]);
  });

  it('returns null when there are fewer than 2 valid points', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: { chart: { result: [{ meta: {}, timestamp: [1700000000], indicators: { quote: [{ close: [100] }] } }] } } }]);
    expect(await fetchYahooHistory('AAPL.US', 30)).toBeNull();
  });
});

describe('toFinnhubQuoteSymbol', () => {
  it('strips the .US suffix and maps others to Finnhub-style suffixes', () => {
    expect(toFinnhubQuoteSymbol('AAPL.US')).toBe('AAPL');
    expect(toFinnhubQuoteSymbol('AIR.FR')).toBe('AIR.PA');
  });
});

describe('fetchFinnhubQuote', () => {
  it('combines the quote and profile endpoints', async () => {
    mockJsonFetch([
      { match: '/quote', body: { c: 150, d: 2, dp: 1.35, o: 148, h: 151, l: 147, pc: 148 } },
      { match: '/stock/profile2', body: { name: 'Acme Corp', finnhubIndustry: 'Technology', exchange: 'NASDAQ' } },
    ]);
    const quote = await fetchFinnhubQuote('AAPL.US', 'key');
    expect(quote).toEqual({
      symbol: 'AAPL', price: 150, change: 2, changePercent: 1.35, open: 148, high: 151, low: 147, prevClose: 148,
      companyName: 'Acme Corp', industry: 'Technology', exchange: 'NASDAQ',
    });
  });

  it('returns null when Finnhub returns the all-zero "not covered" quote', async () => {
    mockJsonFetch([
      { match: '/quote', body: { c: 0, d: 0, dp: 0, o: 0, h: 0, l: 0, pc: 0 } },
      { match: '/stock/profile2', body: {} },
    ]);
    expect(await fetchFinnhubQuote('AIR.FR', 'key')).toBeNull();
  });
});

describe('getQuote', () => {
  it('returns the Finnhub quote without calling Yahoo when Finnhub succeeds', async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes('/quote')) return Promise.resolve({ ok: true, json: async () => ({ c: 150, d: 1, dp: 1, o: 1, h: 1, l: 1, pc: 1 }) });
      if (url.includes('/stock/profile2')) return Promise.resolve({ ok: true, json: async () => ({ name: 'Acme' }) });
      throw new Error('Yahoo should not be called when Finnhub succeeds');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const quote = await getQuote('AAPL.US', 'key');
    expect(quote).toMatchObject({ price: 150, companyName: 'Acme' });
  });

  it('falls back to Yahoo when Finnhub is not covered (all-zero quote)', async () => {
    mockJsonFetch([
      { match: '/quote', body: { c: 0, d: 0, dp: 0, o: 0, h: 0, l: 0, pc: 0 } },
      { match: '/stock/profile2', body: {} },
      { match: 'query1.finance.yahoo.com', body: yahooChart() },
    ]);
    const quote = await getQuote('AIR.FR', 'key');
    expect(quote).toMatchObject({ price: 110, companyName: 'Acme Corp' });
  });

  it('goes straight to Yahoo when no Finnhub API key is configured', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: yahooChart() }]);
    const quote = await getQuote('AIR.FR', undefined);
    expect(quote).toMatchObject({ price: 110 });
  });
});

describe('toTwelveDataParams', () => {
  it('passes US tickers through with no exchange', () => {
    expect(toTwelveDataParams('AAPL.US')).toEqual({ symbol: 'AAPL' });
  });

  it('maps a known suffix to its Twelve Data exchange name', () => {
    expect(toTwelveDataParams('AIR.FR')).toEqual({ symbol: 'AIR', exchange: 'Euronext' });
    expect(toTwelveDataParams('FB2A.DE')).toEqual({ symbol: 'FB2A', exchange: 'XETRA' });
  });

  it('omits the exchange for an unrecognized suffix', () => {
    expect(toTwelveDataParams('XYZ.ZZ')).toEqual({ symbol: 'XYZ' });
  });
});

describe('fetchTwelveDataHistory', () => {
  it('reverses Twelve Data\'s most-recent-first order into chronological order', async () => {
    mockJsonFetch([{ match: 'api.twelvedata.com', body: { values: [{ datetime: '2024-01-03', close: '12' }, { datetime: '2024-01-02', close: '11' }, { datetime: '2024-01-01', close: '10' }] } }]);
    const points = await fetchTwelveDataHistory('AAPL.US', '30', 'key');
    expect(points).toEqual([
      { date: '2024-01-01', close: 10 },
      { date: '2024-01-02', close: 11 },
      { date: '2024-01-03', close: 12 },
    ]);
  });

  it('returns null on an error response', async () => {
    mockJsonFetch([{ match: 'api.twelvedata.com', body: { status: 'error', message: 'not covered by your plan' } }]);
    expect(await fetchTwelveDataHistory('AIR.FR', '30', 'key')).toBeNull();
  });
});

describe('getHistory', () => {
  it('returns Twelve Data points without calling Yahoo when Twelve Data succeeds', async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes('api.twelvedata.com')) return Promise.resolve({ ok: true, json: async () => ({ values: [{ datetime: '2024-01-02', close: '11' }, { datetime: '2024-01-01', close: '10' }] }) });
      throw new Error('Yahoo should not be called when Twelve Data succeeds');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const points = await getHistory('AAPL.US', '30', 'key');
    expect(points).toEqual([{ date: '2024-01-01', close: 10 }, { date: '2024-01-02', close: 11 }]);
  });

  it('falls back to Yahoo when Twelve Data errors out', async () => {
    mockJsonFetch([
      { match: 'api.twelvedata.com', body: { status: 'error' } },
      { match: 'query1.finance.yahoo.com', body: yahooChart() },
    ]);
    const points = await getHistory('AIR.FR', '30', 'key');
    expect(points).toEqual([
      { date: '2023-11-14', close: 100 },
      { date: '2023-11-15', close: 105 },
      { date: '2023-11-16', close: 110 },
    ]);
  });

  it('goes straight to Yahoo when no Twelve Data API key is configured', async () => {
    mockJsonFetch([{ match: 'query1.finance.yahoo.com', body: yahooChart() }]);
    const points = await getHistory('AIR.FR', '30', undefined);
    expect(points).not.toBeNull();
  });
});
