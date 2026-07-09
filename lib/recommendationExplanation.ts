/**
 * lib/recommendationExplanation.ts
 *
 * Builds the informative RecommendationExplanation attached to each
 * Recommendation from lib/recommendationEngine.ts (types declared there).
 * Purely explanatory — nothing here feeds back into matchScore, qualityScore,
 * finalScore, or the 60/40 blend; see docs/model-governance.md.
 *
 * Kept in its own file rather than inside recommendationEngine.ts because
 * it's mostly copy-generation logic, not scoring — separating it keeps the
 * actual model pipeline easy to scan.
 *
 * Pure by the same rules as recommendationEngine.ts: no Supabase, no
 * external APIs, no React/Next.js, no lib/marketData.ts.
 */

import type { AssetClass, CandidateAsset } from '@/lib/assetUniverse';
import { isSectorMatch, sectorLabel } from '@/lib/sectorMap';
import type { UserProfile } from '@/lib/planCalculator';
import type { RecommendationType, RecommendationDataConfidence, RecommendationExplanation } from '@/lib/recommendationEngine';

// Local, small duplicate of recommendationEngine.ts's private GOAL_LABELS —
// intentional: keeps this file's dependency graph a one-way street (engine.ts
// imports from here, not the other way around) instead of exporting engine
// internals just for this. Six entries, low risk of drifting.
const GOAL_LABELS: Record<UserProfile['investment_goal'], string> = {
  emergency_fund: 'liquidez',
  short_purchase: 'horizonte curto',
  income:         'rendimento passivo',
  wealth_growth:  'crescimento de capital',
  retirement:     'reforma',
  legacy:         'preservação de capital',
};

const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  stock:    'ações',
  etf:      'ETFs',
  bond_etf: 'ETFs de obrigações',
};

