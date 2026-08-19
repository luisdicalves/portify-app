/**
 * lib/models/portfolioFitEngine.ts
 *
 * Portfolio Fit Engine — concentration math (HHI/Effective N/overlap) plus
 * the weighted Portfolio Fit Score combiner and its two hard-FAIL gates.
 *
 * Fonte canónica: PORTIFY-KNOWLEDGE
 * `04-financial-models/PORTFOLIO-FIT/PORTFOLIO-FIT-V1.md` (§10). Este é o
 * mais abstrato dos motores implementados até agora: o documento nomeia as
 * 5 dimensões do Portfolio Fit Score e os seus pesos (35/25/20/15/5%), mas
 * não dá fórmula para calcular 4 das 5 dimensões — só o peso de combinação
 * é literal. Por isso os 5 `PortfolioFitDimensionScores` são aceites como
 * inputs diretos do chamador (mesma disciplina de
 * `sustainableMonthlyIncome` no Debt Adapter e `objectiveCapPct`/
 * `globalCapPct` no Allocation Risk Engine) — este módulo só combina, nunca
 * deriva os 5 scores a partir de dados brutos.
 *
 * "Os thresholds que mapeiam o score para classificações permanecem
 * UNDEFINED" (§10.1) — por isso não há nenhuma classificação
 * IMPROVES_PORTFOLIO/NEUTRAL_FIT/WORSENS_PORTFOLIO/FAIL aqui, só o `score`
 * bruto. Inventar thresholds fabricaria uma calibração que o próprio
 * documento diz não existir.
 *
 * `riskBudgetFail`/`satelliteBudgetFail` (§10: "Risk Budget e Satellite
 * Budget podem produzir FAIL") reutilizam `lib/models/allocationRiskEngine.ts`
 * (`riskAllowedPct`/`satelliteRiskBudgetPct`) em vez de inventar novos
 * thresholds — primeiro motor desta sequência a compor com outro já
 * construído.
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';
import type { AllocationRiskResult } from '@/lib/models/allocationRiskEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chave de exposição (issuer/setor/cluster/geografia/moeda/fator —
 * granularidade decidida pelo chamador, §10 "Economic Exposure Vector
 * canónico") -> peso 0-1.
 */
export type ExposureVector = Record<string, number>;

export interface ExposureDelta {
  hhiBefore: number;
  hhiAfter: number;
  deltaHHI: number;
  effectiveNBefore: number | null;
  effectiveNAfter: number | null;
  deltaEffectiveN: number | null;
}

export interface PortfolioFitDimensionScores {
  /** Cada 0-1, input direto do chamador — ver nota no header do ficheiro. */
  planAlignment: number; // 35%
  diversification: number; // 25%
  sectorClusterGeoExposure: number; // 20%
  riskBudgetEfficiency: number; // 15%
  redundancyOverlap: number; // 5%
}

export interface RiskBudgetCheckInput {
  actualGrowthWeightPct: number; // 0-1
  actualSatelliteWeightPct: number; // 0-1
  allocationRisk: AllocationRiskResult;
}

export interface PortfolioFitInput {
  dimensionScores: PortfolioFitDimensionScores;
  riskBudgetCheck: RiskBudgetCheckInput;
}

