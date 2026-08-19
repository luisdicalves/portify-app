/**
 * lib/models/safetyReserve.ts
 *
 * Safety Gate & Reserve Engine — decide se um utilizador pode alocar novo
 * capital de risco, e com que restrição (`riskFundingCap`).
 *
 * Fonte canónica: PORTIFY-KNOWLEDGE `04-financial-models/SAFETY/SAFETY-RESERVE-V1.md`
 * (§6.1-6.11, MODEL-018). Estado lá: "CALIBRATED — structural core" para as
 * fórmulas implementadas aqui; nenhum parâmetro é PRODUCTION_APPROVED.
 *
 * Simplificações desta v1 face ao spec completo (ver docs/model-map.md):
 *   - §6.6 Liquidity Runway Matching (elegibilidade por classe de ativo
 *     L0-L3) não é implementado — usam-se montantes € diretos.
 *   - §6.8 Intra-Contribution Reevaluation e §6.9 Stress Model não são
 *     implementados aqui — pertencem a um motor de stress-testing separado.
 *
 * `ReserveCoverage`/`ImmediateCoverage`/`NearTermProtection` em euros não têm
 * fórmula literal no spec (prosa de governança, não documento de engenharia)
 * — são a leitura mais direta de §6.2/§6.5/§6.7, não uma calibração nova.
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type IncomeStability =
  | 'STABLE_RECURRING_OR_PENSION'
  | 'VARIABLE_OR_TEMPORARY_CONTRACT'
  | 'SELF_EMPLOYED_HIGHLY_VARIABLE'
  | 'NO_RELIABLE_INCOME';

export type SustainableIncomeSource = 'STABLE_PENSION' | 'ASSET_FUNDED' | 'NONE';

export type CriticalDataStatus = 'USABLE' | 'UNUSABLE' | 'EXPIRED';

export type SafetyGateResult = 'PASS' | 'CONDITIONAL' | 'BLOCK';

export interface SafetyReserveInput {
  incomeStability: IncomeStability;
  /** Exigido pelo IncomeContinuityGate quando incomeStability === 'NO_RELIABLE_INCOME' (§6.1). */
  sustainableIncomeSource: SustainableIncomeSource;
  hasFinancialDependents: boolean;
  /** 0-1 — dívida sobre rendimento líquido, alimenta as bandas DebtAddon (§6.4). */
  debtToNetIncomeRatio: number;
  materialFinancialChangeExpected12m: boolean;
  /** € — despesas mensais essenciais; base de TargetReserveAmount/ImmediateAmount. */
  essentialMonthlyOutlays: number;
  /** € — despesas essenciais já conhecidas para o período imediato (§6.5). */
  nearTermKnownEssentialOutlays: number;
  /** € — capital atualmente afeto ao Fundo de Emergência. */
  currentReserveAmount: number;
  /** € — capital mobilizável agora para necessidade imediata. */
  immediatelyAvailableAmount: number;
  /** € — capital protegido/reservado para as despesas essenciais próximas conhecidas. */
  protectedCapitalForKnownOutlays: number;
  /** Hard BLOCK — atrasos/dificuldade em compromissos essenciais (§6.7, linha 1). */
  hasPaymentArrearsOrDifficulty: boolean;
  /** Hard CONDITIONAL + cap 0% — dívida revolving/high-cost confirmada (§6.7, linha 5). */
  hasHighCostRevolvingDebtConfirmed: boolean;
  /** Hard BLOCK — dados críticos UNUSABLE/EXPIRED (§6.7, linha 7). */
  criticalDataStatus: CriticalDataStatus;
}

