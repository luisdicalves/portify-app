import { describe, it, expect } from 'vitest';
import {
  calcXIRR,
  calcTWR,
  calcWealthChangeWaterfall,
  evaluatePerformance,
  type CashFlow,
  type ValuationPoint,
} from './performanceEngine';

describe('calcXIRR', () => {
  it('solves the textbook single-flow case (~10% annual)', () => {
    const flows: CashFlow[] = [
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ];
    expect(calcXIRR(flows)).toBeCloseTo(0.10, 2);
  });

  it('solves for irregular multi-flow contributions', () => {
    const flows: CashFlow[] = [
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-07-01', amount: -500 },
      { date: '2025-01-01', amount: 1800 },
    ];
    const rate = calcXIRR(flows);
    expect(rate).not.toBeNull();
    // Verify it actually zeroes NPV at the solved rate (round-trip check).
    const t0 = flows[0].date;
    const check = flows.reduce((sum, cf) => {
      const years = (new Date(cf.date).getTime() - new Date(t0).getTime()) / 86400000 / 365;
      return sum + cf.amount / Math.pow(1 + (rate as number), years);
    }, 0);
    expect(check).toBeCloseTo(0, 4);
  });

  it('returns null when every flow has the same sign (no solution)', () => {
    const flows: CashFlow[] = [
      { date: '2025-01-01', amount: 1000 },
      { date: '2026-01-01', amount: 500 },
    ];
    expect(calcXIRR(flows)).toBeNull();
  });

  it('returns null for fewer than 2 cash flows', () => {
    expect(calcXIRR([{ date: '2025-01-01', amount: 1000 }])).toBeNull();
    expect(calcXIRR([])).toBeNull();
  });

  it('converges to the same answer from a different initial guess', () => {
    const flows: CashFlow[] = [
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ];
    expect(calcXIRR(flows, 0.5)).toBeCloseTo(calcXIRR(flows, 0.1) as number, 4);
  });
});

describe('calcTWR', () => {
  it('equals the simple end-to-end return when there are no external flows', () => {
    const series: ValuationPoint[] = [
      { date: '2025-01-01', value: 1000 },
      { date: '2025-06-01', value: 1100 },
      { date: '2026-01-01', value: 1210 },
    ];
    const { twr } = calcTWR(series, []);
    expect(twr).toBeCloseTo(0.21, 6); // 1210/1000 - 1
  });

  it('is not distorted by a large contribution right before a drop (unlike a simple return)', () => {
    // Start 1000 -> grows to 1100 (no flow) -> a 5000 contribution lands
    // exactly when the series is next valued at 6100 (so the sub-period
    // return around the contribution is 0%) -> portfolio then drops 10% to 5490.
    const series: ValuationPoint[] = [
      { date: '2025-01-01', value: 1000 },
      { date: '2025-04-01', value: 1100 },
      { date: '2025-07-01', value: 6100 }, // 1100 + 5000 contribution, flat sub-period return
      { date: '2026-01-01', value: 5490 }, // -10% sub-period
    ];
    const flows: CashFlow[] = [{ date: '2025-07-01', amount: 5000 }];
    const { twr } = calcTWR(series, flows);
    // (1100/1000) * (6100-5000)/1100 * (5490/6100) - 1 = 1.1 * 1.0 * 0.9 - 1 = -0.01
    expect(twr).toBeCloseTo(-0.01, 6);

    const naiveReturn = (5490 - 1000 - 5000) / 1000; // wildly different, illustrates why naive % is wrong
    expect(twr).not.toBeCloseTo(naiveReturn, 2);
  });

  it('counts a flow whose date has no matching valuation point as unaligned, without crashing', () => {
    const series: ValuationPoint[] = [
      { date: '2025-01-01', value: 1000 },
      { date: '2026-01-01', value: 1100 },
    ];
    const flows: CashFlow[] = [{ date: '2025-06-15', amount: 200 }];
    const { twr, unalignedFlowCount } = calcTWR(series, flows);
    expect(unalignedFlowCount).toBe(1);
    expect(twr).toBeCloseTo(0.10, 6); // flow ignored in the calc since it doesn't align
  });

  it('returns null with fewer than 2 valuation points', () => {
    expect(calcTWR([], []).twr).toBeNull();
    expect(calcTWR([{ date: '2025-01-01', value: 1000 }], []).twr).toBeNull();
  });

  it('returns null when a sub-period starts from a zero/negative base', () => {
    const series: ValuationPoint[] = [
      { date: '2025-01-01', value: 0 },
      { date: '2026-01-01', value: 1000 },
    ];
    expect(calcTWR(series, []).twr).toBeNull();
  });
});

describe('calcWealthChangeWaterfall', () => {
  it('decomposes start/end value against contributions and withdrawals', () => {
    const flows: CashFlow[] = [
      { date: '2025-03-01', amount: 500 },
      { date: '2025-09-01', amount: -200 },
    ];
    const result = calcWealthChangeWaterfall(1000, 1400, flows);
    expect(result).toEqual({
      startValue: 1000,
      contributions: 500,
      withdrawals: 200,
      investmentGainLoss: 100, // 1400 - 1000 - 500 + 200
      endValue: 1400,
    });
  });

  it('satisfies the identity endValue = startValue + contributions - withdrawals + investmentGainLoss', () => {
    const flows: CashFlow[] = [{ date: '2025-03-01', amount: 300 }, { date: '2025-06-01', amount: -100 }];
    const w = calcWealthChangeWaterfall(2000, 2500, flows);
    expect(w.startValue + w.contributions - w.withdrawals + w.investmentGainLoss).toBeCloseTo(w.endValue, 8);
  });

  it('handles no external flows', () => {
    const result = calcWealthChangeWaterfall(1000, 1100, []);
    expect(result.contributions).toBe(0);
    expect(result.withdrawals).toBe(0);
    expect(result.investmentGainLoss).toBe(100);
  });
});

describe('evaluatePerformance', () => {
  const HAPPY_INPUT = {
    valuationSeries: [
      { date: '2025-01-01', value: 1000 },
      { date: '2026-01-01', value: 1200 },
    ],
    externalFlows: [] as CashFlow[],
  };

  it('produces twr, xirr and the waterfall together in the happy path', () => {
    const result = evaluatePerformance(HAPPY_INPUT);
    expect(result.twr).toBeCloseTo(0.20, 6);
    expect(result.xirr).not.toBeNull();
    expect(result.wealthChangeWaterfall.endValue).toBe(1200);
    expect(result.reasons).toEqual([]);
  });

  it('flags TWR_INSUFFICIENT_DATA when there are fewer than 2 valuation points', () => {
    const result = evaluatePerformance({ valuationSeries: [{ date: '2025-01-01', value: 1000 }], externalFlows: [] });
    expect(result.twr).toBeNull();
    expect(result.reasons).toContain('TWR_INSUFFICIENT_DATA');
  });

  it('flags UNALIGNED_EXTERNAL_FLOWS when a flow date has no matching valuation point', () => {
    const result = evaluatePerformance({
      ...HAPPY_INPUT,
      externalFlows: [{ date: '2025-05-01', amount: 100 }],
    });
    expect(result.reasons).toContain('UNALIGNED_EXTERNAL_FLOWS');
  });

  it('attaches governance meta', () => {
    const result = evaluatePerformance(HAPPY_INPUT);
    expect(result.meta?.modelName).toBe('performanceEngine');
  });
});
