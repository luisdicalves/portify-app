/**
 * lib/recommendationEngine.ts — modelo v3.0
 *
 * Pipeline:
 *   Camada 2A — matchScore   (assetClassWeight 30% + sectorMatch 25% + goalCompatibility 25% + horizonCompatibility 20%)
 *   Camada 2B — qualityScore (do CandidateAsset, calculado em qualityScore.ts)
 *   Camada 2C — finalScore   = matchScore × 0.6 + qualityScore × 0.4
 *   Camada 3  — top 3 por classe, distribuição em euros, new vs reinforce
 *
 * v3.0: passa preferredClasses ao calcPlan (a alocação em euros só usa as
 * classes que o utilizador escolheu — antes o orçamento de classes excluídas
 * simplesmente desaparecia). Também alinha goalCompatibility e o cálculo de
 * subpesado/sobrepesado com o texto do modelo.
 */

import type { CandidateAsset, AssetClass } from '@/lib/assetUniverse';
import { sectorMatchScore }                from '@/lib/sectorMap';
import { calcPlan, type UserProfile } from '@/lib/planCalculator';

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

export interface OutOfPlanHolding {
  ticker:     string;
  assetClass: AssetClass;
  value:      number; // units × avgPrice
}

export interface RecommendationResult {
  recommendations:   Recommendation[];
  allocationPlan:    { stock: number; etf: number; bond_etf: number };
  riskScore:         number;
  monthlyAmount:     number;
  paceAlert:         boolean;            // true se ritmo insuficiente para atingir goal_amount
  goalReached:       boolean;            // true se goal_amount já foi atingido pelas classes ativas
  outOfPlanHoldings: OutOfPlanHolding[];  // holdings em classes fora de preferred_asset_classes
}

export interface HoldingSnapshot {
  ticker:     string;
  units:      number;
  avgPrice:   number;
  assetClass?: AssetClass; // opcional — usado para separar "classes ativas" (Passo 5) e detectar holdings fora do plano
}

export interface RecommendOptions {
  universe:         CandidateAsset[];
  profile:          UserProfile;
  preferredSectors: string[];
  monthlyAmount:    number;         // plano mensal em €
  goalAmount?:      number;         // objetivo total em €
  holdings?:        HoldingSnapshot[];
  preferredClasses?: AssetClass[];  // default: todas as 3 — respeitado por calcPlan (zera + renormaliza)
  maxPerClass?:     number;         // default 3
  maxPerSector?:    number;         // default 2 (só para stocks)
}

const ALL_CLASSES: AssetClass[] = ['stock', 'etf', 'bond_etf'];

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

/**
 * Camada 2A · goalCompatibility — segue o texto do modelo à letra:
 *   income        → dividend_yield > 2%        → +20  · pillars.health.score >= 70 → +10
 *   short_purchase→ beta < 0.5                  → +20
 *   wealth_growth → epsGrowthTTMYoy > 15%       → +20  · pillars.growth.score >= 70 → +15
 *   retirement    → assetClass === 'etf'        → +15
 *   legacy        → beta<1 && dividendYield>1%  → +15  · pillars.health.score >= 70 → +10
 *
 * pillarHealthScore/pillarGrowthScore/epsGrowthTTMYoy só existem para stocks
 * com RiskReport disponível — quando undefined, a condição simplesmente não
 * dispara (não penaliza, apenas não bonifica).
 */
