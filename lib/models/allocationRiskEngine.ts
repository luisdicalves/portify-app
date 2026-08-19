/**
 * lib/models/allocationRiskEngine.ts
 *
 * Allocation/Risk/Horizon Engine — derives `riskAllowedPct`, the ceiling on
 * growth-oriented allocation a Plan can carry, from Horizon/Risk-Tolerance
 * bands (as MIN of four caps), plus the Loss Capacity band's max stress-loss
 * and Satellite Risk Budget.
 *
 * Fonte canónica: PORTIFY-KNOWLEDGE
 * `04-financial-models/ALLOCATION/ALLOCATION-RISK-FEASIBILITY-V1.md` §7.4-7.6.
 * As bandas Horizon/LC/RT aqui são literais desse documento ("v1-draft"),
 * sem interpretação necessária — ao contrário de Safety Reserve/Debt
 * Adapter, não há fórmulas contínuas a decidir, só tabelas e `MIN()`.
 *
 * Não reconcilia com `lib/planCalculator.ts`: esse módulo já está ativo
 * (ligado a plan-set/summary/profile) e usa um mecanismo diferente
 * (riskScore 0-100 → banda de alocação). O `RiskAllowed` calculado aqui é
 * um cap complementar, não um substituto — reconciliar os dois seria migrar
 * uma peça em produção, fora de âmbito desta v1 (ver docs/model-map.md).
 *
 * `ObjectiveCap` e `GlobalCap` não têm tabela no spec (só Horizon/LC/RT
 * têm) — são aceites como inputs diretos do chamador, tal como
 * `sustainableMonthlyIncome` no Debt Adapter, em vez de serem inventados
 * aqui. O "stress test contra LC" do §7.4 não corre neste módulo — precisa
 * do motor de stress de portfólio, fora de âmbito (mesma razão que em
 * Safety Reserve §6.9); `lossCapacityMaxStressLossPct` é só informativo.
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type LossCapacityBand = 'LC1' | 'LC2' | 'LC3' | 'LC4' | 'LC5';
export type RiskToleranceBand = 'RT1' | 'RT2' | 'RT3' | 'RT4' | 'RT5';
export type BindingFactor = 'HORIZON' | 'RISK_TOLERANCE' | 'OBJECTIVE' | 'GLOBAL';

export interface AllocationRiskInput {
  horizonYears: number;
  lossCapacity: LossCapacityBand;
  riskTolerance: RiskToleranceBand;
  /** 0-1 — cap vindo do objetivo de investimento. Sem tabela no spec; input direto do chamador. */
  objectiveCapPct: number;
  /** 0-1 — cap vindo do Perfil Financeiro Global. Sem tabela no spec; input direto do chamador. */
  globalCapPct: number;
}

