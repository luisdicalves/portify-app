import { describe, it, expect } from 'vitest';
import {
  classifyDebtCost,
  classifyDebtMateriality,
  calcCostMaterialityCap,
  calcDebtBurdenCap,
  evaluateDebtAdapter,
  type DebtAdapterInput,
} from './debtAdapter';

const ECB_DFR = 0.03; // 3%

describe('classifyDebtCost', () => {
  // boundaries at ECB_DFR=3%: low=max(4%,4.5%)=4.5%, high=max(8%,8%)=8%, extreme=max(15%,13%)=15%
  it.each([
    [0.03, 'LOW'],
    [0.045, 'LOW'],
    [0.05, 'MODERATE'],
    [0.08, 'HIGH'],
    [0.10, 'HIGH'],
    [0.15, 'EXTREME'],
    [0.25, 'EXTREME'],
  ] as const)('classifies %d as %s', (cost, band) => {
    expect(classifyDebtCost(cost, ECB_DFR)).toBe(band);
  });

  it('floors LOW/HIGH/EXTREME at the fixed absolute minima when ECB DFR is very low', () => {
    // ECB_DFR=0 -> low=max(4%,1.5%)=4%, high=max(8%,5%)=8%, extreme=max(15%,10%)=15%
    expect(classifyDebtCost(0.04, 0)).toBe('LOW');
    expect(classifyDebtCost(0.08, 0)).toBe('HIGH');
    expect(classifyDebtCost(0.15, 0)).toBe('EXTREME');
  });
});

describe('classifyDebtMateriality', () => {
  it('is IMMATERIAL at the 1-month boundary', () => {
    const { safeRepaymentMonths, materiality } = classifyDebtMateriality(1000, 0, 1000);
    expect(safeRepaymentMonths).toBe(1);
    expect(materiality).toBe('IMMATERIAL');
  });

  it('is MATERIAL just above 1 month and at the 6-month boundary', () => {
    expect(classifyDebtMateriality(1100, 0, 1000).materiality).toBe('MATERIAL');
    expect(classifyDebtMateriality(6000, 0, 1000).materiality).toBe('MATERIAL');
  });

  it('is HIGHLY_MATERIAL above 6 months', () => {
    expect(classifyDebtMateriality(6100, 0, 1000).materiality).toBe('HIGHLY_MATERIAL');
  });

  it('nets out safe unprotected liquid assets before dividing', () => {
    const { safeRepaymentMonths } = classifyDebtMateriality(5000, 4000, 1000);
    expect(safeRepaymentMonths).toBe(1);
  });

  it('is MATERIALITY_UNKNOWN when there is no repayment surplus', () => {
    expect(classifyDebtMateriality(1000, 0, 0).materiality).toBe('MATERIALITY_UNKNOWN');
  });
});

describe('calcCostMaterialityCap', () => {
  it('is 1 (no restriction) at the LOW cost anchor regardless of materiality', () => {
    expect(calcCostMaterialityCap(0.03, ECB_DFR, 12)).toBe(1);
  });

  it('is more restrictive at the EXTREME cost anchor (0.15) than at HIGH (0.08) for the same materiality', () => {
    const high = calcCostMaterialityCap(0.08, ECB_DFR, 12);
    const extreme = calcCostMaterialityCap(0.15, ECB_DFR, 12);
    expect(extreme).toBeLessThan(high);
  });

  it('is 0 at the EXTREME anchor with high materiality (C=1 saturates the cap to 0)', () => {
    expect(calcCostMaterialityCap(0.15, ECB_DFR, 12)).toBe(0);
  });

  it('materiality does not restrict further when cost is LOW (G=min(1,2C)=0)', () => {
    const shortRepay = calcCostMaterialityCap(0.03, ECB_DFR, 1);
    const longRepay = calcCostMaterialityCap(0.03, ECB_DFR, 24);
    expect(shortRepay).toBe(1);
    expect(longRepay).toBe(1);
  });
});

