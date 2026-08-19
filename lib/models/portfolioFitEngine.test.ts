import { describe, it, expect } from 'vitest';
import {
  calcHHI,
  calcEffectiveN,
  calcExposureDelta,
  calcWeightedOverlap,
  evaluatePortfolioFit,
  type ExposureVector,
  type PortfolioFitDimensionScores,
} from './portfolioFitEngine';
import { evaluateAllocationRisk, type AllocationRiskInput } from './allocationRiskEngine';

describe('calcHHI / calcEffectiveN', () => {
  it('a single-position portfolio is fully concentrated (HHI=1, EffectiveN=1)', () => {
    const weights: ExposureVector = { AAPL: 1 };
    expect(calcHHI(weights)).toBe(1);
    expect(calcEffectiveN(calcHHI(weights))).toBe(1);
  });

  it('N equally-weighted positions gives HHI=1/N and EffectiveN=N', () => {
    const weights: ExposureVector = { A: 0.25, B: 0.25, C: 0.25, D: 0.25 };
    expect(calcHHI(weights)).toBeCloseTo(0.25, 6);
    expect(calcEffectiveN(calcHHI(weights))).toBeCloseTo(4, 6);
  });

  it('calcEffectiveN returns null for an empty/zero-exposure portfolio', () => {
    expect(calcEffectiveN(calcHHI({}))).toBeNull();
    expect(calcEffectiveN(0)).toBeNull();
  });
});

describe('calcExposureDelta', () => {
  it('a negative deltaHHI reflects improving diversification', () => {
    const before: ExposureVector = { A: 1 };
    const after: ExposureVector = { A: 0.5, B: 0.5 };
    const delta = calcExposureDelta(before, after);
    expect(delta.deltaHHI).toBeLessThan(0);
    expect(delta.deltaEffectiveN).toBeGreaterThan(0);
  });

  it('a positive deltaHHI reflects worsening (increasing) concentration', () => {
    const before: ExposureVector = { A: 0.5, B: 0.5 };
    const after: ExposureVector = { A: 1 };
    const delta = calcExposureDelta(before, after);
    expect(delta.deltaHHI).toBeGreaterThan(0);
    expect(delta.deltaEffectiveN).toBeLessThan(0);
  });

  it('handles the bootstrap case (empty starting portfolio)', () => {
    const delta = calcExposureDelta({}, { A: 1 });
    expect(delta.hhiBefore).toBe(0);
    expect(delta.effectiveNBefore).toBeNull();
    expect(delta.deltaEffectiveN).toBeNull(); // undefined on one side, not fabricated
    expect(delta.hhiAfter).toBe(1);
  });
});

describe('calcWeightedOverlap', () => {
  it('is 1 for identical vectors', () => {
    const v: ExposureVector = { A: 0.6, B: 0.4 };
    expect(calcWeightedOverlap(v, v)).toBeCloseTo(1, 6);
  });

  it('is 0 for fully disjoint vectors', () => {
    expect(calcWeightedOverlap({ A: 1 }, { B: 1 })).toBe(0);
  });

  it('computes a hand-checked partial overlap', () => {
    // min(0.5,0.3) + min(0.3,0.3) + min(0.2,0) + min(0,0.4) = 0.3+0.3+0+0 = 0.6
    const a: ExposureVector = { A: 0.5, B: 0.3, C: 0.2 };
    const b: ExposureVector = { A: 0.3, B: 0.3, D: 0.4 };
    expect(calcWeightedOverlap(a, b)).toBeCloseTo(0.6, 6);
  });
});

const NEUTRAL_ALLOCATION_INPUT: AllocationRiskInput = {
  horizonYears: 20,
  lossCapacity: 'LC3',
  riskTolerance: 'RT5',
  objectiveCapPct: 1.0,
  globalCapPct: 1.0,
};

