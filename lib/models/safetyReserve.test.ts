import { describe, it, expect } from 'vitest';
import {
  calcTargetReserveMonths,
  calcImmediateMonths,
  calcRiskFundingCapFromCoverage,
  evaluateSafetyReserve,
  type SafetyReserveInput,
} from './safetyReserve';

const BASE: SafetyReserveInput = {
  incomeStability: 'STABLE_RECURRING_OR_PENSION',
  sustainableIncomeSource: 'NONE',
  hasFinancialDependents: false,
  debtToNetIncomeRatio: 0,
  materialFinancialChangeExpected12m: false,
  essentialMonthlyOutlays: 1000,
  nearTermKnownEssentialOutlays: 0,
  currentReserveAmount: 3000, // = targetReserveMonths(3) × 1000 -> 100% coverage
  immediatelyAvailableAmount: 1000,
  protectedCapitalForKnownOutlays: 0,
  hasPaymentArrearsOrDifficulty: false,
  hasHighCostRevolvingDebtConfirmed: false,
  criticalDataStatus: 'USABLE',
};

describe('calcTargetReserveMonths', () => {
  it('is 3 (the floor) for the most stable profile', () => {
    expect(calcTargetReserveMonths(BASE)).toBe(3);
  });

  it.each([
    ['STABLE_RECURRING_OR_PENSION', 3],
    ['VARIABLE_OR_TEMPORARY_CONTRACT', 4.5],
    ['SELF_EMPLOYED_HIGHLY_VARIABLE', 5.5],
    ['NO_RELIABLE_INCOME', 7],
  ] as const)('income addon for %s -> %d months', (incomeStability, expected) => {
    expect(calcTargetReserveMonths({ ...BASE, incomeStability })).toBe(expected);
  });

  it('adds 1 month for financial dependents', () => {
    expect(calcTargetReserveMonths({ ...BASE, hasFinancialDependents: true })).toBe(4);
  });

  it.each([
    [0.10, 3],
    [0.20, 3.5],
    [0.35, 4],
    [0.45, 4.5],
    [0.60, 5.5],
  ])('debt addon for ratio %d -> %d months', (debtToNetIncomeRatio, expected) => {
    expect(calcTargetReserveMonths({ ...BASE, debtToNetIncomeRatio })).toBe(expected);
  });

  it('adds 1 month for an expected material financial change', () => {
    expect(calcTargetReserveMonths({ ...BASE, materialFinancialChangeExpected12m: true })).toBe(4);
  });

  it('stacks every add-on to its real maximum, below the 12-month ceiling', () => {
    // 3 (floor) + 4 (no reliable income) + 1 (dependents) + 2.5 (debt >50%) + 1 (change) = 11.5.
    // The §6.4 add-on table tops out at 11.5, so the clamp(..., 12) ceiling is a
    // defensive bound, not reachable by any real combination of these add-ons.
    const months = calcTargetReserveMonths({
      ...BASE,
      incomeStability: 'NO_RELIABLE_INCOME',
      hasFinancialDependents: true,
      debtToNetIncomeRatio: 0.9,
      materialFinancialChangeExpected12m: true,
    });
    expect(months).toBe(11.5);
  });
});

describe('calcImmediateMonths', () => {
  it('clamps at the 1-month floor for a short target', () => {
    expect(calcImmediateMonths(3)).toBe(1);
  });

  it('is 25% of the target inside the band', () => {
    expect(calcImmediateMonths(6)).toBe(1.5);
  });

  it('clamps at the 2-month ceiling for a long target', () => {
    expect(calcImmediateMonths(12)).toBe(2);
  });
});

describe('calcRiskFundingCapFromCoverage', () => {
  it('is 0 at and below 50% coverage', () => {
    expect(calcRiskFundingCapFromCoverage(0)).toBe(0);
    expect(calcRiskFundingCapFromCoverage(50)).toBe(0);
  });

  it('is linear between 50% and 100%', () => {
    expect(calcRiskFundingCapFromCoverage(62.5)).toBeCloseTo(0.25);
    expect(calcRiskFundingCapFromCoverage(75)).toBeCloseTo(0.5);
    expect(calcRiskFundingCapFromCoverage(87.5)).toBeCloseTo(0.75);
  });

  it('is 1 at and above 100% coverage', () => {
    expect(calcRiskFundingCapFromCoverage(100)).toBe(1);
    expect(calcRiskFundingCapFromCoverage(150)).toBe(1);
  });
});