describe('calcDebtBurdenCap', () => {
  it('is 100% at and below the Q=50% boundary', () => {
    expect(calcDebtBurdenCap(500, 2000, 1000, 0)).toEqual({ cap: 1, affordabilityFail: false, stressedDebtServiceMonthly: 500 });
  });

  it('is linear between Q=50% and Q=100%', () => {
    const { cap } = calcDebtBurdenCap(750, 2000, 1000, 0); // available=1000, Q=75%
    expect(cap).toBeCloseTo(0.5);
  });

  it('is AFFORDABILITY_FAIL / cap 0 at and above Q=100%', () => {
    const result = calcDebtBurdenCap(1000, 2000, 1000, 0); // available=1000, Q=100%
    expect(result.cap).toBe(0);
    expect(result.affordabilityFail).toBe(true);
  });

  it('is AFFORDABILITY_FAIL when income does not cover essential non-debt expenses (D8)', () => {
    const result = calcDebtBurdenCap(100, 900, 1000, 0); // available = -100
    expect(result.cap).toBe(0);
    expect(result.affordabilityFail).toBe(true);
  });

  it('applies the rate shock proportionally to the monthly debt service', () => {
    const result = calcDebtBurdenCap(500, 2000, 1000, 200); // +200bp
    expect(result.stressedDebtServiceMonthly).toBeCloseTo(510);
  });
});

const BASE: DebtAdapterInput = {
  effectiveDebtCostAnnualPct: 0.03,
  ecbDepositFacilityRatePct: ECB_DFR,
  debtBalance: 1000,
  safeUnprotectedLiquidAssets: 0,
  sustainableDebtRepaymentSurplus: 1000, // safeRepaymentMonths = 1 -> IMMATERIAL
  requiredDebtServiceMonthly: 300,
  sustainableMonthlyIncome: 2000,
  essentialNonDebtExpensesMonthly: 1000, // available = 1000, Q = 30% -> cap 1
  debtRateType: 'FIXED',
  hasPaymentArrearsOrStress: false,
};

describe('evaluateDebtAdapter', () => {
  it('gives cap 1 for a low-cost, immaterial, affordable, fixed-rate debt', () => {
    const result = evaluateDebtAdapter(BASE);
    expect(result.debtRiskFundingCap).toBe(1);
    expect(result.affordabilityFail).toBe(false);
  });

  it('does not apply the rate shock when the debt is FIXED', () => {
    const result = evaluateDebtAdapter(BASE);
    expect(result.stressedBurdenCap).toBe(result.currentBurdenCap);
  });

  it('applies the +200bp rate shock and can bind the cap when the debt is VARIABLE', () => {
    const result = evaluateDebtAdapter({
      ...BASE,
      debtRateType: 'VARIABLE',
      requiredDebtServiceMonthly: 495, // available=1000, current Q=49.5% (just under 50%), stressed Q rises with +200bp
    });
    expect(result.reasons).toContain('RATE_STRESS_BINDING');
    expect(result.stressedBurdenCap).toBeLessThan(result.currentBurdenCap);
    expect(result.debtRiskFundingCap).toBe(result.rateAwareBurdenCap);
  });

  it('overrides the cap to 0 on payment arrears/stress regardless of every other input', () => {
    const result = evaluateDebtAdapter({ ...BASE, hasPaymentArrearsOrStress: true });
    expect(result.debtRiskFundingCap).toBe(0);
    expect(result.reasons[0]).toBe('PAYMENT_ARREARS_OR_STRESS');
  });

  it('takes the MIN of the cost/materiality cap and the rate-aware burden cap', () => {
    const result = evaluateDebtAdapter({
      ...BASE,
      effectiveDebtCostAnnualPct: 0.20, // EXTREME -> costMaterialityCap likely 0
    });
    expect(result.debtRiskFundingCap).toBe(Math.min(result.costMaterialityCap, result.rateAwareBurdenCap));
    expect(result.reasons).toContain('DEBT_COST_EXTREME');
  });

  it('surfaces income confidence below HIGH as a warning without changing the cap', () => {
    const confident = evaluateDebtAdapter(BASE);
    const lessConfident = evaluateDebtAdapter({ ...BASE, incomeConfidence: 'LOW' });
    expect(lessConfident.debtRiskFundingCap).toBe(confident.debtRiskFundingCap);
    expect(lessConfident.reasons).toContain('INCOME_CONFIDENCE_LOW');
  });

  it('attaches governance meta', () => {
    const result = evaluateDebtAdapter(BASE);
    expect(result.meta?.modelName).toBe('debtAdapter');
  });
});
