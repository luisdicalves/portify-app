import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { band, toFinnhubSymbol, fetchRiskReport } from './riskScore';

describe('toFinnhubSymbol', () => {
  it('returns the base ticker unchanged when there is no suffix', () => {
    expect(toFinnhubSymbol('AAPL')).toBe('AAPL');
  });

  it('strips the .US suffix (Finnhub uses bare tickers for US stocks)', () => {
    expect(toFinnhubSymbol('AAPL.US')).toBe('AAPL');
  });

  it('passes the ticker through unchanged for a non-US suffix (not covered by free Finnhub)', () => {
    expect(toFinnhubSymbol('AIR.FR')).toBe('AIR.FR');
  });
});

describe('band', () => {
  const thresholds: [number, number][] = [[10, 90], [20, 60], [30, 30]];

  it('returns the score for the first threshold the value falls under', () => {
    expect(band(5, thresholds)).toBe(90);
    expect(band(15, thresholds)).toBe(60);
    expect(band(25, thresholds)).toBe(30);
  });

  it('returns the last threshold score when the value exceeds every limit', () => {
    expect(band(100, thresholds)).toBe(30);
  });

  it('returns a neutral 50 when the value is missing or NaN', () => {
    expect(band(null, thresholds)).toBe(50);
    expect(band(undefined, thresholds)).toBe(50);
    expect(band(NaN, thresholds)).toBe(50);
  });
});

