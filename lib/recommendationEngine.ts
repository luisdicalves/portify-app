/**
 * lib/recommendationEngine.ts — modelo v2.0
 *
 * Pipeline:
 *   Camada 2A — matchScore   (assetClassWeight 30% + sectorMatch 25% + goalCompatibility 25% + horizonCompatibility 20%)
 *   Camada 2B — qualityScore (do CandidateAsset, calculado em qualityScore.ts)
 *   Camada 2C — finalScore   = matchScore × 0.6 + qualityScore × 0.4
 *   Camada 3  — top 3 por classe, distribuição em euros, new vs reinforce
 */

import type { CandidateAsset, AssetClass } from '@/lib/assetUniverse';
import { sectorMatchScore }                from '@/lib/sectorMap';
import { calcRiskScore, calcPlan, type UserProfile } from '@/lib/planCalculator';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationType = 'new' | 'reinforce';

export interface Recommendation {
  asset:           CandidateAsset;
  matchScore:      number;             // 0–100
  qualityScore:    number;             // 0–100
  finalScore:      number;             // 0–100
  suggestedAmount: number;             // €/mês, múltiplo de 5
  allocationPct:   number;             // % do plano mensal (0–1)
  type:            RecommendationType;
  currentWeight:   number;             // peso atual na carteira (0 se não tem)
  targetWeight:    number;             // peso ideal segundo o modelo
  reason:          string;             // frase gerada automaticamente
  alreadyOwned:    boolean;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  allocationPlan: { stock: number; etf: number; bond_etf: number };
  riskScore:       number;
  monthlyAmount:   number;
  paceAlert:       boolean;  // true se ritmo insuficiente para atingir goal_amount
}

export interface HoldingSnapshot {
  ticker:    string;
  units:     number;
  avgPrice:  number;
}

