import { describe, it, expect } from 'vitest';
import {
  calcQualityScore,
  qualityScoreFromMetrics,
  qualityLabel,
  calcQualityScoreFromReport,
  type StockMetrics,
} from './qualityScore';
import type { RiskReport } from './riskScore';
import type { UserProfile } from './planCalculator';

const GOOD_METRICS: StockMetrics = {
  currentRatioAnnual:       2.5,
  debtToEquityAnnual:       0.3,
  freeCashFlowPerShareAnnual: 5,
  revenueGrowthTTMYoy:      0.20,
  epsGrowthTTMYoy:          0.18,
  revenueGrowth3Y:          0.15,
  roeTTM:                   0.22,
  netProfitMarginTTM:       0.25,
  grossMarginTTM:           0.60,
  beta:                     0.9,
};

const BAD_METRICS: StockMetrics = {
  currentRatioAnnual:       0.4,
  debtToEquityAnnual:       4.5,
  freeCashFlowPerShareAnnual: -2,
  revenueGrowthTTMYoy:      -0.25,
  epsGrowthTTMYoy:          -0.30,
  revenueGrowth3Y:          -0.15,
  roeTTM:                   -0.20,
  netProfitMarginTTM:       -0.10,
  grossMarginTTM:           0.05,
  beta:                     2.5,
};

describe('calcQualityScore', () => {
  it('gives a higher total to good metrics than bad metrics', () => {
    const good = calcQualityScore(GOOD_METRICS);
    const bad  = calcQualityScore(BAD_METRICS);
    expect(good.total).toBeGreaterThan(bad.total);
  });

  it('total is clamped between 0 and 100', () => {
    const good = calcQualityScore(GOOD_METRICS);
    const bad  = calcQualityScore(BAD_METRICS);
    expect(good.total).toBeGreaterThanOrEqual(0);
    expect(good.total).toBeLessThanOrEqual(100);
    expect(bad.total).toBeGreaterThanOrEqual(0);
    expect(bad.total).toBeLessThanOrEqual(100);
  });
});

describe('qualityScoreFromMetrics', () => {
  it('returns a number 0–100', () => {
    const s = qualityScoreFromMetrics(GOOD_METRICS);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('matches calcQualityScore total', () => {
    expect(qualityScoreFromMetrics(GOOD_METRICS)).toBe(calcQualityScore(GOOD_METRICS).total);
  });
});

describe('qualityLabel', () => {
  it('returns "Excelente" (or "Excellent") for high scores', () => {
    const { label } = qualityLabel(90);
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns a lower label for a low score than for a high score', () => {
    const high = qualityLabel(85);
    const low  = qualityLabel(25);
    expect(high.label).not.toBe(low.label);
  });
});

const MOCK_REPORT: RiskReport = {
  score:      65,
  scoreLabel: 'moderate',
  risks:      ['Valuation stretched', 'Sem sinais de alerta adicional'],
  catalysts:  ['Strong earnings growth', 'Market expansion'],
  pillars: {
    valuation: { score: 60, risks: [], catalysts: [] },
    health:    { score: 70, risks: [], catalysts: [] },
    growth:    { score: 75, risks: [], catalysts: [] },
  },
};

const PROFILE: UserProfile = {
  risk_profile:     'moderate',
  investment_goal:  'wealth_growth',
  experience_level: 'intermediate',
  market_reaction:  'hold',
  financial_status: 'stable',
  liquidity_need:   'unlikely',
  horizon_years:    10,
};

describe('calcQualityScoreFromReport', () => {
  it('returns a number 0–100', () => {
    const s = calcQualityScoreFromReport(MOCK_REPORT, PROFILE);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('buy_more reaction improves score vs sell_all', () => {
    const bullish = calcQualityScoreFromReport(MOCK_REPORT, { ...PROFILE, market_reaction: 'buy_more' });
    const bearish = calcQualityScoreFromReport(MOCK_REPORT, { ...PROFILE, market_reaction: 'sell_all' });
    expect(bullish).toBeGreaterThan(bearish);
  });

  it('wealth_growth goal benefits from strong growth pillar', () => {
    const growthReport: RiskReport = {
      ...MOCK_REPORT,
      pillars: { ...MOCK_REPORT.pillars, growth: { score: 95, risks: [], catalysts: [] } },
    };
    const wg      = calcQualityScoreFromReport(growthReport, { ...PROFILE, investment_goal: 'wealth_growth' });
    const income  = calcQualityScoreFromReport(growthReport, { ...PROFILE, investment_goal: 'income' });
    expect(wg).toBeGreaterThan(income);
  });
});
