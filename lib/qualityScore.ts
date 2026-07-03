/**
 * lib/qualityScore.ts
 *
 * Calcula um qualityScore (0–100) para stocks individuais com base em
 * fundamentais obtidos via Finnhub /stock/metric.
 *
 * O score é composto por quatro dimensões com pesos fixos:
 *   Saúde financeira  35%  — liquidez, endividamento, free cash flow
 *   Crescimento       30%  — receita e lucro (TTM YoY)
 *   Rentabilidade     25%  — ROE, margens
 *   Estabilidade       10% — beta, posição no 52-week range
 *
 * Scores individuais são sempre 0–100 antes de ponderação.
 * Métricas em falta contribuem com 50 (neutro), para não penalizar
 * empresas com cobertura parcial.
 *
 * Exporta:
 *   StockMetrics — subset dos campos Finnhub usados aqui
 *   ScoreBreakdown — decomposição do score por dimensão (para debug/UI)
 *   calcQualityScore(metrics) → ScoreBreakdown & { total: number }
 *   qualityScoreFromMetrics(metrics) → number (0–100, arredondado)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface StockMetrics {
  // Saúde financeira
  currentRatioAnnual?:       number;   // Liquidez corrente (ideal ≥ 1.5)
  debtToEquityAnnual?:       number;   // Rácio D/E (menor é melhor)
  freeCashFlowPerShareAnnual?: number; // FCF/share positivo é bom sinal

  // Crescimento
  revenueGrowthTTMYoy?:      number;   // % YoY
  epsGrowthTTMYoy?:          number;   // % YoY (EPS)
  revenueGrowth3Y?:          number;   // CAGR 3 anos (mais estável que TTM)

  // Rentabilidade
  roeTTM?:                   number;   // Return on Equity %
  netProfitMarginTTM?:       number;   // Margem líquida %
  grossMarginTTM?:           number;   // Margem bruta %

  // Estabilidade
  beta?:                     number;   // vs. mercado (1 = neutro)
  '52WeekHigh'?:             number;
  '52WeekLow'?:              number;
  currentPrice?:             number;   // para calcular posição no range
}

export interface ScoreBreakdown {
  health:      number;  // 0–100
  growth:      number;  // 0–100
  profitability: number; // 0–100
  stability:   number;  // 0–100
  total:       number;  // 0–100 ponderado
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de scoring
// ─────────────────────────────────────────────────────────────────────────────

const NEUTRAL = 50;

// Interpola linearmente um valor entre [bad, good] → score 0–100.
// Se val < bad: 0; se val > good: 100.
function linear(val: number | undefined, bad: number, good: number): number {
  if (val === undefined || val === null || !isFinite(val)) return NEUTRAL;
  if (good === bad) return val >= good ? 100 : 0;
  const direction = good > bad ? 1 : -1;
  const clamped = direction > 0
    ? Math.max(bad, Math.min(good, val))
    : Math.max(good, Math.min(bad, val));
  return Math.round(((clamped - bad) / (good - bad)) * 100);
}

// Versão invertida: valores menores são melhores.
function invLinear(val: number | undefined, good: number, bad: number): number {
  return linear(val, bad, good);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensão 1 — Saúde financeira (35%)
// ─────────────────────────────────────────────────────────────────────────────

function scoreHealth(m: StockMetrics): number {
  // Liquidez corrente: < 0.8 péssimo, ≥ 2.5 excelente
  const liquidity = linear(m.currentRatioAnnual, 0.8, 2.5);

  // Dívida/Capital próprio: > 3 péssimo, ≤ 0.3 excelente
  // Empresas financeiras têm D/E estruturalmente alto → cap em 2 para não as penalizar demasiado
  const deRaw = m.debtToEquityAnnual !== undefined ? Math.min(m.debtToEquityAnnual, 5) : undefined;
  const leverage = invLinear(deRaw, 0.3, 3);

  // FCF/share: < 0 mau, ≥ 5 excelente (relativo ao preço não é calculado aqui)
  const fcf = m.freeCashFlowPerShareAnnual !== undefined
    ? m.freeCashFlowPerShareAnnual > 0 ? linear(m.freeCashFlowPerShareAnnual, 0, 10) : 10
    : NEUTRAL;

  return Math.round((liquidity * 0.40 + leverage * 0.35 + fcf * 0.25));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensão 2 — Crescimento (30%)
// ─────────────────────────────────────────────────────────────────────────────

function scoreGrowth(m: StockMetrics): number {
  // Crescimento de receita TTM: < -10% muito mau, ≥ 20% excelente
  const revTTM = linear(m.revenueGrowthTTMYoy, -10, 20);

  // Crescimento de EPS TTM: < -20% muito mau, ≥ 25% excelente
  const epsTTM = linear(m.epsGrowthTTMYoy, -20, 25);

  // Crescimento receita 3 anos (mais estável): < 0% mau, ≥ 15% excelente
  const rev3Y = linear(m.revenueGrowth3Y, 0, 15);

  // TTM tem mais peso; 3Y dá estabilidade
  // Se rev3Y não disponível, usa mais peso no TTM
  if (m.revenueGrowth3Y === undefined) {
    return Math.round(revTTM * 0.55 + epsTTM * 0.45);
  }
  return Math.round(revTTM * 0.40 + epsTTM * 0.35 + rev3Y * 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensão 3 — Rentabilidade (25%)
// ─────────────────────────────────────────────────────────────────────────────

function scoreProfitability(m: StockMetrics): number {
  // ROE: < 0% mau, ≥ 20% excelente (financeiras têm ROE alto estruturalmente)
  const roe = linear(m.roeTTM, 0, 20);

  // Margem líquida: < 0% mau, ≥ 20% excelente
  const netMargin = linear(m.netProfitMarginTTM, 0, 20);

  // Margem bruta: < 20% mau, ≥ 60% excelente (varia muito por setor)
  const grossMargin = linear(m.grossMarginTTM, 20, 60);

  // ROE e margem líquida são os drivers principais
  if (m.grossMarginTTM === undefined) {
    return Math.round(roe * 0.55 + netMargin * 0.45);
  }
  return Math.round(roe * 0.40 + netMargin * 0.35 + grossMargin * 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensão 4 — Estabilidade (10%)
// ─────────────────────────────────────────────────────────────────────────────

function scoreStability(m: StockMetrics): number {
  // Beta: > 2 muito volátil (mau), ≤ 0.7 muito estável (bom)
  // Nota: volatilidade baixa não é universalmente boa — peso baixo desta dimensão
  const betaScore = invLinear(m.beta, 0.7, 2.0);

  // Posição no 52-week range: próximo do máximo = momentum positivo (bom)
  // < 0.3 do range = perto do mínimo (mau), > 0.8 do range = perto do máximo (bom)
  let rangeScore = NEUTRAL;
  if (m['52WeekHigh'] && m['52WeekLow'] && m.currentPrice) {
    const range = m['52WeekHigh'] - m['52WeekLow'];
    if (range > 0) {
      const pos = (m.currentPrice - m['52WeekLow']) / range;
      rangeScore = Math.round(pos * 100);
    }
  }

  return Math.round(betaScore * 0.6 + rangeScore * 0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Score composto
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  health:       0.35,
  growth:       0.30,
  profitability: 0.25,
  stability:    0.10,
} as const;

/**
 * Calcula o qualityScore completo com decomposição por dimensão.
 * Útil para debug e para mostrar breakdown na UI de detalhe de ativo.
 */
export function calcQualityScore(metrics: StockMetrics): ScoreBreakdown {
  const health       = scoreHealth(metrics);
  const growth       = scoreGrowth(metrics);
  const profitability = scoreProfitability(metrics);
  const stability    = scoreStability(metrics);

  const total = Math.round(
    health       * WEIGHTS.health       +
    growth       * WEIGHTS.growth       +
    profitability * WEIGHTS.profitability +
    stability    * WEIGHTS.stability,
  );

  return { health, growth, profitability, stability, total };
}

/**
 * Versão simplificada — devolve apenas o score total (0–100).
 * Usado pelo assetUniverse.ts no enriquecimento de cada stock.
 */
export function qualityScoreFromMetrics(metrics: StockMetrics): number {
  return calcQualityScore(metrics).total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels para UI
// ─────────────────────────────────────────────────────────────────────────────

export function qualityLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Excelente',  color: 'var(--gain)'             };
  if (score >= 55) return { label: 'Bom',        color: 'var(--gain)'             };
  if (score >= 40) return { label: 'Neutro',     color: 'var(--on-surface-variant)' };
  if (score >= 25) return { label: 'Fraco',      color: '#F59E0B'                 };
  return                  { label: 'Muito fraco','color': 'var(--loss)'           };
}