export interface SafetyReserveResult {
  targetReserveMonths: number;
  immediateMonths: number;
  targetReserveAmount: number;
  immediateAmount: number;
  /** Não capado a 100 — transparência sobre quanto acima/abaixo do alvo a reserva está. */
  reserveCoveragePct: number;
  immediateCoveragePct: number;
  nearTermProtectionPct: number;
  /** 0-1. */
  riskFundingCap: number;
  gateResult: SafetyGateResult;
  reasons: string[];
  /** Governance/versioning metadata — ver docs/model-governance.md. Campo aditivo. */
  meta?: ModelRunMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. calcTargetReserveMonths — §6.4
// ─────────────────────────────────────────────────────────────────────────────

function incomeAddon(stability: IncomeStability): number {
  switch (stability) {
    case 'STABLE_RECURRING_OR_PENSION':      return 0;
    case 'VARIABLE_OR_TEMPORARY_CONTRACT':   return 1.5;
    case 'SELF_EMPLOYED_HIGHLY_VARIABLE':    return 2.5;
    case 'NO_RELIABLE_INCOME':               return 4;
  }
}

function debtAddon(ratio: number): number {
  if (ratio < 0.15) return 0;
  if (ratio < 0.30) return 0.5;
  if (ratio < 0.40) return 1;
  if (ratio < 0.50) return 1.5;
  return 2.5;
}

export function calcTargetReserveMonths(input: SafetyReserveInput): number {
  const raw =
    3 +
    incomeAddon(input.incomeStability) +
    (input.hasFinancialDependents ? 1 : 0) +
    debtAddon(input.debtToNetIncomeRatio) +
    (input.materialFinancialChangeExpected12m ? 1 : 0);

  return clamp(3, raw, 12);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. calcImmediateMonths — §6.5
// ─────────────────────────────────────────────────────────────────────────────

export function calcImmediateMonths(targetReserveMonths: number): number {
  return clamp(1, 0.25 * targetReserveMonths, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Coverage ratios — €, interpretação direta de §6.2/§6.5/§6.7
// ─────────────────────────────────────────────────────────────────────────────

function calcReserveCoverage(input: SafetyReserveInput, targetReserveMonths: number) {
  const targetReserveAmount = targetReserveMonths * input.essentialMonthlyOutlays;
  const reserveCoveragePct = targetReserveAmount > 0
    ? (input.currentReserveAmount / targetReserveAmount) * 100
    : 100;
  return { targetReserveAmount, reserveCoveragePct };
}

function calcImmediateCoverage(input: SafetyReserveInput, immediateMonths: number) {
  const immediateAmount = immediateMonths * input.essentialMonthlyOutlays + input.nearTermKnownEssentialOutlays;
  const immediateCoveragePct = immediateAmount > 0
    ? (input.immediatelyAvailableAmount / immediateAmount) * 100
    : 100;
  return { immediateAmount, immediateCoveragePct };
}

function calcNearTermProtection(input: SafetyReserveInput): number {
  if (input.nearTermKnownEssentialOutlays <= 0) return 100;
  return (input.protectedCapitalForKnownOutlays / input.nearTermKnownEssentialOutlays) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. calcRiskFundingCapFromCoverage — MODEL-018, Continuous Reserve Restriction
// ─────────────────────────────────────────────────────────────────────────────

export function calcRiskFundingCapFromCoverage(reserveCoveragePct: number): number {
  if (reserveCoveragePct <= 50) return 0;
  if (reserveCoveragePct >= 100) return 1;
  return (reserveCoveragePct - 50) / 50;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. evaluateSafetyReserve — orquestrador, hard gates por precedência (§6.7)
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateSafetyReserve(input: SafetyReserveInput): SafetyReserveResult {
  const targetReserveMonths = calcTargetReserveMonths(input);
  const immediateMonths = calcImmediateMonths(targetReserveMonths);
  const { targetReserveAmount, reserveCoveragePct } = calcReserveCoverage(input, targetReserveMonths);
  const { immediateAmount, immediateCoveragePct } = calcImmediateCoverage(input, immediateMonths);
  const nearTermProtectionPct = calcNearTermProtection(input);

  const reasons: string[] = [];
  let gateResult: SafetyGateResult = 'PASS';
  let riskFundingCap = calcRiskFundingCapFromCoverage(reserveCoveragePct);

  // Precedência hard-gate, por ordem da tabela §6.7.
  if (input.criticalDataStatus !== 'USABLE') {
    gateResult = 'BLOCK';
    riskFundingCap = 0;
    reasons.push(`CRITICAL_DATA_${input.criticalDataStatus}`);
  } else if (input.hasPaymentArrearsOrDifficulty) {
    gateResult = 'BLOCK';
    riskFundingCap = 0;
    reasons.push('PAYMENT_ARREARS_OR_DIFFICULTY');
  } else if (immediateCoveragePct < 50) {
    gateResult = 'BLOCK';
    riskFundingCap = 0;
    reasons.push('IMMEDIATE_COVERAGE_BELOW_50');
  } else if (nearTermProtectionPct < 100) {
    gateResult = 'BLOCK';
    riskFundingCap = 0;
    reasons.push('NEAR_TERM_PROTECTION_BELOW_100');
  } else {
    if (input.hasHighCostRevolvingDebtConfirmed) {
      gateResult = 'CONDITIONAL';
      riskFundingCap = 0;
      reasons.push('HIGH_COST_REVOLVING_DEBT_CONFIRMED');
    }
    if (input.incomeStability === 'NO_RELIABLE_INCOME' && input.sustainableIncomeSource === 'NONE') {
      // Only PASS/CONDITIONAL reach this branch (the BLOCK cases above are exclusive else-ifs).
      gateResult = 'CONDITIONAL';
      riskFundingCap = 0;
      reasons.push('NO_RELIABLE_INCOME_WITHOUT_SUSTAINABLE_SOURCE');
    }
    if (riskFundingCap === 0 && reasons.length === 0) {
      reasons.push('RESERVE_COVERAGE_AT_OR_BELOW_50');
    } else if (reasons.length === 0 && riskFundingCap < 1) {
      reasons.push('RESERVE_COVERAGE_PARTIAL');
    }
  }

  return {
    targetReserveMonths,
    immediateMonths,
    targetReserveAmount,
    immediateAmount,
    reserveCoveragePct,
    immediateCoveragePct,
    nearTermProtectionPct,
    riskFundingCap,
    gateResult,
    reasons,
    meta: createModelRunMeta({
      modelName: 'safetyReserve',
      input,
      assumptions: [
        'TargetReserveAmount = targetReserveMonths × essentialMonthlyOutlays; ReserveCoverage/ImmediateCoverage/NearTermProtection são leituras diretas de §6.2/§6.5/§6.7, não fórmulas literais do spec.',
        'Liquidity Runway Matching por classe de ativo (§6.6) e Stress Model (§6.9) não estão implementados nesta versão — ver docs/model-map.md.',
      ],
      warnings: reasons,
    }),
  };
}
