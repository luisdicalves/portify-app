import { describe, it, expect } from 'vitest';
import { evaluateRiskFundingGate } from './riskFundingGate';
import { evaluateSafetyReserve, type SafetyReserveInput } from './safetyReserve';
import { evaluateDebtAdapter, type DebtAdapterInput } from './debtAdapter';

const SAFE_INPUT: SafetyReserveInput = {
  incomeStability: 'STABLE_RECURRING_OR_PENSION',
  sustainableIncomeSource: 'NONE',
  hasFinancialDependents: false,
  debtToNetIncomeRatio: 0,
  materialFinancialChangeExpected12m: false,
  essentialMonthlyOutlays: 1000,
  nearTermKnownEssentialOutlays: 0,
  currentReserveAmount: 3000,
  immediatelyAvailableAmount: 1000,
  protectedCapitalForKnownOutlays: 0,
  hasPaymentArrearsOrDifficulty: false,
  hasHighCostRevolvingDebtConfirmed: false,
  criticalDataStatus: 'USABLE',
};

const DEBT_INPUT: DebtAdapterInput = {
  effectiveDebtCostAnnualPct: 0.03,
  ecbDepositFacilityRatePct: 0.03,
  debtBalance: 1000,
  safeUnprotectedLiquidAssets: 0,
  sustainableDebtRepaymentSurplus: 1000,
  requiredDebtServiceMonthly: 300,
  sustainableMonthlyIncome: 2000,
  essentialNonDebtExpensesMonthly: 1000,
  debtRateType: 'FIXED',
  hasPaymentArrearsOrStress: false,
};

describe('evaluateRiskFundingGate', () => {
  it('PASSes with cap 1 when both engines are fully clean', () => {
    const safety = evaluateSafetyReserve(SAFE_INPUT);
    const debt = evaluateDebtAdapter(DEBT_INPUT);
    const result = evaluateRiskFundingGate(safety, debt);

    expect(result.gateResult).toBe('PASS');
    expect(result.effectiveRiskFundingCap).toBe(1);
    expect(result.reasons).toEqual([]);
  });

  it('takes the MIN of the two caps when debt is the binding constraint', () => {
    const safety = evaluateSafetyReserve(SAFE_INPUT);
    const debt = evaluateDebtAdapter({ ...DEBT_INPUT, effectiveDebtCostAnnualPct: 0.20 }); // EXTREME -> cap 0
    const result = evaluateRiskFundingGate(safety, debt);

    expect(result.effectiveRiskFundingCap).toBe(0);
    expect(result.effectiveRiskFundingCap).toBe(Math.min(safety.riskFundingCap, debt.debtRiskFundingCap));
  });

  it('takes the MIN of the two caps when safety reserve is the binding constraint', () => {
    const safety = evaluateSafetyReserve({ ...SAFE_INPUT, currentReserveAmount: 0 }); // 0% coverage -> cap 0
    const debt = evaluateDebtAdapter(DEBT_INPUT);
    const result = evaluateRiskFundingGate(safety, debt);

    expect(result.effectiveRiskFundingCap).toBe(0);
  });

  it('BLOCK from Safety Reserve dominates over a merely-restricted Debt Adapter', () => {
    const safety = evaluateSafetyReserve({ ...SAFE_INPUT, hasPaymentArrearsOrDifficulty: true });
    const debt = evaluateDebtAdapter(DEBT_INPUT); // clean, cap 1
    const result = evaluateRiskFundingGate(safety, debt);

    expect(result.gateResult).toBe('BLOCK');
  });

  it('a debt cap of 0 surfaces as CONDITIONAL when Safety Reserve itself is a clean PASS', () => {
    const safety = evaluateSafetyReserve(SAFE_INPUT);
    const debt = evaluateDebtAdapter({ ...DEBT_INPUT, hasPaymentArrearsOrStress: true }); // debt cap 0
    const result = evaluateRiskFundingGate(safety, debt);

    expect(result.gateResult).toBe('CONDITIONAL');
    expect(result.effectiveRiskFundingCap).toBe(0);
  });

  it('merges reasons from both engines', () => {
    const safety = evaluateSafetyReserve({ ...SAFE_INPUT, hasHighCostRevolvingDebtConfirmed: true });
    const debt = evaluateDebtAdapter({ ...DEBT_INPUT, hasPaymentArrearsOrStress: true });
    const result = evaluateRiskFundingGate(safety, debt);

    expect(result.reasons).toContain('HIGH_COST_REVOLVING_DEBT_CONFIRMED');
    expect(result.reasons).toContain('PAYMENT_ARREARS_OR_STRESS');
  });

  it('attaches governance meta', () => {
    const safety = evaluateSafetyReserve(SAFE_INPUT);
    const debt = evaluateDebtAdapter(DEBT_INPUT);
    const result = evaluateRiskFundingGate(safety, debt);
    expect(result.meta?.modelName).toBe('riskFundingGate');
  });
});
