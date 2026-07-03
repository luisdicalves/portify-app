/**
 * lib/recommendationEngine.ts
 *
 * Motor de recomendações do Portify — Step 6.
 *
 * Recebe o universo filtrado (Camada 1, já aplicada em assetUniverse.ts)
 * e o perfil do utilizador, e produz uma lista ordenada de recomendações
 * com score composto, razão e alocação-alvo.
 *
 * Pipeline (Camadas 2 e 3):
 *   Camada 2 — Scoring composto por ativo
 *     qualityScore    40%  — fundamentais (qualityScore.ts)
 *     sectorMatch     30%  — alinhamento com setores preferidos
 *     riskFit         20%  — beta vs. tolerância ao risco do utilizador
 *     yieldFit        10%  — dividendos vs. objetivo de rendimento
 *
 *   Camada 3 — Seleção e alocação
 *     - Agrupa por classe (stock / etf / bond_etf)
 *     - Aplica os pesos de alocação do calcPlan (ex: 60% stocks, 30% ETFs)
 *     - Garante diversificação setorial (máx. 2 stocks por setor)
 *     - Devolve top N ativos por classe com targetAllocation calculado
 *
 * Exporta:
 *   Recommendation       — tipo de saída por ativo recomendado
 *   RecommendationResult — resultado completo do motor
 *   recommend(opts)      — função principal
 */

import type { CandidateAsset, AssetClass } from '@/lib/assetUniverse';
import { sectorMatchScore }                from '@/lib/sectorMap';
import { calcPlan, type UserProfile }       from '@/lib/planCalculator';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface Recommendation {
  asset:            CandidateAsset;
  score:            number;           // 0–100 score composto final
  scoreBreakdown: {
    quality:    number;               // 0–100
    sector:     number;               // 0 | 35 | 100
    riskFit:    number;               // 0–100
    yieldFit:   number;               // 0–100
  };
  targetAllocation: number;           // % do portfólio (0–1)
  reasons:          string[];         // frases curtas para a UI
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  allocationPlan: {
    stock:    number;                 // 0–1 do calcPlan
    etf:      number;
    bond_etf: number;
  };
  riskScore: number;                  // score do utilizador (calcPlan)
}

export interface RecommendOptions {
  universe:          CandidateAsset[];
  profile:           UserProfile;
  preferredSectors:  string[];        // ids de setor preferidos (onboarding)
  maxResults?:       number;          // default 20
  maxPerSector?:     number;          // max stocks por setor, default 2
}

// ─────────────────────────────────────────────────────────────────────────────
// Pesos do score composto
// ─────────────────────────────────────────────────────────────────────────────

