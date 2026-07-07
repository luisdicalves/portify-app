import { describe, it, expect } from 'vitest';
import { calcConvictionEngineScore } from './convictionEngine';
import type { ConvictionEngineInput } from './types';

const CONSISTENT_INPUT: ConvictionEngineInput = {
  quarterlyEarningsSurprisesPct: [2, 3, 2.5, 3.2, 2.8, 3.1],
  quarterlyRevenueGrowthPct: [12, 13, 12.5, 13.5, 12.8],
  quarterlyMarginsPct: [30, 31, 30.5, 31.2, 30.8],
  analystBuy: 20, analystHold: 5, analystSell: 1,
  quarterlyEpsGrowthPct: [15, 16, 15.5, 16.2],
};

const ERRATIC_INPUT: ConvictionEngineInput = {
  quarterlyEarningsSurprisesPct: [10, -15, 20, -25, 8, -12],
  quarterlyRevenueGrowthPct: [30, -10, 25, -20, 15],
  quarterlyMarginsPct: [40, 10, 35, 5, 28],
  analystBuy: 2, analystHold: 5, analystSell: 15,
  quarterlyEpsGrowthPct: [40, -30, 35, -25],
};

describe('calcConvictionEngineScore', () => {
  it('gives a higher total to consistent fundamentals than erratic ones', () => {
    const consistent = calcConvictionEngineScore(CONSISTENT_INPUT);
    const erratic = calcConvictionEngineScore(ERRATIC_INPUT);
    expect(consistent.total).toBeGreaterThan(erratic.total);
  });

  it('rewards a bullish analyst consensus over a bearish one', () => {
    const bullish = calcConvictionEngineScore({ analystBuy: 20, analystHold: 2, analystSell: 0 });
    const bearish = calcConvictionEngineScore({ analystBuy: 0, analystHold: 2, analystSell: 20 });
    expect(bullish.analystConsensus).toBeGreaterThan(bearish.analystConsensus);
  });

  it('missing series fall back to neutral rather than crashing', () => {
    const r = calcConvictionEngineScore({});
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('total and sub-scores are clamped between 0 and 100', () => {
    for (const input of [CONSISTENT_INPUT, ERRATIC_INPUT]) {
      const r = calcConvictionEngineScore(input);
      for (const v of [r.total, r.surpriseConsistency, r.revenueGrowthStability, r.marginStability, r.analystConsensus, r.epsStability]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
