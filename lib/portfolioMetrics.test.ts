import { describe, it, expect } from 'vitest';
import {
  calcTotalValue,
  calcTotalInvested,
  buildPortfolioSeries,
  buildLinePath,
  calcWeightedAvgDaysHeld,
  calcAnnualizedReturn,
} from './portfolioMetrics';

describe('calcTotalValue', () => {
  it('uses the live price when available', () => {
    const holdings = [{ ticker: 'AAPL', units: 10, avg_price: 100 }];
    expect(calcTotalValue(holdings, () => 150)).toBe(1500);
  });

  it('falls back to avg_price when no live price is available', () => {
    const holdings = [{ ticker: 'AAPL', units: 10, avg_price: 100 }];
    expect(calcTotalValue(holdings, () => undefined)).toBe(1000);
  });

  it('sums across multiple holdings', () => {
    const holdings = [
      { ticker: 'AAPL', units: 10, avg_price: 100 },
      { ticker: 'MSFT', units: 2, avg_price: 300 },
    ];
    const prices: Record<string, number> = { AAPL: 150, MSFT: 320 };
    expect(calcTotalValue(holdings, t => prices[t])).toBe(150 * 10 + 320 * 2);
  });
});

describe('calcTotalInvested', () => {
  it('sums units * avg_price across holdings', () => {
    const holdings = [
      { ticker: 'AAPL', units: 10, avg_price: 100 },
      { ticker: 'MSFT', units: 2, avg_price: 300 },
    ];
    expect(calcTotalInvested(holdings)).toBe(1000 + 600);
  });
});

describe('buildPortfolioSeries', () => {
  const holdings = [
    { ticker: 'AAPL', units: 2, avg_price: 100 },
    { ticker: 'MSFT', units: 1, avg_price: 200 },
  ];

  it('combines per-ticker histories into a single total-value series', () => {
    const histories = [
      [{ date: '2024-01-01', close: 110 }, { date: '2024-01-02', close: 120 }],
      [{ date: '2024-01-01', close: 210 }, { date: '2024-01-02', close: 220 }],
    ];
    expect(buildPortfolioSeries(holdings, histories)).toEqual([
      2 * 110 + 1 * 210,
      2 * 120 + 1 * 220,
    ]);
  });

  it('forward-fills a ticker missing on a given date with its last known close', () => {
    const histories = [
      [{ date: '2024-01-01', close: 110 }, { date: '2024-01-02', close: 120 }, { date: '2024-01-03', close: 130 }],
      [{ date: '2024-01-01', close: 210 }], // MSFT has no data for 01-02/01-03
    ];
    expect(buildPortfolioSeries(holdings, histories)).toEqual([
      2 * 110 + 1 * 210,
      2 * 120 + 1 * 210, // forward-filled from 01-01
      2 * 130 + 1 * 210,
    ]);
  });

  it('falls back to avg_price for a ticker with no history at all yet', () => {
    const histories = [
      [{ date: '2024-01-01', close: 110 }, { date: '2024-01-02', close: 120 }],
      null,
    ];
    expect(buildPortfolioSeries(holdings, histories)).toEqual([
      2 * 110 + 1 * 200, // MSFT falls back to avg_price (200)
      2 * 120 + 1 * 200,
    ]);
  });

  it('uses the longest available history as the backbone of dates', () => {
    const histories = [
      [{ date: '2024-01-01', close: 110 }],
      [{ date: '2024-01-01', close: 210 }, { date: '2024-01-02', close: 220 }, { date: '2024-01-03', close: 230 }],
    ];
    expect(buildPortfolioSeries(holdings, histories)).toHaveLength(3);
  });

  it('returns null when there is no history at all', () => {
    expect(buildPortfolioSeries(holdings, [null, null])).toBeNull();
  });

  it('returns null when the resulting series has fewer than 2 points', () => {
    const histories = [[{ date: '2024-01-01', close: 110 }], null];
    expect(buildPortfolioSeries(holdings, histories)).toBeNull();
  });
});

describe('buildLinePath', () => {
  it('builds an SVG path that starts at the first value and ends at the last', () => {
    const { line } = buildLinePath([10, 20, 10], { width: 100, height: 50, padding: 0 });
    expect(line.startsWith('M0,50')).toBe(true); // min value -> bottom of viewBox
    expect(line).toContain('L100,50');
  });

  it('closes the area path back down to the x-axis', () => {
    const { area } = buildLinePath([10, 20], { width: 100, height: 50 });
    expect(area.endsWith('L100,50 L0,50 Z')).toBe(true);
  });

  it('does not divide by zero when all values are equal', () => {
    const { line } = buildLinePath([42, 42, 42], { width: 100, height: 50 });
    expect(line).not.toContain('NaN');
  });
});

describe('calcWeightedAvgDaysHeld', () => {
  it('returns 365 when there are no buy transactions', () => {
    expect(calcWeightedAvgDaysHeld([])).toBe(365);
  });

  it('weights days-held by the amount of each buy', () => {
    const now = new Date('2024-06-01T00:00:00.000Z').getTime();
    const buys = [
      { amount: -100, executed_at: '2024-01-01T00:00:00.000Z' }, // held longer, smaller amount
      { amount: -900, executed_at: '2024-05-01T00:00:00.000Z' }, // held less, bigger amount
    ];
    const result = calcWeightedAvgDaysHeld(buys, now);
    // Dominated by the larger, more recent buy -> closer to ~31 days than ~152 days
    expect(result).toBeLessThan(60);
    expect(result).toBeGreaterThan(30);
  });

  it('clamps the result to at least 30 days', () => {
    const now = new Date('2024-01-02T00:00:00.000Z').getTime();
    const buys = [{ amount: -100, executed_at: '2024-01-01T00:00:00.000Z' }];
    expect(calcWeightedAvgDaysHeld(buys, now)).toBe(30);
  });
});

describe('calcAnnualizedReturn', () => {
  it('returns the same percentage when avgDaysHeld is exactly 365', () => {
    expect(calcAnnualizedReturn(10, 365)).toBeCloseTo(10, 5);
  });

  it('annualizes a short holding period into a larger percentage', () => {
    const result = calcAnnualizedReturn(10, 30);
    expect(result).toBeGreaterThan(10);
  });

  it('annualizes a longer holding period into a smaller percentage', () => {
    const result = calcAnnualizedReturn(50, 365 * 3);
    expect(result).toBeLessThan(50);
  });
});