const W = {
  quality:  0.40,
  sector:   0.30,
  riskFit:  0.20,
  yieldFit: 0.10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Camada 2 — Scoring por ativo
// ─────────────────────────────────────────────────────────────────────────────

// Beta ideal por perfil de risco
const IDEAL_BETA: Record<UserProfile['risk_profile'], number> = {
  very_conservative: 0.4,
  conservative:      0.7,
  moderate:          1.0,
  aggressive:        1.3,
  very_aggressive:   1.6,
};

function scoreRiskFit(asset: CandidateAsset, profile: UserProfile): number {
  const ideal = IDEAL_BETA[profile.risk_profile];
  const diff  = Math.abs(asset.beta - ideal);
  // Penalidade linear: diff=0 → 100, diff≥1.5 → 0
  return Math.max(0, Math.round(100 - (diff / 1.5) * 100));
}

function scoreYieldFit(asset: CandidateAsset, profile: UserProfile): number {
  const isIncomeGoal = profile.investment_goal === 'income';
  const yield_ = asset.dividendYield;

  if (isIncomeGoal) {
    // Objetivo rendimento: prefere dividendos altos (> 3% excelente, 0% mau)
    if (yield_ >= 4)   return 100;
    if (yield_ >= 3)   return 80;
    if (yield_ >= 1.5) return 55;
    if (yield_ >= 0.5) return 30;
    return 10;
  } else {
    // Outros objetivos: dividendo alto não é prioritário, mas não é mau
    // Score neutro por defeito; penaliza ligeiramente ativos sem dividendo
    // para separar empatados (não é um critério decisivo)
    if (yield_ >= 2)   return 70;
    if (yield_ >= 0.5) return 55;
    return 45;
  }
}

function scoreAsset(
  asset: CandidateAsset,
  profile: UserProfile,
  preferredSectors: string[],
): Recommendation['scoreBreakdown'] & { total: number } {
  const quality  = asset.qualityScore;
  const sector   = sectorMatchScore(asset.sector, preferredSectors);
  const riskFit  = scoreRiskFit(asset, profile);
  const yieldFit = scoreYieldFit(asset, profile);

  const total = Math.round(
    quality  * W.quality  +
    sector   * W.sector   +
    riskFit  * W.riskFit  +
    yieldFit * W.yieldFit,
  );

  return { quality, sector, riskFit, yieldFit, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração de razões (frases curtas para a UI)
// ─────────────────────────────────────────────────────────────────────────────

function buildReasons(
  asset: CandidateAsset,
  breakdown: Recommendation['scoreBreakdown'],
  profile: UserProfile,
  preferredSectors: string[],
): string[] {
  const reasons: string[] = [];

  if (breakdown.quality >= 70)
    reasons.push('Fundamentais sólidos');
  else if (breakdown.quality < 40)
    reasons.push('Fundamentais fracos — risco elevado');

  if (breakdown.sector === 100)
    reasons.push('Setor preferido');

  if (breakdown.riskFit >= 75)
    reasons.push('Beta alinhado com o teu perfil de risco');
  else if (breakdown.riskFit < 40)
    reasons.push(asset.beta > 1.2 ? 'Ativo volátil para o teu perfil' : 'Beta baixo para o teu perfil');

  if (profile.investment_goal === 'income' && asset.dividendYield >= 3)
    reasons.push(`Dividendo ${asset.dividendYield.toFixed(1)}% ao ano`);

  if (asset.assetClass === 'etf' || asset.assetClass === 'bond_etf')
    reasons.push('Diversificação automática');

  if (asset.assetClass === 'bond_etf' && profile.risk_profile === 'very_conservative')
    reasons.push('Adequado para perfil muito conservador');

  return reasons.slice(0, 3); // máx. 3 razões por ativo
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada 3 — Seleção, diversificação e alocação
// ─────────────────────────────────────────────────────────────────────────────

function selectWithDiversification(
  scored: (CandidateAsset & { _score: number; _breakdown: Recommendation['scoreBreakdown'] })[],
  maxTotal: number,
  maxPerSector: number,
): typeof scored {
  const sectorCount = new Map<string, number>();
  const selected: typeof scored = [];

  for (const asset of scored) {
    if (selected.length >= maxTotal) break;

    // ETFs e bond ETFs não têm restrição setorial (sector = 'other' maioritariamente)
    if (asset.assetClass !== 'stock') {
      selected.push(asset);
      continue;
    }

    const count = sectorCount.get(asset.sector) ?? 0;
    if (count >= maxPerSector) continue;

    sectorCount.set(asset.sector, count + 1);
    selected.push(asset);
  }

  return selected;
}

function assignAllocations(
  byClass: Record<AssetClass, Recommendation[]>,
  planAlloc: { stock: number; etf: number; bond_etf: number },
): void {
  for (const cls of ['stock', 'etf', 'bond_etf'] as AssetClass[]) {
    const items = byClass[cls];
    if (items.length === 0) continue;

    const classWeight = planAlloc[cls];

    // Distribui o peso da classe pelos ativos, com scores como pesos relativos
    const totalScore = items.reduce((s, r) => s + r.score, 0);
    for (const rec of items) {
      rec.targetAllocation = totalScore > 0
        ? parseFloat(((rec.score / totalScore) * classWeight).toFixed(4))
        : parseFloat((classWeight / items.length).toFixed(4));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera recomendações ordenadas para um utilizador.
 *
 * O universo passado deve ter sido pré-filtrado por filterUniverseForUser()
 * antes de chamar esta função.
 *
 * @example
 * const universe = await getUniverse();
 * const filtered = filterUniverseForUser(universe, { ... });
 * const result   = recommend({ universe: filtered, profile, preferredSectors });
 */
export function recommend(opts: RecommendOptions): RecommendationResult {
  const {
    universe,
    profile,
    preferredSectors,
    maxResults   = 20,
    maxPerSector = 2,
  } = opts;

  const planResult = calcPlan(profile);
  const alloc      = planResult.allocation;

  // Determinar quantos ativos por classe (proporcional à alocação)
  const totalSlots  = maxResults;
  const stockSlots  = Math.round(totalSlots * alloc.stock);
  const etfSlots    = Math.round(totalSlots * alloc.etf);
  const bondSlots   = totalSlots - stockSlots - etfSlots;

  const byClass: Record<AssetClass, Recommendation[]> = {
    stock:    [],
    etf:      [],
    bond_etf: [],
  };

  for (const cls of ['stock', 'etf', 'bond_etf'] as AssetClass[]) {
    const candidates = universe.filter(a => a.assetClass === cls);
    const slots = cls === 'stock' ? stockSlots : cls === 'etf' ? etfSlots : bondSlots;
    if (slots === 0 || candidates.length === 0) continue;

    // Score todos os candidatos da classe
    const scored = candidates
      .map(asset => {
        const s = scoreAsset(asset, profile, preferredSectors);
        return { ...asset, _score: s.total, _breakdown: s };
      })
      .sort((a, b) => b._score - a._score);

    // Aplicar diversificação setorial (só para stocks)
    const selected = cls === 'stock'
      ? selectWithDiversification(scored, slots, maxPerSector)
      : scored.slice(0, slots);

    byClass[cls] = selected.map(a => ({
      asset:            { ticker: a.ticker, name: a.name, exchange: a.exchange, assetClass: a.assetClass, sector: a.sector, beta: a.beta, dividendYield: a.dividendYield, marketCap: a.marketCap, qualityScore: a.qualityScore, currency: a.currency },
      score:            a._score,
      scoreBreakdown:   a._breakdown,
      targetAllocation: 0, // preenchido por assignAllocations
      reasons:          buildReasons(a, a._breakdown, profile, preferredSectors),
    }));
  }

  assignAllocations(byClass, alloc);

  // Lista final: stocks → ETFs → bond ETFs, dentro de cada grupo por score desc
  const recommendations = [
    ...byClass.stock,
    ...byClass.etf,
    ...byClass.bond_etf,
  ];

  return {
    recommendations,
    allocationPlan: alloc,
    riskScore:      planResult.riskScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de apresentação
// ─────────────────────────────────────────────────────────────────────────────

/** Formata targetAllocation como percentagem legível. */
export function fmtAllocation(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Score composto → badge de texto para a UI. */
export function recommendationBadge(score: number): { label: string; color: string } {
  if (score >= 78) return { label: 'Muito recomendado', color: 'var(--gain)'               };
  if (score >= 62) return { label: 'Recomendado',       color: 'var(--gain)'               };
  if (score >= 48) return { label: 'Neutro',            color: 'var(--on-surface-variant)' };
  return                  { label: 'Com reservas',      color: '#F59E0B'                   };
}