describe('fetchRiskReport', () => {
  const PROFILE = { name: 'Acme Corp', finnhubIndustry: 'Technology', shareOutstanding: 100 };
  const RECOMMENDATION = [{ strongBuy: 10, buy: 5, hold: 2, sell: 1, strongSell: 0 }];
  const EARNINGS = [{ surprisePercent: 3 }, { surprisePercent: 4 }, { surprisePercent: -1 }, { surprisePercent: 2 }];
  const EUR_RATE = { rates: { EUR: 0.9 } };

  function mockFetch(metric: Record<string, unknown>, overrides: Partial<{ profile: unknown; recommendation: unknown; earnings: unknown; eurRate: unknown }> = {}) {
    const responses: { match: string; body: unknown; ok?: boolean }[] = [
      { match: '/stock/metric', body: { metric, series: { quarterly: { ebitda: [{ period: '2024-01', v: 100 }], salesPerShare: [{ period: '2024-01', v: 10 }] } } } },
      { match: '/stock/profile2', body: overrides.profile ?? PROFILE },
      { match: '/stock/recommendation', body: overrides.recommendation ?? RECOMMENDATION },
      { match: '/stock/earnings', body: overrides.earnings ?? EARNINGS },
      { match: 'open.er-api.com', body: overrides.eurRate ?? EUR_RATE },
    ];

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const hit = responses.find(r => url.includes(r.match));
      if (!hit) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: hit.ok ?? true, json: async () => hit.body });
    }));
  }

  beforeEach(() => {
    process.env.FINNHUB_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FINNHUB_API_KEY;
  });

  it('returns null when FINNHUB_API_KEY is not configured', async () => {
    delete process.env.FINNHUB_API_KEY;
    mockFetch({});
    expect(await fetchRiskReport('AAPL', 'pt')).toBeNull();
  });

  it('returns null when the metric endpoint fails', async () => {
    mockFetch({}, {});
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/stock/metric')) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => PROFILE });
    }));
    expect(await fetchRiskReport('AAPL', 'pt')).toBeNull();
  });

  it('returns null when the company profile has no name', async () => {
    mockFetch({ peTTM: 20 }, { profile: { finnhubIndustry: 'Technology' } });
    expect(await fetchRiskReport('AAPL', 'pt')).toBeNull();
  });

  it('scores a financially healthy, fast-growing, reasonably valued company as low risk', async () => {
    mockFetch({
      peTTM: 12, psTTM: 1.5, evRevenueTTM: 1.8,
      currentRatioAnnual: 2.2, 'totalDebt/totalEquityAnnual': 0.2, roeTTM: 35, operatingMarginTTM: 35,
      revenueGrowthTTMYoy: 25, epsGrowthTTMYoy: 30,
      beta: 0.9,
    });

    const report = await fetchRiskReport('AAPL', 'pt');

    expect(report).not.toBeNull();
    expect(report!.scoreLabel).toBe('low');
    expect(report!.score).toBeGreaterThanOrEqual(70);
    expect(report!.pillars.valuation.score).toBeGreaterThanOrEqual(70);
    expect(report!.pillars.health.score).toBeGreaterThanOrEqual(70);
    expect(report!.pillars.growth.score).toBeGreaterThanOrEqual(70);
    expect(report!.risks).toEqual(['Sem sinais de alerta relevantes nos fundamentais analisados.']);
    expect(report!.catalysts.length).toBeGreaterThan(0);
    expect(report!.actionGuide.savingsPlanSuitable).toBe(false); // beta 0.9 < 1.1
  });

  it('scores an expensive, indebted, shrinking company as high risk and lists matching risks', async () => {
    mockFetch({
      peTTM: 45, psTTM: 12, evRevenueTTM: 14,
      currentRatioAnnual: 0.6, 'totalDebt/totalEquityAnnual': 1.8, roeTTM: -5, operatingMarginTTM: 2,
      revenueGrowthTTMYoy: -8, epsGrowthTTMYoy: -10,
      beta: 1.5,
    }, { earnings: [{ surprisePercent: -5 }] });

    const report = await fetchRiskReport('AAPL', 'pt');

    expect(report).not.toBeNull();
    expect(report!.scoreLabel).toBe('high');
    expect(report!.score).toBeLessThan(50);
    expect(report!.risks).toEqual(expect.arrayContaining([
      expect.stringContaining('Valuation exigente'),
      expect.stringContaining('Endividamento elevado'),
      expect.stringContaining('Rácio corrente abaixo de 1'),
      expect.stringContaining('Receita em contração'),
    ]));
    expect(report!.actionGuide.savingsPlanSuitable).toBe(true); // beta 1.5 >= 1.1
  });

  it('converts the EBITDA/revenue chart from USD to EUR using the fetched rate', async () => {
    mockFetch({ peTTM: 20, beta: 1 }, { eurRate: { rates: { EUR: 0.5 } } });

    const report = await fetchRiskReport('AAPL', 'pt');

    // shareOutstanding=100, salesPerShare=10 -> revenue=1000 USD -> 500 EUR; ebitda=100 USD -> 50 EUR
    expect(report!.chart).toEqual([{ period: '2024-01', revenue: 500, ebitda: 50 }]);
  });

  it('falls back to a 0.92 EUR rate when the FX endpoint fails', async () => {
    mockFetch({ peTTM: 20, beta: 1 }, {});
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('open.er-api.com')) return Promise.resolve({ ok: false, json: async () => ({}) });
      if (url.includes('/stock/metric')) return Promise.resolve({ ok: true, json: async () => ({ metric: { peTTM: 20, beta: 1 }, series: { quarterly: { ebitda: [{ period: '2024-01', v: 100 }], salesPerShare: [{ period: '2024-01', v: 10 }] } } }) });
      if (url.includes('/stock/profile2')) return Promise.resolve({ ok: true, json: async () => PROFILE });
      return Promise.resolve({ ok: true, json: async () => [] });
    }));

    const report = await fetchRiskReport('AAPL', 'pt');
    expect(report!.chart[0].revenue).toBe(Math.round(1000 * 0.92));
  });

  it('produces English copy when lang is "en"', async () => {
    mockFetch({ peTTM: 20, beta: 1 });
    const report = await fetchRiskReport('AAPL', 'en');
    expect(report!.tagline).toBe('Risk analysis based on real fundamentals (no AI).');
    expect(report!.pillars.health.plainEnglish).toContain('bills and debts');
  });
});