function scoreGoalCompatibility(
  asset: CandidateAsset,
  goal: UserProfile['investment_goal'],
): number {
  let score = 50;

  switch (goal) {
    case 'income':
      if (asset.dividendYield > 2) score += 20;
      if ((asset.pillarHealthScore ?? -Infinity) >= 70) score += 10;
      break;

    case 'short_purchase':
      if (asset.beta < 0.5) score += 20;
      break;

    case 'wealth_growth':
      if ((asset.epsGrowthTTMYoy ?? -Infinity) > 15) score += 20;
      if ((asset.pillarGrowthScore ?? -Infinity) >= 70) score += 15;
      break;

    case 'retirement':
      if (asset.assetClass === 'etf') score += 15;
      break;

    case 'legacy':
      if (asset.beta < 1 && asset.dividendYield > 1) score += 15;
      if ((asset.pillarHealthScore ?? -Infinity) >= 70) score += 10;
      break;

    case 'emergency_fund':
      // Sem bonus definido no modelo — este objetivo é tratado inteiramente
      // pelo filtro duro da Camada 1 (só VGSH/BND/AGGH chegam até aqui).
      break;
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

  // savingsPlanSuitable vem do RiskReport.actionGuide (só stocks); para
  // ETFs/bond ETFs sem report usamos um proxy razoável (baixa volatilidade).
  const suitableForDCA = asset.savingsPlanSuitable ?? asset.beta <= 1.1;

  let extra = '';
  if (isSubweighted) {
    extra = 'Subpesado — aumentar para atingir peso ideal';
  } else if (type === 'reinforce') {
    extra = suitableForDCA ? 'Ideal para plano automático' : 'Reforço DCA';
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
  return Math.round(v / 5) * 5;
}

function roundTo5Min(v: number, min = 5): number {
  return Math.max(min, roundTo5(v));
}

/**
 * Distribui `totalEuros` pelos `items` proporcionalmente ao finalScore,
 * arredondando ao múltiplo de 5€. O último item absorve o resto do
 * arredondamento para que a soma feche em totalEuros (± o próprio
 * arredondamento de 5€). Reduz N se o valor por ativo cair abaixo do
 * mínimo (10€, Camada 3 · Passo 2 do modelo).
 */
function distributeAmounts(
  items: { finalScore: number }[],
  totalEuros: number,
  minPerItem = 10,
): number[] {
  // Orçamento insuficiente até para um único ativo (ex: classe zerada por
  // preferredClasses, ou fração residual < 10€) — não forçar nenhuma
  // recomendação artificial.
  if (items.length === 0 || totalEuros < minPerItem) {
    return items.map(() => 0);
  }

  let n = items.length;
  while (n > 1 && totalEuros / n < minPerItem) n--;

  const top = items.slice(0, n);
  const sum = top.reduce((s, i) => s + i.finalScore, 0);

  const amounts = top.map(item => roundTo5(totalEuros * (item.finalScore / (sum || 1))));

  const allocatedExceptLast = amounts.slice(0, -1).reduce((s, a) => s + a, 0);
  amounts[n - 1] = Math.max(minPerItem - (minPerItem % 5), roundTo5(totalEuros - allocatedExceptLast));

  return amounts.concat(items.slice(n).map(() => 0));
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
    holdings         = [],
    preferredClasses = ALL_CLASSES,
    maxPerClass      = 3,
    maxPerSector     = 2,
  } = opts;

  // v3.0: a alocação em euros respeita as classes escolhidas pelo utilizador —
  // classes excluídas são zeradas e o peso redistribuído (calcAllocation).
  const planResult = calcPlan(profile, preferredClasses);
  const alloc      = planResult.allocation;
  const riskScore  = planResult.riskScore;

  // ── Separar holdings "dentro do plano" (classe preferida) de "fora do plano" ──
  // Holdings sem assetClass conhecido (chamador não o forneceu) são tratados
  // como activos por omissão — só excluímos quando temos confirmação de que a
  // classe não está em preferredClasses (evita penalizar chamadores antigos
  // que ainda não populam este campo).
  const activeHoldings   = holdings.filter(h => !h.assetClass || preferredClasses.includes(h.assetClass));
  const outOfPlanHoldings: OutOfPlanHolding[] = holdings
    .filter(h => h.assetClass && !preferredClasses.includes(h.assetClass))
    .map(h => ({ ticker: h.ticker, assetClass: h.assetClass as AssetClass, value: h.units * h.avgPrice }));

  // Valor total da carteira, apenas classes activas (Camada 3 · Passo 5)
  const totalPortfolioValue = activeHoldings.reduce((s, h) => s + h.units * h.avgPrice, 0);

  // Mapa ticker → currentWeight (só holdings activos entram no denominador)
  const holdingMap = new Map<string, HoldingSnapshot>();
  for (const h of activeHoldings) holdingMap.set(h.ticker, h);

  // ── Score todos os candidatos ──────────────────────────────────────────────
  const scored = universe.map(asset => {
    const matchScore   = calcMatchScore(asset, profile, preferredSectors, alloc);
    const qualityScore = asset.qualityScore;
    const finalScore   = Math.round(matchScore * 0.6 + qualityScore * 0.4);
    return { asset, matchScore, qualityScore, finalScore };
  });

  // ── Seleccionar top N por classe com diversificação sectorial ──────────────
  // A verificação de sobrepeso usa alloc[cls]/maxPerClass como aproximação do
  // peso-alvo (o N final só é conhecido depois da distribuição em euros) —
  // suficiente para decidir "salta este e usa o próximo da lista".
  const byClass: Record<AssetClass, typeof scored> = {
    stock:    [],
    etf:      [],
    bond_etf: [],
  };

  for (const cls of ALL_CLASSES) {
    const candidates = scored
      .filter(s => s.asset.assetClass === cls)
      .sort((a, b) => b.finalScore - a.finalScore);

    const selected: typeof scored = [];
    const sectorCount = new Map<string, number>();

    for (const item of candidates) {
      if (selected.length >= maxPerClass) break;

      const holding = holdingMap.get(item.asset.ticker);
      if (holding && totalPortfolioValue > 0) {
        const currentW = (holding.units * holding.avgPrice) / totalPortfolioValue;
        const approxTargetW = alloc[cls] / maxPerClass;
        if (currentW > approxTargetW * 1.1) continue; // sobrepesado — pular, próximo da lista substitui
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

  // ── Distribuir euros por classe (Passo 1 + Passo 3) ────────────────────────
  const euros = {
    stock:    monthlyAmount * alloc.stock,
    etf:      monthlyAmount * alloc.etf,
    bond_etf: monthlyAmount * alloc.bond_etf,
  };

  const recommendations: Recommendation[] = [];

  for (const cls of ALL_CLASSES) {
    const items = byClass[cls];
    if (items.length === 0) continue;

    const baseAmounts = distributeAmounts(items, euros[cls]);

    items.forEach((item, idx) => {
      const baseAmount = baseAmounts[idx] ?? 0;
      if (baseAmount === 0) return;

      const holding        = holdingMap.get(item.asset.ticker);
      const alreadyOwned    = !!holding;
      const currentWeight   = (holding && totalPortfolioValue > 0)
        ? (holding.units * holding.avgPrice) / totalPortfolioValue
        : 0;

      // targetWeight = suggestedAmount / monthly_amount (Camada 3 · Passo 4)
      const targetWeight = baseAmount / monthlyAmount;

      const isOverweighted  = alreadyOwned && currentWeight > targetWeight * 1.1;
      if (isOverweighted) return; // já devia ter sido filtrado na selecção; salvaguarda final

      const isSubweighted = alreadyOwned && currentWeight < targetWeight * 0.9;

      let suggestedAmount = baseAmount;
      if (isSubweighted) {
        // gap = targetWeight - currentWeight; suggestedAmount = round(monthly_amount × gap / 5) × 5
        const gap = targetWeight - currentWeight;
        suggestedAmount = roundTo5Min(monthlyAmount * gap);
      }

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

  // ── Passo 5 — objectivo restante (classes activas apenas) ──────────────────
  let paceAlert   = false;
  let goalReached = false;

  if (goalAmount !== undefined) {
    const goalRestante = goalAmount - totalPortfolioValue;

    if (goalRestante <= 0) {
      goalReached = true;
    } else if (profile.horizon_years > 0) {
      const monthsLeft = profile.horizon_years * 12;
      const rate       = planResult.rate / 12;
      const pmtNeeded  = rate > 0
        ? goalRestante * rate / (Math.pow(1 + rate, monthsLeft) - 1)
        : goalRestante / monthsLeft;
      paceAlert = pmtNeeded > monthlyAmount * 1.1;
    }
  }

  return {
    recommendations,
    allocationPlan: alloc,
    riskScore,
    monthlyAmount,
    paceAlert,
    goalReached,
    outOfPlanHoldings,
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
