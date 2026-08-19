import { describe, it, expect } from 'vitest';
import {
  calcHorizonGrowthCap,
  calcRiskToleranceGrowthCap,
  calcLossCapacityMaxStressLossPct,
  calcSatelliteRiskBudgetPct,
  evaluateAllocationRisk,
  type AllocationRiskInput,
} from './allocationRiskEngine';

describe('calcHorizonGrowthCap', () => {
  it.each([
    [0, 0.10],
    [1.9, 0.10],
    [2, 0.35],
    [4.9, 0.35],
    [5, 0.65],
    [9.9, 0.65],
    [10, 0.85],
    [14.9, 0.85],
    [15, 1.00],
    [30, 1.00],
  ])('horizonYears=%d -> %d', (years, expected) => {
    expect(calcHorizonGrowthCap(years)).toBe(expected);
  });
});

describe('calcRiskToleranceGrowthCap', () => {
  it.each([
    ['RT1', 0.15],
    ['RT2', 0.35],
    ['RT3', 0.60],
    ['RT4', 0.80],
    ['RT5', 1.00],
  ] as const)('%s -> %d', (rt, expected) => {
    expect(calcRiskToleranceGrowthCap(rt)).toBe(expected);
  });
});

describe('calcLossCapacityMaxStressLossPct', () => {
  it.each([
    ['LC1', 0.10],
    ['LC2', 0.20],
    ['LC3', 0.35],
    ['LC4', 0.50],
    ['LC5', 1.00],
  ] as const)('%s -> %d', (lc, expected) => {
    expect(calcLossCapacityMaxStressLossPct(lc)).toBe(expected);
  });
});

describe('calcSatelliteRiskBudgetPct', () => {
  it.each([
    ['LC1', 0.00],
    ['LC2', 0.05],
    ['LC3', 0.10],
    ['LC4', 0.20],
    ['LC5', 0.30],
  ] as const)('%s -> %d', (lc, expected) => {
    expect(calcSatelliteRiskBudgetPct(lc)).toBe(expected);
  });
});

const BASE: AllocationRiskInput = {
  horizonYears: 20,       // horizon cap 1.00
  lossCapacity: 'LC5',    // not directly a cap on riskAllowed
  riskTolerance: 'RT5',   // RT cap 1.00
  objectiveCapPct: 1.00,
  globalCapPct: 1.00,
};

describe('evaluateAllocationRisk', () => {
  it('riskAllowedPct is 1 and bindingFactor is HORIZON when every cap is 1 (tie -> first priority)', () => {
    const result = evaluateAllocationRisk(BASE);
    expect(result.riskAllowedPct).toBe(1.00);
    expect(result.bindingFactor).toBe('HORIZON');
  });

  it('HORIZON binds when it is the tightest cap', () => {
    const result = evaluateAllocationRisk({ ...BASE, horizonYears: 1 }); // cap 0.10
    expect(result.riskAllowedPct).toBe(0.10);
    expect(result.bindingFactor).toBe('HORIZON');
  });

  it('RISK_TOLERANCE binds when it is the tightest cap', () => {
    const result = evaluateAllocationRisk({ ...BASE, riskTolerance: 'RT1' }); // cap 0.15
    expect(result.riskAllowedPct).toBe(0.15);
    expect(result.bindingFactor).toBe('RISK_TOLERANCE');
  });

  it('OBJECTIVE binds when it is the tightest cap', () => {
    const result = evaluateAllocationRisk({ ...BASE, objectiveCapPct: 0.20 });
    expect(result.riskAllowedPct).toBe(0.20);
    expect(result.bindingFactor).toBe('OBJECTIVE');
  });

  it('GLOBAL binds when it is the tightest cap', () => {
    const result = evaluateAllocationRisk({ ...BASE, globalCapPct: 0.05 });
    expect(result.riskAllowedPct).toBe(0.05);
    expect(result.bindingFactor).toBe('GLOBAL');
  });

  it('surfaces the Loss Capacity max stress loss and Satellite budget for the given LC band', () => {
    const result = evaluateAllocationRisk({ ...BASE, lossCapacity: 'LC3' });
    expect(result.lossCapacityMaxStressLossPct).toBe(0.35);
    expect(result.satelliteRiskBudgetPct).toBe(0.10);
  });

  it('always flags that the LC stress test was not run', () => {
    const result = evaluateAllocationRisk(BASE);
    expect(result.reasons).toContain('LOSS_CAPACITY_STRESS_TEST_NOT_RUN');
  });

  it('attaches governance meta', () => {
    const result = evaluateAllocationRisk(BASE);
    expect(result.meta?.modelName).toBe('allocationRiskEngine');
  });
});
