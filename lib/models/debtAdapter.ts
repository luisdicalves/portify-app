/**
 * lib/models/debtAdapter.ts
 *
 * Debt Adapter — classifica o custo e a materialidade de uma dívida e deriva
 * `debtRiskFundingCap`, o teto (0-1) de novo capital de risco que a dívida
 * do utilizador permite, de forma contínua (sem cliffs discretos).
 *
 * Fonte canónica: PORTIFY-KNOWLEDGE `04-financial-models/DEBT/DEBT-ADAPTER-V1.md`
 * (D1-D15). Estado lá: "CALIBRATED STRUCTURAL CORE / PARAMETER VALIDATION
 * PENDING" — nenhum parâmetro é PRODUCTION_APPROVED; os anchors numéricos de
 * D3/D4/D12.1 são `APPROVED_DRAFT / EMPIRICAL_VALIDATION_REQUIRED`.
 *
 * Simplificações desta v1 face ao spec completo (ver docs/model-map.md):
 *   - D9/D10 (derivar SustainableMonthlyIncome de 12/24 meses de histórico)
 *     não é implementado — aceita-se `sustainableMonthlyIncome` como input
 *     direto do chamador.
 *   - D13 (RepaymentReturnEquivalent/REPAY_FIRST) e D14 (persistence cycles)
 *     não são implementados — são lógica de recomendação de amortização, não
 *     o cálculo do cap em si.
 *
 * Nota de interpretação (D6.2): o spec descreve `CostPressure C` apenas como
 * "interpolação contínua entre as boundaries LOW/HIGH/EXTREME de D3", sem
 * fórmula exata. Esta implementação usa interpolação linear por troços
 * através de 3 pontos-âncora — (LOW→C=0), (HIGH→C=0.5), (EXTREME→C=1),
 * saturada fora do intervalo — a leitura mais direta de "interpolação
 * contínua entre 3 fronteiras". Não é uma calibração Portify aprovada; rever
 * se o PORTIFY-KNOWLEDGE alguma vez fixar a curva exata.
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type DebtCostBand = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
export type DebtMateriality = 'IMMATERIAL' | 'MATERIAL' | 'HIGHLY_MATERIAL' | 'MATERIALITY_UNKNOWN';
export type DebtRateType = 'FIXED' | 'VARIABLE' | 'MIXED';
export type IncomeConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DebtAdapterInput {
  /** 0-1 — TAEG/all-in cost efetivo da dívida. */
  effectiveDebtCostAnnualPct: number;
  /** 0-1 — ECB Deposit Facility Rate atual. Input macro temporal, fornecido pelo chamador (D3), nunca hardcoded. */
  ecbDepositFacilityRatePct: number;
  /** € — saldo em dívida. */
  debtBalance: number;
  /** € — ativos líquidos seguros e não protegidos, disponíveis para amortizar (D4). */
  safeUnprotectedLiquidAssets: number;
  /** €/mês — excedente sustentável disponível para amortização (denominador D4). */
  sustainableDebtRepaymentSurplus: number;
  /** € — prestação mensal exigida da dívida (numerador D7). */
  requiredDebtServiceMonthly: number;
  /** € — rendimento mensal sustentável líquido. Input direto nesta v1 — ver nota D9/D10 acima. */
  sustainableMonthlyIncome: number;
  /** Opcional — só alimenta `meta.warnings`, sem efeito no cálculo. */
  incomeConfidence?: IncomeConfidence;
  /** € — despesas essenciais mensais não relacionadas com dívida (componente do denominador D7). */
  essentialNonDebtExpensesMonthly: number;
  debtRateType: DebtRateType;
  /** Hard override — cap 0% (D1: "arrears/payment stress mantêm hard restrictions"). */
  hasPaymentArrearsOrStress: boolean;
}

