/**
 * lib/models/riskFundingGate.ts
 *
 * Combina o resultado do Safety Reserve e do Debt Adapter num único
 * `effectiveRiskFundingCap` — o teto real de novo capital de risco que o
 * utilizador tem disponível, tal como descrito pelo "Decision Oracle" em
 * PORTIFY-KNOWLEDGE `04-financial-models/SAFETY/SAFETY-RESERVE-V1.md` §3B.1:
 * `EffectiveRiskFundingCap = MIN(active caps)`, com BLOCK a dominar sobre
 * CONDITIONAL e PASS.
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';
import type { SafetyGateResult, SafetyReserveResult } from '@/lib/models/safetyReserve';
import type { DebtAdapterResult } from '@/lib/models/debtAdapter';

export interface RiskFundingGateResult {
  gateResult: SafetyGateResult;
  /** 0-1 — MIN(safety.riskFundingCap, debt.debtRiskFundingCap). */
  effectiveRiskFundingCap: number;
  reasons: string[];
  /** Governance/versioning metadata — ver docs/model-governance.md. Campo aditivo. */
  meta?: ModelRunMeta;
}

const PRECEDENCE: Record<SafetyGateResult, number> = { BLOCK: 2, CONDITIONAL: 1, PASS: 0 };

function combineGateResult(safety: SafetyGateResult, debtCap: number): SafetyGateResult {
  const debtGate: SafetyGateResult = debtCap === 0 ? 'CONDITIONAL' : 'PASS';
  return PRECEDENCE[safety] >= PRECEDENCE[debtGate] ? safety : debtGate;
}

export function evaluateRiskFundingGate(
  safety: SafetyReserveResult,
  debt: DebtAdapterResult,
): RiskFundingGateResult {
  const effectiveRiskFundingCap = Math.min(safety.riskFundingCap, debt.debtRiskFundingCap);
  const gateResult = combineGateResult(safety.gateResult, debt.debtRiskFundingCap);
  const reasons = [...safety.reasons, ...debt.reasons];

  return {
    gateResult,
    effectiveRiskFundingCap,
    reasons,
    meta: createModelRunMeta({
      modelName: 'riskFundingGate',
      input: { safety, debt },
      assumptions: [
        'effectiveRiskFundingCap = MIN(safety.riskFundingCap, debt.debtRiskFundingCap); gateResult usa a precedência BLOCK > CONDITIONAL > PASS entre os dois motores.',
      ],
      warnings: reasons,
    }),
  };
}
