import { describe, it, expect } from 'vitest';
import { calcQualityEngineScore, qualityEngineLabel } from './qualityEngine';
import type { QualityEngineInput } from './types';

const GOOD_INPUT: QualityEngineInput = {
  peTTM: 12, psTTM: 1.5, evRevenueTTM: 1.5,
  currentRatioAnnual: 2.5, debtToEquityAnnual: 0.2, roeTTM: 25, operatingMarginTTM: 35,
  revenueGrowthTTMYoy: 25, epsGrowthTTMYoy: 28, avgEarningsSurprisePct: 4,
};

const BAD_INPUT: QualityEngineInput = {
  peTTM: 60, psTTM: 18, evRevenueTTM: 18,
  currentRatioAnnual: 0.5, debtToEquityAnnual: 4, roeTTM: -5, operatingMarginTTM: 2,
  revenueGrowthTTMYoy: -12, epsGrowthTTMYoy: -25, avgEarningsSurprisePct: -6,
};

describe('calcQualityEngineScore', () => {
  it('gives a higher total to good fundamentals than bad fundamentals', () => {
    const good = calcQualityEngineScore(GOOD_INPUT);
    const bad = calcQualityEngineScore(BAD_INPUT);
    expect(good.total).toBeGreaterThan(bad.total);
  });

  it('total and sub-scores are clamped between 0 and 100', () => {
    for (const input of [GOOD_INPUT, BAD_INPUT]) {
      const r = calcQualityEngineScore(input);
      for (const v of [r.total, r.valuationScore, r.financialHealthScore, r.growthScore]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('missing metrics fall back to neutral rather than crashing', () => {
    const r = calcQualityEngineScore({});
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('label matches the total score band', () => {
    expect(calcQualityEngineScore(GOOD_INPUT).label).toBe(qualityEngineLabel(calcQualityEngineScore(GOOD_INPUT).total));
  });
});

describe('qualityEngineLabel', () => {
  it('classifies scores per the spec thresholds', () => {
    expect(qualityEngineLabel(85)).toBe('excellent');
    expect(qualityEngineLabel(70)).toBe('good');
    expect(qualityEngineLabel(55)).toBe('average');
    expect(qualityEngineLabel(40)).toBe('weak');
    expect(qualityEngineLabel(10)).toBe('poor');
  });

  it('is monotonic at the boundaries', () => {
    expect(qualityEngineLabel(80)).toBe('excellent');
    expect(qualityEngineLabel(79)).toBe('good');
    expect(qualityEngineLabel(65)).toBe('good');
    expect(qualityEngineLabel(64)).toBe('average');
  });
});