export interface DebtAdapterResult {
  costBand: DebtCostBand;
  materiality: DebtMateriality;
  safeRepaymentMonths: number;
  /** 0-1 — D6.2. */
  costMaterialityCap: number;
  /** 0-1 — D7/D8, sem choque de taxa. */
  currentBurdenCap: number;
  /** 0-1 — D7/D8, com choque de taxa +200bp (D12.1). */
  stressedBurdenCap: number;
  /** MIN(currentBurdenCap, stressedBurdenCap). */
  rateAwareBurdenCap: number;
  /** 0-1 — MIN de todos os caps aplicáveis, ou 0 em hard override. */
  debtRiskFundingCap: number;
  /** Q>=100% ou (sustainableMonthlyIncome − essentialNonDebtExpensesMonthly)<=0 (D8). */
  affordabilityFail: boolean;
  reasons: string[];
  /** Governance/versioning metadata — ver docs/model-governance.md. Campo aditivo. */
  meta?: ModelRunMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. classifyDebtCost — D3
// ─────────────────────────────────────────────────────────────────────────────

function costBoundaries(ecbDfrPct: number) {
  return {
    low: Math.max(0.04, ecbDfrPct + 0.015),
    high: Math.max(0.08, ecbDfrPct + 0.05),
    extreme: Math.max(0.15, ecbDfrPct + 0.10),
  };
}

export function classifyDebtCost(effectiveCostPct: number, ecbDfrPct: number): DebtCostBand {
  const { low, high, extreme } = costBoundaries(ecbDfrPct);
  if (effectiveCostPct <= low) return 'LOW';
  if (effectiveCostPct >= extreme) return 'EXTREME';
  if (effectiveCostPct >= high) return 'HIGH';
  return 'MODERATE';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. classifyDebtMateriality — D4
// ─────────────────────────────────────────────────────────────────────────────

export function classifyDebtMateriality(
  debtBalance: number,
  safeUnprotectedLiquidAssets: number,
  sustainableDebtRepaymentSurplus: number,
): { safeRepaymentMonths: number; materiality: DebtMateriality } {
  if (sustainableDebtRepaymentSurplus <= 0) {
    return { safeRepaymentMonths: Infinity, materiality: 'MATERIALITY_UNKNOWN' };
  }

  const safeRepaymentMonths = Math.max(0, debtBalance - safeUnprotectedLiquidAssets) / sustainableDebtRepaymentSurplus;

  let materiality: DebtMateriality;
  if (safeRepaymentMonths <= 1) materiality = 'IMMATERIAL';
  else if (safeRepaymentMonths <= 6) materiality = 'MATERIAL';
  else materiality = 'HIGHLY_MATERIAL';

  return { safeRepaymentMonths, materiality };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. calcCostMaterialityCap — D6.2 (Continuous Debt Restriction)
// ─────────────────────────────────────────────────────────────────────────────

/** CostPressure C — ver nota de interpretação no topo do ficheiro. */
function costPressure(effectiveCostPct: number, ecbDfrPct: number): number {
  const { low, high, extreme } = costBoundaries(ecbDfrPct);

  if (effectiveCostPct <= low) return 0;
  if (effectiveCostPct >= extreme) return 1;
  if (effectiveCostPct <= high) {
    // [low, high] -> [0, 0.5]
    return high > low ? ((effectiveCostPct - low) / (high - low)) * 0.5 : 0.5;
  }
  // (high, extreme) -> (0.5, 1]
  return extreme > high ? 0.5 + ((effectiveCostPct - high) / (extreme - high)) * 0.5 : 1;
}

// costBand is not a parameter here: it's fully determined by
// (effectiveCostPct, ecbDfrPct) via classifyDebtCost/costBoundaries, the
// same inputs this function already takes — passing it in would be a
// redundant, potentially-inconsistent third input for the same fact.
export function calcCostMaterialityCap(
  effectiveCostPct: number,
  ecbDfrPct: number,
  safeRepaymentMonths: number,
): number {
  const C = costPressure(effectiveCostPct, ecbDfrPct);
  const R = safeRepaymentMonths;
  const M = !Number.isFinite(R) || R <= 1 ? 0 : (R - 1) / ((R - 1) + 5);
  const G = Math.min(1, 2 * C);
  const debtRestrictionIntensity = C + (1 - C) * M * G;

  return clamp01(1 - debtRestrictionIntensity);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. calcDebtBurdenCap — D7/D8 (Debt Burden & Affordability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `rateShockBp` desloca a prestação mensal proporcionalmente ao saldo em
 * dívida quando a dívida não é FIXED (D11: taxa fixa não recebe choque
 * enquanto permanecer fixa).
 */
export function calcDebtBurdenCap(
  requiredDebtServiceMonthly: number,
  sustainableMonthlyIncome: number,
  essentialNonDebtExpensesMonthly: number,
  rateShockBp: number,
): { cap: number; affordabilityFail: boolean; stressedDebtServiceMonthly: number } {
  const availableForDebt = sustainableMonthlyIncome - essentialNonDebtExpensesMonthly;

  if (availableForDebt <= 0) {
    return { cap: 0, affordabilityFail: true, stressedDebtServiceMonthly: requiredDebtServiceMonthly };
  }

  // Aproximação: choque de +bp na taxa desloca a prestação proporcionalmente
  // ao seu peso sobre o saldo em dívida — não recalcula amortização/prazo.
  const stressedDebtServiceMonthly = requiredDebtServiceMonthly * (1 + rateShockBp / 10000);

  const Q = stressedDebtServiceMonthly / availableForDebt;

  if (Q >= 1) return { cap: 0, affordabilityFail: true, stressedDebtServiceMonthly };
  if (Q <= 0.5) return { cap: 1, affordabilityFail: false, stressedDebtServiceMonthly };

  // 50% < Q < 100% -> cap desce linearmente de 100% para 0%.
  const cap = 1 - (Q - 0.5) / 0.5;
  return { cap: clamp01(cap), affordabilityFail: false, stressedDebtServiceMonthly };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. evaluateDebtAdapter — orquestrador
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateDebtAdapter(input: DebtAdapterInput): DebtAdapterResult {
  const reasons: string[] = [];

  const costBand = classifyDebtCost(input.effectiveDebtCostAnnualPct, input.ecbDepositFacilityRatePct);
  const { safeRepaymentMonths, materiality } = classifyDebtMateriality(
    input.debtBalance,
    input.safeUnprotectedLiquidAssets,
    input.sustainableDebtRepaymentSurplus,
  );
  const costMaterialityCap = calcCostMaterialityCap(input.effectiveDebtCostAnnualPct, input.ecbDepositFacilityRatePct, safeRepaymentMonths);

  const rateShockBp = input.debtRateType === 'FIXED' ? 0 : 200; // D12.1: only +200bp feeds RateAwareBurdenCap
  const current = calcDebtBurdenCap(input.requiredDebtServiceMonthly, input.sustainableMonthlyIncome, input.essentialNonDebtExpensesMonthly, 0);
  const stressed = calcDebtBurdenCap(input.requiredDebtServiceMonthly, input.sustainableMonthlyIncome, input.essentialNonDebtExpensesMonthly, rateShockBp);

  const currentBurdenCap = current.cap;
  const stressedBurdenCap = stressed.cap;
  const rateAwareBurdenCap = Math.min(currentBurdenCap, stressedBurdenCap);
  const affordabilityFail = current.affordabilityFail || stressed.affordabilityFail;

  if (materiality === 'MATERIALITY_UNKNOWN') reasons.push('MATERIALITY_UNKNOWN');
  if (affordabilityFail) reasons.push('AFFORDABILITY_FAIL');
  if (costBand === 'EXTREME') reasons.push('DEBT_COST_EXTREME');
  if (input.debtRateType !== 'FIXED' && stressedBurdenCap < currentBurdenCap) reasons.push('RATE_STRESS_BINDING');

  let debtRiskFundingCap = Math.min(costMaterialityCap, rateAwareBurdenCap);

  if (input.hasPaymentArrearsOrStress) {
    debtRiskFundingCap = 0;
    reasons.unshift('PAYMENT_ARREARS_OR_STRESS');
  }

  if (input.incomeConfidence && input.incomeConfidence !== 'HIGH') {
    reasons.push(`INCOME_CONFIDENCE_${input.incomeConfidence}`);
  }

  return {
    costBand,
    materiality,
    safeRepaymentMonths,
    costMaterialityCap,
    currentBurdenCap,
    stressedBurdenCap,
    rateAwareBurdenCap,
    debtRiskFundingCap,
    affordabilityFail,
    reasons,
    meta: createModelRunMeta({
      modelName: 'debtAdapter',
      input,
      assumptions: [
        'sustainableMonthlyIncome é aceite como input direto — não é derivado de histórico de rendimento 12/24 meses (D9/D10 fora de âmbito nesta versão, ver docs/model-map.md).',
        'CostPressure (D6.2) usa interpolação linear por troços através dos 3 pontos-âncora LOW/HIGH/EXTREME — decisão de implementação, não uma curva Portify aprovada.',
        'Choque de taxa (+200bp, D12.1) desloca a prestação proporcionalmente ao seu peso; não recalcula amortização/prazo.',
      ],
      warnings: reasons,
    }),
  };
}