describe('evaluateSafetyReserve', () => {
  it('PASSes with cap 1 for a fully-covered, clean profile', () => {
    const result = evaluateSafetyReserve(BASE);
    expect(result.gateResult).toBe('PASS');
    expect(result.riskFundingCap).toBe(1);
    expect(result.reasons).toEqual([]);
  });

  it('BLOCKs on payment arrears regardless of coverage', () => {
    const result = evaluateSafetyReserve({ ...BASE, hasPaymentArrearsOrDifficulty: true });
    expect(result.gateResult).toBe('BLOCK');
    expect(result.riskFundingCap).toBe(0);
    expect(result.reasons).toContain('PAYMENT_ARREARS_OR_DIFFICULTY');
  });

  it('BLOCKs when immediate coverage is below 50%', () => {
    const result = evaluateSafetyReserve({ ...BASE, immediatelyAvailableAmount: 100 });
    expect(result.gateResult).toBe('BLOCK');
    expect(result.riskFundingCap).toBe(0);
    expect(result.reasons).toContain('IMMEDIATE_COVERAGE_BELOW_50');
  });

  it('BLOCKs when near-term protection is below 100%', () => {
    const result = evaluateSafetyReserve({
      ...BASE,
      nearTermKnownEssentialOutlays: 500,
      protectedCapitalForKnownOutlays: 100,
    });
    expect(result.gateResult).toBe('BLOCK');
    expect(result.riskFundingCap).toBe(0);
    expect(result.reasons).toContain('NEAR_TERM_PROTECTION_BELOW_100');
  });

  it('is CONDITIONAL with cap 0 for confirmed high-cost revolving debt', () => {
    const result = evaluateSafetyReserve({ ...BASE, hasHighCostRevolvingDebtConfirmed: true });
    expect(result.gateResult).toBe('CONDITIONAL');
    expect(result.riskFundingCap).toBe(0);
    expect(result.reasons).toContain('HIGH_COST_REVOLVING_DEBT_CONFIRMED');
  });

  it('is CONDITIONAL with cap 0 for no reliable income without a sustainable source', () => {
    const result = evaluateSafetyReserve({
      ...BASE,
      incomeStability: 'NO_RELIABLE_INCOME',
      sustainableIncomeSource: 'NONE',
      currentReserveAmount: 7000, // targetReserveMonths(7) x 1000 -> 100% coverage, isolating this gate
    });
    expect(result.gateResult).toBe('CONDITIONAL');
    expect(result.riskFundingCap).toBe(0);
    expect(result.reasons).toContain('NO_RELIABLE_INCOME_WITHOUT_SUSTAINABLE_SOURCE');
  });

  it('does not trigger the income-continuity gate when a sustainable source is present', () => {
    const result = evaluateSafetyReserve({
      ...BASE,
      incomeStability: 'NO_RELIABLE_INCOME',
      sustainableIncomeSource: 'STABLE_PENSION',
      currentReserveAmount: 7000,
    });
    expect(result.reasons).not.toContain('NO_RELIABLE_INCOME_WITHOUT_SUSTAINABLE_SOURCE');
    expect(result.riskFundingCap).toBe(1);
  });

  it('BLOCKs on unusable/expired critical data ahead of every other gate', () => {
    const result = evaluateSafetyReserve({
      ...BASE,
      criticalDataStatus: 'EXPIRED',
      hasPaymentArrearsOrDifficulty: true,
    });
    expect(result.gateResult).toBe('BLOCK');
    expect(result.reasons[0]).toBe('CRITICAL_DATA_EXPIRED');
  });

  it('attaches governance meta', () => {
    const result = evaluateSafetyReserve(BASE);
    expect(result.meta?.modelName).toBe('safetyReserve');
  });
});