export interface AllocationRiskResult {
  horizonGrowthCapPct: number;
  riskToleranceGrowthCapPct: number;
  /** MIN(horizon, riskTolerance, objective, global). */
  riskAllowedPct: number;
  /** Qual dos 4 caps é o vinculativo (para explicabilidade); prioridade de desempate HORIZON > RISK_TOLERANCE > OBJECTIVE > GLOBAL — só para determinismo, não é regra do spec. */
  bindingFactor: BindingFactor;
  /** 0-1 — perda máxima de stress da banda LC (§7.5). Informativo: nenhum stress test corre aqui. */
  lossCapacityMaxStressLossPct: number;
  /** 0-1 — % máxima do capital investível para Satellite Growth (§7.6). */
  satelliteRiskBudgetPct: number;
  reasons: string[];
  /** Governance/versioning metadata — ver docs/model-governance.md. Campo aditivo. */
  meta?: ModelRunMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. calcHorizonGrowthCap — §7.5
// ─────────────────────────────────────────────────────────────────────────────

export function calcHorizonGrowthCap(horizonYears: number): number {
  if (horizonYears < 2) return 0.10;
  if (horizonYears < 5) return 0.35;
  if (horizonYears < 10) return 0.65;
  if (horizonYears < 15) return 0.85;
  return 1.00;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. calcRiskToleranceGrowthCap — §7.5
// ─────────────────────────────────────────────────────────────────────────────

const RT_GROWTH_CAP: Record<RiskToleranceBand, number> = {
  RT1: 0.15,
  RT2: 0.35,
  RT3: 0.60,
  RT4: 0.80,
  RT5: 1.00,
};

export function calcRiskToleranceGrowthCap(rt: RiskToleranceBand): number {
  return RT_GROWTH_CAP[rt];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. calcLossCapacityMaxStressLossPct — §7.5
// ─────────────────────────────────────────────────────────────────────────────

const LC_MAX_STRESS_LOSS: Record<LossCapacityBand, number> = {
  LC1: 0.10,
  LC2: 0.20,
  LC3: 0.35,
  LC4: 0.50,
  LC5: 1.00,
};

export function calcLossCapacityMaxStressLossPct(lc: LossCapacityBand): number {
  return LC_MAX_STRESS_LOSS[lc];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. calcSatelliteRiskBudgetPct — §7.6
// ─────────────────────────────────────────────────────────────────────────────

const LC_SATELLITE_BUDGET: Record<LossCapacityBand, number> = {
  LC1: 0.00,
  LC2: 0.05,
  LC3: 0.10,
  LC4: 0.20,
  LC5: 0.30,
};

export function calcSatelliteRiskBudgetPct(lc: LossCapacityBand): number {
  return LC_SATELLITE_BUDGET[lc];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. evaluateAllocationRisk — orquestrador
// ─────────────────────────────────────────────────────────────────────────────

const BINDING_PRIORITY: BindingFactor[] = ['HORIZON', 'RISK_TOLERANCE', 'OBJECTIVE', 'GLOBAL'];

export function evaluateAllocationRisk(input: AllocationRiskInput): AllocationRiskResult {
  const horizonGrowthCapPct = calcHorizonGrowthCap(input.horizonYears);
  const riskToleranceGrowthCapPct = calcRiskToleranceGrowthCap(input.riskTolerance);
  const lossCapacityMaxStressLossPct = calcLossCapacityMaxStressLossPct(input.lossCapacity);
  const satelliteRiskBudgetPct = calcSatelliteRiskBudgetPct(input.lossCapacity);

  const caps: Record<BindingFactor, number> = {
    HORIZON: horizonGrowthCapPct,
    RISK_TOLERANCE: riskToleranceGrowthCapPct,
    OBJECTIVE: input.objectiveCapPct,
    GLOBAL: input.globalCapPct,
  };

  const riskAllowedPct = Math.min(...BINDING_PRIORITY.map(k => caps[k]));
  const bindingFactor = BINDING_PRIORITY.find(k => caps[k] === riskAllowedPct) as BindingFactor;

  const reasons = ['LOSS_CAPACITY_STRESS_TEST_NOT_RUN'];

  return {
    horizonGrowthCapPct,
    riskToleranceGrowthCapPct,
    riskAllowedPct,
    bindingFactor,
    lossCapacityMaxStressLossPct,
    satelliteRiskBudgetPct,
    reasons,
    meta: createModelRunMeta({
      modelName: 'allocationRiskEngine',
      input,
      assumptions: [
        'objectiveCapPct e globalCapPct são aceites como inputs diretos do chamador — o spec não dá tabela/fórmula para nenhum dos dois (só Horizon/LC/RT têm bandas em §7.5/§7.6).',
        'lossCapacityMaxStressLossPct é informativo: nenhum stress test de portfólio corre neste módulo (fora de âmbito, ver docs/model-map.md).',
        'Em empate entre caps no MIN(), bindingFactor usa a prioridade HORIZON > RISK_TOLERANCE > OBJECTIVE > GLOBAL só para determinismo — não é uma regra do spec.',
      ],
      warnings: reasons,
    }),
  };
}
