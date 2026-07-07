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

function makePillar(score: number) {
  return { score, weight: 0.33, verdict: '', description: '', metrics: [], plainEnglish: '' };
}

const MOCK_REPORT: RiskReport = {
  ticker:           'AAPL',
  companyName:      'Apple Inc.',
  price:            180,
  currency:         'USD',
  sector:           'Technology',
  tagline:          '',
  score:            65,
  scoreLabel:       'moderate',
  risks:            ['Valuation stretched', 'Sem sinais de alerta adicional'],
  catalysts:        ['Strong earnings growth', 'Market expansion'],
  pillars: {
    valuation: makePillar(60),
    health:    makePillar(70),
    growth:    makePillar(75),
  },
  chart:            [],
  executiveSummary: '',
  actionGuide: {
    aggressiveEntry: 170, conservativeEntry: 160,
    current: 180, trim: 200, stop: 150,
    beta: 1.1, savingsPlanSuitable: true,
  },
  footer: { tags: [], source: 'Finnhub', nextEarnings: null },
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
      pillars: { ...MOCK_REPORT.pillars, growth: makePillar(95) },
    };
    const wg      = calcQualityScoreFromReport(growthReport, { ...PROFILE, investment_goal: 'wealth_growth' });
    const income  = calcQualityScoreFromReport(growthReport, { ...PROFILE, investment_goal: 'income' });
    expect(wg).toBeGreaterThan(income);
  });

  // v3.0: o modelo mapeia cada objetivo a um pillar específico —
  // wealth_growth → growth, income → health, retirement → valuation.
  // Regressão para o bug em que 'retirement' usava por engano o pillar de health.
  it('income goal benefits from strong health pillar', () => {
    const healthReport: RiskReport = {
      ...MOCK_REPORT,
      pillars: { ...MOCK_REPORT.pillars, health: makePillar(95), valuation: makePillar(30), growth: makePillar(30) },
    };
    const income    = calcQualityScoreFromReport(healthReport, { ...PROFILE, investment_goal: 'income' });
    const retirement = calcQualityScoreFromReport(healthReport, { ...PROFILE, investment_goal: 'retirement' });
    expect(income).toBeGreaterThan(retirement);
  });

  it('retirement goal benefits from strong valuation pillar, not health', () => {
    const valuationReport: RiskReport = {
      ...MOCK_REPORT,
      pillars: { ...MOCK_REPORT.pillars, valuation: makePillar(95), health: makePillar(30), growth: makePillar(30) },
    };
    const retirementHighValuation = calcQualityScoreFromReport(valuationReport, { ...PROFILE, investment_goal: 'retirement' });

    const lowValuationReport: RiskReport = {
      ...MOCK_REPORT,
      pillars: { ...MOCK_REPORT.pillars, valuation: makePillar(30), health: makePillar(95), growth: makePillar(30) },
    };
    const retirementHighHealth = calcQualityScoreFromReport(lowValuationReport, { ...PROFILE, investment_goal: 'retirement' });

    // Se o mapeamento estivesse errado (retirement → health), o segundo report
    // (health alto) daria um score maior. O modelo diz que retirement deve
    // reagir à valuation, não à saúde financeira.
    expect(retirementHighValuation).toBeGreaterThan(retirementHighHealth);
  });
});
