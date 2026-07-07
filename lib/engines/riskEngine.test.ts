import { describe, it, expect } from 'vitest';
import { calcAnnualizedVolatilityPct, calcMaxDrawdownPct, calcRiskEngineScore } from './riskEngine';
import type { RiskEngineInput } from './types';

// Preços quase constantes com uma leve tendência ascendente — baixa volatilidade, sem drawdown relevante.
const STABLE_CLOSES = Array.from({ length: 260 }, (_, i) => 100 + i * 0.05);

// Sobe, cai 40% a meio, recupera — alta volatilidade e drawdown grande.
const VOLATILE_CLOSES = [
  ...Array.from({ length: 60 }, (_, i) => 100 + i),
  ...Array.from({ length: 60 }, (_, i) => 160 - i * 3.5),
  ...Array.from({ length: 140 }, (_, i) => 20 + i * 0.5),
];

describe('calcAnnualizedVolatilityPct', () => {
  it('is lower for a stable price series than a volatile one', () => {
    const stable = calcAnnualizedVolatilityPct(STABLE_CLOSES)!;
    const volatile = calcAnnualizedVolatilityPct(VOLATILE_CLOSES)!;
    expect(stable).toBeLessThan(volatile);
  });

  it('returns undefined for series too short to compute returns', () => {
    expect(calcAnnualizedVolatilityPct([100])).toBeUndefined();
  });
});

describe('calcMaxDrawdownPct', () => {
  it('is near zero for a monotonically rising series', () => {
    expect(calcMaxDrawdownPct(STABLE_CLOSES)!).toBeLessThan(2);
  });

  it('detects a large peak-to-trough decline', () => {
    const drawdown = calcMaxDrawdownPct(VOLATILE_CLOSES)!;
    expect(drawdown).toBeGreaterThan(30);
  });
});

const SAFE_INPUT: RiskEngineInput = {
  beta: 0.6,
  dailyCloses: STABLE_CLOSES,
  debtToEquityAnnual: 0.2,
  marketCapUsd: 500_000_000_000,
};

const RISKY_INPUT: RiskEngineInput = {
  beta: 2.2,
  dailyCloses: VOLATILE_CLOSES,
  debtToEquityAnnual: 3.5,
  marketCapUsd: 100_000_000,
};

describe('calcRiskEngineScore', () => {
  it('scores a low-beta, low-debt, liquid, stable asset as safer than a volatile, indebted, illiquid one', () => {
    const safe = calcRiskEngineScore(SAFE_INPUT);
    const risky = calcRiskEngineScore(RISKY_INPUT);
    expect(safe.total).toBeGreaterThan(risky.total);
  });

  it('total and sub-scores are clamped between 0 and 100', () => {
    for (const input of [SAFE_INPUT, RISKY_INPUT, {}]) {
      const r = calcRiskEngineScore(input);
      for (const v of [r.total, r.betaScore, r.volatilityScore, r.drawdownScore, r.debtScore, r.liquidityScore]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