export interface BuildExplanationInput {
  asset:            CandidateAsset;
  type:             RecommendationType;
  matchScore:       number;
  qualityScore:     number;
  currentWeight:    number;
  targetWeight:     number;
  isSubweighted:    boolean;
  alreadyOwned:     boolean;
  /** True when the underlying holding had a live marketValue, not a cost fallback. Irrelevant when !alreadyOwned. */
  hasMarketValue:   boolean;
  /** Whether the portfolio currently has any active holding in this asset's class. */
  classHasActiveHoldings: boolean;
  preferredSectors: string[];
  investmentGoal:   UserProfile['investment_goal'];
  /** externalWarnings entries that mention this specific ticker (caller already filtered these). */
  tickerWarnings:   string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// dataConfidence — informative only, does not affect ranking (see
// docs/model-governance.md). No `confidence`/`coverageStatus` field exists yet
// on CandidateAsset, so this is a simple, documented heuristic rather than a
// reuse of an upstream confidence value:
//   - a stock without pillarHealthScore (no RiskReport was available for it —
//     ETFs/bond ETFs never carry pillar data by design, so they're not
//     penalized for its absence) downgrades one level;
//   - an owned position whose value came from the average-cost fallback
//     (no live quote) downgrades one level;
//   - a data-quality warning that specifically mentions this ticker
//     downgrades one level.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIDENCE_ORDER: RecommendationDataConfidence[] = ['high', 'medium', 'low'];

function downgrade(level: RecommendationDataConfidence): RecommendationDataConfidence {
  const idx = CONFIDENCE_ORDER.indexOf(level);
  return CONFIDENCE_ORDER[Math.min(idx + 1, CONFIDENCE_ORDER.length - 1)];
}

export function inferDataConfidence(input: BuildExplanationInput): RecommendationDataConfidence {
  let level: RecommendationDataConfidence = 'high';

  if (input.asset.assetClass === 'stock' && input.asset.pillarHealthScore === undefined) {
    level = downgrade(level);
  }
  if (input.alreadyOwned && !input.hasMarketValue) {
    level = downgrade(level);
  }
  if (input.tickerWarnings.length > 0) {
    level = downgrade(level);
  }

  return level;
}

// ─────────────────────────────────────────────────────────────────────────────
// diversificationImpact — simple, deterministic bands on currentWeight /
// targetWeight. Explanatory only — never fed into finalScore.
// ─────────────────────────────────────────────────────────────────────────────

export function calcDiversificationImpact(currentWeight: number, targetWeight: number, alreadyOwned: boolean): number {
  if (!alreadyOwned) return 100; // brand-new position — maximizes exposure to a class/ticker not yet held
  if (!(targetWeight > 0)) return 50; // no target to compare against — neutral

  const ratio = currentWeight / targetWeight;
  if (ratio < 0.5) return 100;  // muito subponderado
  if (ratio < 0.9) return 70;   // moderadamente subponderado
  if (ratio <= 1.1) return 50;  // neutro, perto do alvo
  if (ratio <= 1.3) return 30;  // perto de sobreponderação
  return 0;                     // sobreponderado (não deveria chegar às recomendações, salvaguarda)
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy — primaryReason / portfolioEffect / riskNote
// ─────────────────────────────────────────────────────────────────────────────

export function getPrimaryReason(input: BuildExplanationInput): string {
  const { type, isSubweighted, asset, preferredSectors, classHasActiveHoldings } = input;

  if (type === 'reinforce') {
    return isSubweighted
      ? 'Reforça uma posição que está abaixo do peso-alvo definido pelo teu plano.'
      : 'A tua exposição atual a esta classe está abaixo da alocação sugerida.';
  }

  if (isSectorMatch(asset.sector, preferredSectors)) {
    return 'Respeita as tuas preferências sectoriais e melhora a diversificação.';
  }
  if (!classHasActiveHoldings) {
    return 'Ajuda a diversificar a carteira numa classe de ativo ainda pouco representada.';
  }
  return 'Encaixa no teu perfil e aumenta exposição a uma classe prevista no plano.';
}

export function getPortfolioEffect(input: BuildExplanationInput): string {
  const { type, asset, isSubweighted, preferredSectors } = input;

  if (type === 'new') {
    if (asset.assetClass !== 'stock') {
      return `Aumenta a exposição a ${ASSET_CLASS_LABEL[asset.assetClass]} e aproxima a carteira da alocação-alvo.`;
    }
    return isSectorMatch(asset.sector, preferredSectors)
      ? 'Aumenta a exposição ao sector preferido sem ultrapassar os limites atuais do plano.'
      : 'Ajuda a equilibrar a distribuição entre classes de ativo.';
  }

  if (isSubweighted) {
    return asset.assetClass === 'stock'
      ? 'Aproxima esta posição do peso-alvo definido pelo plano, sem concentrar demasiado a carteira.'
      : 'Reduz a dependência relativa de ações individuais ao reforçar uma classe mais diversificada.';
  }
  return 'Mantém a alocação atual próxima da meta através de um reforço regular.';
}

// Nota educativa e prudente — não é aconselhamento financeiro personalizado
// nem substitui o disclaimer completo. Só descreve o tipo de risco típico da
// classe de ativo (ou a limitação dos dados, quando a confiança é baixa).
export function getRiskNote(assetClass: AssetClass, dataConfidence: RecommendationDataConfidence): string {
  if (dataConfidence === 'low') {
    return 'A análise usa dados limitados; confirma custos, moeda e composição antes de investir.';
  }
  switch (assetClass) {
    case 'stock':    return 'Ações individuais podem ter maior volatilidade e risco específico da empresa.';
    case 'etf':      return 'ETFs reduzem risco específico, mas continuam expostos ao mercado e à moeda.';
    case 'bond_etf': return 'ETFs de obrigações podem oscilar com taxas de juro e risco de crédito.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestrador
// ─────────────────────────────────────────────────────────────────────────────

export function buildRecommendationExplanation(input: BuildExplanationInput): RecommendationExplanation {
  const dataConfidence = inferDataConfidence(input);
  const diversificationImpact = calcDiversificationImpact(input.currentWeight, input.targetWeight, input.alreadyOwned);

  const reasons: string[] = [
    `Sector: ${sectorLabel(input.asset.sector)}`,
    `Objetivo: ${GOAL_LABELS[input.investmentGoal]}`,
    input.qualityScore >= 70 ? 'Fundamentais sólidos' : 'Perfil compatível',
  ];
  if (input.isSubweighted) reasons.push('Posição subponderada face ao plano');

  const warnings: string[] = [];
  if (input.alreadyOwned && !input.hasMarketValue) {
    warnings.push('Cotação indisponível; foi usado preço médio como fallback.');
  }
  if (input.asset.assetClass === 'stock' && input.asset.pillarHealthScore === undefined) {
    warnings.push('Dados fundamentais limitados.');
  }
  if (diversificationImpact <= 30) {
    warnings.push('Classe de ativo próxima do peso-alvo.');
  }
  for (const w of input.tickerWarnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  return {
    primaryReason:   getPrimaryReason(input),
    portfolioEffect: getPortfolioEffect(input),
    riskNote:        getRiskNote(input.asset.assetClass, dataConfidence),
    dataConfidence,
    scoreBreakdown: {
      profileMatch:           input.matchScore,
      fundamentalQuality:     input.qualityScore,
      diversificationImpact,
    },
    reasons,
    warnings,
  };
}