export interface RecommendOptions {
  universe:         CandidateAsset[];
  profile:          UserProfile;
  preferredSectors: string[];
  monthlyAmount:    number;         // plano mensal em €
  goalAmount?:      number;         // objetivo total em €
  holdings?:        HoldingSnapshot[];
  maxPerClass?:     number;         // default 3
  maxPerSector?:    number;         // default 2 (só para stocks)
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada 2A — matchScore
// ─────────────────────────────────────────────────────────────────────────────

function scoreAssetClass(
  asset: CandidateAsset,
  alloc: { stock: number; etf: number; bond_etf: number },
): number {
  const weight   = alloc[asset.assetClass] ?? 0;
  const maxWeight = Math.max(alloc.stock, alloc.etf, alloc.bond_etf);
  if (maxWeight === 0) return 50;
  return Math.round(100 * weight / maxWeight);
}

function scoreGoalCompatibility(
  asset: CandidateAsset,
  goal: UserProfile['investment_goal'],
): number {
  let score = 50;

  switch (goal) {
    case 'income':
      if (asset.dividendYield > 2) score += 20;
      break;
    case 'short_purchase':
      if (asset.beta < 0.5) score += 20;
      break;
    case 'wealth_growth':
      if (asset.assetClass === 'stock') score += 10;
      break;
    case 'retirement':
      if (asset.assetClass === 'etf') score += 15;
      break;
    case 'legacy':
      if (asset.beta < 1 && asset.dividendYield > 1) score += 15;
      break;
    case 'emergency_fund':
      if (asset.assetClass === 'bond_etf') score += 25;
      break;
  }

  // qualityScore alto → bonus extra por objetivo
  if (asset.qualityScore >= 70) {
    if (goal === 'income' || goal === 'legacy') score += 10;
  }

  return Math.min(100, score);
}

function scoreHorizonCompatibility(
  asset: CandidateAsset,
  horizonYears: number,
): number {
  const { beta } = asset;
  if (horizonYears >= 10) {
    return beta > 1.0 ? 100 : 70;
  }
  if (horizonYears < 5) {
    return beta > 1.2 ? 20 : 80;
  }
  return 60;
}

function calcMatchScore(
  asset: CandidateAsset,
  profile: UserProfile,
  preferredSectors: string[],
  alloc: { stock: number; etf: number; bond_etf: number },
): number {
  const assetClassW    = scoreAssetClass(asset, alloc);
  const sectorW        = sectorMatchScore(asset.sector, preferredSectors);
  const goalW          = scoreGoalCompatibility(asset, profile.investment_goal);
  const horizonW       = scoreHorizonCompatibility(asset, profile.horizon_years);

  return Math.round(
    assetClassW * 0.30 +
    sectorW     * 0.25 +
    goalW       * 0.25 +
    horizonW    * 0.20,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração automática de reason
// ─────────────────────────────────────────────────────────────────────────────

const SECTOR_LABELS: Record<string, string> = {
  tech:       'Tecnologia',
  health:     'Saúde',
  finance:    'Finanças',
  energy:     'Energia',
  consumer:   'Consumo',
  industry:   'Indústria',
  realestate: 'Imobiliário',
  materials:  'Materiais',
  comms:      'Comunicações',
  other:      'Diversificado',
};

const GOAL_LABELS: Record<string, string> = {
  emergency_fund: 'liquidez',
  short_purchase: 'horizonte curto',
  income:         'rendimento passivo',
  wealth_growth:  'crescimento de capital',
  retirement:     'reforma',
  legacy:         'preservação de capital',
};

function buildReason(
  asset: CandidateAsset,
  finalScore: number,
  profile: UserProfile,
  type: RecommendationType,
  isSubweighted: boolean,
): string {
  const sector   = SECTOR_LABELS[asset.sector] ?? 'Diversificado';
  const goal     = GOAL_LABELS[profile.investment_goal] ?? '';
  const scorePart = `${finalScore}/100`;

  let extra = '';
  if (isSubweighted) {
    extra = 'Subpesado — aumentar para peso ideal';
  } else if (type === 'reinforce') {
    extra = asset.beta >= 1.1 ? 'Ideal para plano automático' : 'Reforço DCA';
  } else if (profile.investment_goal === 'income' && asset.dividendYield >= 2) {
    extra = `Dividendo ${asset.dividendYield.toFixed(1)}%/ano`;
  } else if (asset.assetClass === 'etf' || asset.assetClass === 'bond_etf') {
    extra = 'Diversificação automática';
  } else {
    extra = asset.qualityScore >= 70 ? 'Fundamentais sólidos' : 'Perfil compatível';
  }

  return [sector, goal, extra, scorePart].filter(Boolean).join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada 3 — distribuição em euros + new vs reinforce
// ─────────────────────────────────────────────────────────────────────────────

function roundTo5(v: number): number {
  return Math.max(5, Math.round(v / 5) * 5);
}

function distributeAmounts(
  items: { finalScore: number }[],
  totalEuros: number,
  minPerItem = 10,
): number[] {
  let n = items.length;
  // Reduzir N se montante por ativo < mínimo
  while (n > 1 && totalEuros / n < minPerItem) n--;

  const top  = items.slice(0, n);
  const sum  = top.reduce((s, i) => s + i.finalScore, 0);

  return top.map((item, idx) => {
    if (idx === n - 1) {
      // último recebe o resto (garante soma = totalEuros em múltiplos de 5)
      return 0; // calculado depois
    }
    return roundTo5(totalEuros * (item.finalScore / (sum || 1)));
  }).map((amt, idx, arr) => {
    if (idx < n - 1) return amt;
    const allocated = arr.slice(0, -1).reduce((s, a) => s + a, 0);
    return Math.max(5, roundTo5(totalEuros - allocated));
  }).concat(items.slice(n).map(() => 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────────────────────

export function recommend(opts: RecommendOptions): RecommendationResult {
  const {
    universe,
    profile,
    preferredSectors,
    monthlyAmount,
    goalAmount,
    holdings      = [],
    maxPerClass   = 3,
    maxPerSector  = 2,
  } = opts;

  const planResult = calcPlan(profile);
  const alloc      = planResult.allocation;
  const riskScore  = calcRiskScore(profile);

  // Valor total da carteira atual
  const totalPortfolioValue = holdings.reduce(
    (s, h) => s + h.units * h.avgPrice, 0,
  );

  // Mapa ticker → currentWeight
  const holdingMap = new Map<string, HoldingSnapshot>();
  for (const h of holdings) holdingMap.set(h.ticker, h);

  // ── Score todos os candidatos ──────────────────────────────────────────────
  const scored = universe.map(asset => {
    const matchScore   = calcMatchScore(asset, profile, preferredSectors, alloc);
    const qualityScore = asset.qualityScore;
    const finalScore   = Math.round(matchScore * 0.6 + qualityScore * 0.4);
    return { asset, matchScore, qualityScore, finalScore };
  });

  // ── Seleccionar top N por classe com diversificação setorial ──────────────
  const byClass: Record<AssetClass, typeof scored> = {
    stock:    [],
    etf:      [],
    bond_etf: [],
  };

  for (const cls of ['stock', 'etf', 'bond_etf'] as AssetClass[]) {
    const candidates = scored
      .filter(s => s.asset.assetClass === cls)
      .sort((a, b) => b.finalScore - a.finalScore);

    const selected: typeof scored = [];
    const sectorCount = new Map<string, number>();

    for (const item of candidates) {
      if (selected.length >= maxPerClass) break;

      // holding existente sobrepesado → excluir
      const holding = holdingMap.get(item.asset.ticker);
      if (holding && totalPortfolioValue > 0) {
        const currentW = (holding.units * holding.avgPrice) / totalPortfolioValue;
        const targetW  = alloc[cls] / maxPerClass;
        if (currentW > targetW * 1.1) continue; // sobrepesado — pular
      }

      if (cls === 'stock') {
        const count = sectorCount.get(item.asset.sector) ?? 0;
        if (count >= maxPerSector) continue;
        sectorCount.set(item.asset.sector, count + 1);
      }

      selected.push(item);
    }

    byClass[cls] = selected;
  }

  // ── Distribuir euros por classe ────────────────────────────────────────────
  const euros = {
    stock:    monthlyAmount * alloc.stock,
    etf:      monthlyAmount * alloc.etf,
    bond_etf: monthlyAmount * alloc.bond_etf,
  };

  const recommendations: Recommendation[] = [];

  for (const cls of ['stock', 'etf', 'bond_etf'] as AssetClass[]) {
    const items   = byClass[cls];
    if (items.length === 0) continue;

    const amounts = distributeAmounts(items, euros[cls]);

    items.forEach((item, idx) => {
      const suggestedAmount = amounts[idx] ?? 0;
      if (suggestedAmount === 0) return;

      const holding = holdingMap.get(item.asset.ticker);
      const alreadyOwned = !!holding;
      const currentWeight = (holding && totalPortfolioValue > 0)
        ? (holding.units * holding.avgPrice) / totalPortfolioValue
        : 0;
      const targetWeight  = alloc[cls] / items.length;

      const isSubweighted = alreadyOwned && currentWeight < targetWeight * 0.9;
      const type: RecommendationType = alreadyOwned ? 'reinforce' : 'new';

      recommendations.push({
        asset:           item.asset,
        matchScore:      item.matchScore,
        qualityScore:    item.qualityScore,
        finalScore:      item.finalScore,
        suggestedAmount,
        allocationPct:   suggestedAmount / monthlyAmount,
        type,
        currentWeight,
        targetWeight,
        reason:          buildReason(item.asset, item.finalScore, profile, type, isSubweighted),
        alreadyOwned,
      });
    });
  }

  // ── Ordenação: subpesados → novas compras → reforços DCA ──────────────────
  recommendations.sort((a, b) => {
    const rank = (r: Recommendation) => {
      if (r.alreadyOwned && r.currentWeight < r.targetWeight * 0.9) return 0; // subpesado
      if (!r.alreadyOwned) return 1;                                           // new
      return 2;                                                                // reinforce DCA
    };
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : b.finalScore - a.finalScore;
  });

  // ── Alerta de ritmo ───────────────────────────────────────────────────────
  let paceAlert = false;
  if (goalAmount && goalAmount > totalPortfolioValue && profile.horizon_years > 0) {
    const goalRestante   = goalAmount - totalPortfolioValue;
    const monthsLeft     = profile.horizon_years * 12;
    const rate           = planResult.rate / 12;
    // PMT necessário para atingir goal (fórmula FV de anuidade)
    const pmtNeeded = rate > 0
      ? goalRestante * rate / (Math.pow(1 + rate, monthsLeft) - 1)
      : goalRestante / monthsLeft;
    paceAlert = pmtNeeded > monthlyAmount * 1.1;
  }

  return {
    recommendations,
    allocationPlan: alloc,
    riskScore,
    monthlyAmount,
    paceAlert,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de apresentação
// ─────────────────────────────────────────────────────────────────────────────

export function recommendationBadge(score: number): { label: string; color: string } {
  if (score >= 78) return { label: 'Muito recomendado', color: 'var(--gain)'               };
  if (score >= 62) return { label: 'Recomendado',       color: 'var(--gain)'               };
  if (score >= 48) return { label: 'Neutro',            color: 'var(--on-surface-variant)' };
  return                  { label: 'Com reservas',      color: '#F59E0B'                   };
}

export function fmtEur(value: number): string {
  return `${value.toFixed(0)} €`;
}