export interface PortfolioFitResult {
  /** Soma ponderada 0-1 (35/25/20/15/5%) — sem classificação (thresholds UNDEFINED no spec). */
  score: number;
  riskBudgetFail: boolean;
  satelliteBudgetFail: boolean;
  /** riskBudgetFail || satelliteBudgetFail — "o score nunca compensa um hard fail" (§10). */
  hardFail: boolean;
  reasons: string[];
  /** Governance/versioning metadata — ver docs/model-governance.md. Campo aditivo. */
  meta?: ModelRunMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. calcHHI / calcEffectiveN — concentração standard
// ─────────────────────────────────────────────────────────────────────────────

export function calcHHI(weights: ExposureVector): number {
  return Object.values(weights).reduce((sum, w) => sum + w * w, 0);
}

/** null quando hhi<=0 (carteira vazia/sem exposição) — evita Infinity, que serializaria mal em meta/JSON. */
export function calcEffectiveN(hhi: number): number | null {
  return hhi > 0 ? 1 / hhi : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. calcExposureDelta — antes/depois de uma operação simulada (§10)
// ─────────────────────────────────────────────────────────────────────────────

export function calcExposureDelta(before: ExposureVector, after: ExposureVector): ExposureDelta {
  const hhiBefore = calcHHI(before);
  const hhiAfter = calcHHI(after);
  const effectiveNBefore = calcEffectiveN(hhiBefore);
  const effectiveNAfter = calcEffectiveN(hhiAfter);

  return {
    hhiBefore,
    hhiAfter,
    deltaHHI: hhiAfter - hhiBefore,
    effectiveNBefore,
    effectiveNAfter,
    deltaEffectiveN: effectiveNBefore !== null && effectiveNAfter !== null ? effectiveNAfter - effectiveNBefore : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. calcWeightedOverlap — decisão de interpretação, ver header do ficheiro
// ─────────────────────────────────────────────────────────────────────────────

/** Overlap coefficient: Σ min(wA_i, wB_i) sobre a união das chaves. 0 = sem sobreposição, 1 = idêntico. */
export function calcWeightedOverlap(a: ExposureVector, b: ExposureVector): number {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  return keys.reduce((overlap, key) => overlap + Math.min(a[key] ?? 0, b[key] ?? 0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. evaluatePortfolioFit — orquestrador
// ─────────────────────────────────────────────────────────────────────────────

const DIMENSION_WEIGHTS: Record<keyof PortfolioFitDimensionScores, number> = {
  planAlignment: 0.35,
  diversification: 0.25,
  sectorClusterGeoExposure: 0.20,
  riskBudgetEfficiency: 0.15,
  redundancyOverlap: 0.05,
};

export function evaluatePortfolioFit(input: PortfolioFitInput): PortfolioFitResult {
  const { dimensionScores, riskBudgetCheck } = input;

  const score = (Object.keys(DIMENSION_WEIGHTS) as (keyof PortfolioFitDimensionScores)[])
    .reduce((sum, key) => sum + dimensionScores[key] * DIMENSION_WEIGHTS[key], 0);

  const riskBudgetFail = riskBudgetCheck.actualGrowthWeightPct > riskBudgetCheck.allocationRisk.riskAllowedPct;
  const satelliteBudgetFail = riskBudgetCheck.actualSatelliteWeightPct > riskBudgetCheck.allocationRisk.satelliteRiskBudgetPct;
  const hardFail = riskBudgetFail || satelliteBudgetFail;

  const reasons: string[] = [];
  if (riskBudgetFail) reasons.push('RISK_BUDGET_FAIL');
  if (satelliteBudgetFail) reasons.push('SATELLITE_BUDGET_FAIL');

  return {
    score,
    riskBudgetFail,
    satelliteBudgetFail,
    hardFail,
    reasons,
    meta: createModelRunMeta({
      modelName: 'portfolioFitEngine',
      input,
      assumptions: [
        'Os 5 dimensionScores são inputs diretos do chamador — este módulo só combina com os pesos 35/25/20/15/5% do spec, não deriva nenhum deles a partir de dados brutos.',
        'Sem classificação IMPROVES_PORTFOLIO/NEUTRAL_FIT/WORSENS_PORTFOLIO/FAIL: os thresholds que mapeariam o score para essas categorias estão UNDEFINED no spec (§10.1).',
        'calcWeightedOverlap usa Σ min(wA_i, wB_i) sobre a união das chaves — decisão de implementação (overlap coefficient standard), o spec nomeia o conceito mas não dá a fórmula exata.',
      ],
      warnings: reasons,
    }),
  };
}
