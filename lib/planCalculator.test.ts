import { describe, it, expect } from 'vitest';
import {
  calcRiskScore,
  calcPlan,
  calcFV,
  calcPMT,
  detectConflicts,
  type UserProfile,
} from './planCalculator';

const BASE: UserProfile = {
  risk_profile:     'moderate',
  investment_goal:  'wealth_growth',
  experience_level: 'intermediate',
  market_reaction:  'hold',
  financial_status: 'stable',
  liquidity_need:   'unlikely',
  horizon_years:    10,
};

describe('calcRiskScore', () => {
  it('returns a number between 0 and 100', () => {
    const score = calcRiskScore(BASE);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('very_conservative scores lower than very_aggressive', () => {
    const cons = calcRiskScore({ ...BASE, risk_profile: 'very_conservative', market_reaction: 'sell_all' });
    const agg  = calcRiskScore({ ...BASE, risk_profile: 'very_aggressive',   market_reaction: 'buy_more' });
    expect(cons).toBeLessThan(agg);
  });

  it('longer horizon increases score', () => {
    const short = calcRiskScore({ ...BASE, horizon_years: 2 });
    const long  = calcRiskScore({ ...BASE, horizon_years: 30 });
    expect(long).toBeGreaterThan(short);
  });

  it('critical liquidity need reduces score compared to never', () => {
    const critical = calcRiskScore({ ...BASE, liquidity_need: 'critical' });
    const never    = calcRiskScore({ ...BASE, liquidity_need: 'never' });
    expect(critical).toBeLessThan(never);
  });
});

describe('calcPlan', () => {
  it('returns allocation fractions that sum to 1', () => {
    const result = calcPlan(BASE);
    const total = result.allocation.stock + result.allocation.etf + result.allocation.bond_etf;
    expect(total).toBeCloseTo(1, 5);
  });

  it('very_conservative profile has lower stock fraction than very_aggressive', () => {
    const cons = calcPlan({ ...BASE, risk_profile: 'very_conservative' });
    const agg  = calcPlan({ ...BASE, risk_profile: 'very_aggressive'   });
    expect(cons.allocation.stock).toBeLessThan(agg.allocation.stock);
  });

  it('returns rate within a plausible range', () => {
    const { rate } = calcPlan(BASE);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.2); // sanity: less than 20% annual
  });

  it('riskScore matches calcRiskScore directly', () => {
    const direct = calcRiskScore(BASE);
    const plan   = calcPlan(BASE);
    expect(plan.riskScore).toBe(direct);
  });
});

describe('detectConflicts', () => {
  it('flags short_purchase with very short horizon', () => {
    const conflicts = detectConflicts({ ...BASE, investment_goal: 'short_purchase', horizon_years: 1 });
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('flags conservative profile with long horizon (suggests more risk)', () => {
    const conflicts = detectConflicts({ ...BASE, risk_profile: 'conservative', horizon_years: 20 });
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('returns no conflicts for a coherent profile', () => {
    const conflicts = detectConflicts(BASE);
    expect(conflicts).toHaveLength(0);
  });
});

describe('calcFV / calcPMT', () => {
  it('calcFV grows principal at the given rate', () => {
    const fv = calcFV(100, 0.07, 10);
    expect(fv).toBeGreaterThan(100 * 12 * 10); // more than simple sum
  });

  it('calcPMT is the inverse of calcFV (within 1%)', () => {
    const goal  = 100_000;
    const rate  = 0.07;
    const years = 20;
    const pmt   = calcPMT(goal, rate, years);
    const fv    = calcFV(pmt, rate, years);
    expect(Math.abs(fv - goal) / goal).toBeLessThan(0.01);
  });
});