const FULL_SCORES: PortfolioFitDimensionScores = {
  planAlignment: 1,
  diversification: 1,
  sectorClusterGeoExposure: 1,
  riskBudgetEfficiency: 1,
  redundancyOverlap: 1,
};

describe('evaluatePortfolioFit', () => {
  it('weights the 5 dimensions exactly 35/25/20/15/5%', () => {
    const scores: PortfolioFitDimensionScores = {
      planAlignment: 1,
      diversification: 0,
      sectorClusterGeoExposure: 0,
      riskBudgetEfficiency: 0,
      redundancyOverlap: 0,
    };
    const allocationRisk = evaluateAllocationRisk(NEUTRAL_ALLOCATION_INPUT);
    const result = evaluatePortfolioFit({
      dimensionScores: scores,
      riskBudgetCheck: { actualGrowthWeightPct: 0.1, actualSatelliteWeightPct: 0.01, allocationRisk },
    });
    expect(result.score).toBeCloseTo(0.35, 6);
  });

  it('score is 1 when every dimension is a perfect 1', () => {
    const allocationRisk = evaluateAllocationRisk(NEUTRAL_ALLOCATION_INPUT);
    const result = evaluatePortfolioFit({
      dimensionScores: FULL_SCORES,
      riskBudgetCheck: { actualGrowthWeightPct: 0.1, actualSatelliteWeightPct: 0.01, allocationRisk },
    });
    expect(result.score).toBeCloseTo(1, 6);
  });

  it('riskBudgetFail triggers when actual growth weight exceeds riskAllowedPct, regardless of score', () => {
    const allocationRisk = evaluateAllocationRisk({ ...NEUTRAL_ALLOCATION_INPUT, objectiveCapPct: 0.3 }); // riskAllowedPct = 0.3
    const result = evaluatePortfolioFit({
      dimensionScores: FULL_SCORES, // perfect score
      riskBudgetCheck: { actualGrowthWeightPct: 0.5, actualSatelliteWeightPct: 0.01, allocationRisk },
    });
    expect(result.riskBudgetFail).toBe(true);
    expect(result.hardFail).toBe(true);
    expect(result.score).toBeCloseTo(1, 6); // score itself is untouched by the fail
    expect(result.reasons).toContain('RISK_BUDGET_FAIL');
  });

  it('satelliteBudgetFail triggers when actual satellite weight exceeds satelliteRiskBudgetPct', () => {
    const allocationRisk = evaluateAllocationRisk({ ...NEUTRAL_ALLOCATION_INPUT, lossCapacity: 'LC1' }); // satelliteRiskBudgetPct = 0
    const result = evaluatePortfolioFit({
      dimensionScores: FULL_SCORES,
      riskBudgetCheck: { actualGrowthWeightPct: 0.1, actualSatelliteWeightPct: 0.02, allocationRisk },
    });
    expect(result.satelliteBudgetFail).toBe(true);
    expect(result.hardFail).toBe(true);
    expect(result.reasons).toContain('SATELLITE_BUDGET_FAIL');
  });

  it('hardFail is false and reasons is empty when both budgets are respected', () => {
    const allocationRisk = evaluateAllocationRisk(NEUTRAL_ALLOCATION_INPUT);
    const result = evaluatePortfolioFit({
      dimensionScores: FULL_SCORES,
      riskBudgetCheck: { actualGrowthWeightPct: 0.1, actualSatelliteWeightPct: 0.01, allocationRisk },
    });
    expect(result.hardFail).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('attaches governance meta', () => {
    const allocationRisk = evaluateAllocationRisk(NEUTRAL_ALLOCATION_INPUT);
    const result = evaluatePortfolioFit({
      dimensionScores: FULL_SCORES,
      riskBudgetCheck: { actualGrowthWeightPct: 0.1, actualSatelliteWeightPct: 0.01, allocationRisk },
    });
    expect(result.meta?.modelName).toBe('portfolioFitEngine');
  });
});
