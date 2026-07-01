/**
 * lib/planCalculator.ts
 *
 * Motor de cálculo do plano de investimento.
 * Três funções encadeadas:
 *   1. calcRiskScore   — converte o perfil do onboarding num score 0–100
 *   2. calcAllocation  — converte o score numa alocação por classe de ativo
 *   3. calcRate        — converte a alocação numa taxa anual estimada
 *
 * Usado em plan-set e summary para tornar a projecção dinâmica e honesta.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  risk_profile:      'very_conservative' | 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';
  investment_goal:   'emergency_fund' | 'short_purchase' | 'income' | 'wealth_growth' | 'retirement' | 'legacy';
  experience_level:  'none' | 'beginner' | 'intermediate' | 'experienced' | 'professional';
  market_reaction:   'sell_all' | 'sell_some' | 'hold' | 'buy_more';
  financial_status:  'unstable' | 'stable' | 'comfortable' | 'wealthy';
  liquidity_need:    'critical' | 'possible' | 'unlikely' | 'never';
  horizon_years:     number;
}

export interface Allocation {
  stock:    number; // 0–1
  etf:      number; // 0–1
  bond_etf: number; // 0–1
}

export interface PlanCalcResult {
  riskScore:  number;     // 0–100
  allocation: Allocation;
  rate:       number;     // taxa anual estimada (ex: 0.07 = 7%)
  rateLow:    number;     // intervalo pessimista (−1%)
  rateHigh:   number;     // intervalo optimista (+1%)
  conflicts:  string[];   // alertas de contradição detetados
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. calcRiskScore — score 0–100 a partir do perfil completo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pesos de cada dimensão no score final:
 *   risk_profile    40% — escolha mais consciente do utilizador
 *   investment_goal 20% — objetivo define o horizonte de risco
 *   horizon_years   20% — quanto mais tempo, mais risco pode aceitar
 *   market_reaction 15% — o que faz sob pressão revela mais do que diz
 *   experience      10% — experiência reduz erros comportamentais
 *   financial_status 5% — situação financeira limita o risco real
 *   liquidity_need   5% — necessidade de liquidez limita a alocação
 *                  ----
 *                  115% → normalizado para 100%
 */
const WEIGHTS = {
  risk_profile:    0.35,
  investment_goal: 0.20,
  horizon_years:   0.20,
  market_reaction: 0.13,
  experience:      0.07,
  financial_status: 0.03,
  liquidity_need:  0.02,
};

const RISK_PROFILE_SCORE: Record<UserProfile['risk_profile'], number> = {
  very_conservative: 10,
  conservative:      30,
  moderate:          50,
  aggressive:        75,
  very_aggressive:   95,
};

const GOAL_SCORE: Record<UserProfile['investment_goal'], number> = {
  emergency_fund: 10,  // precisa de liquidez total — mínimo risco
  short_purchase: 20,  // < 3 anos — pouco tempo para recuperar
  income:         35,  // dividendos — foco em estabilidade
  wealth_growth:  65,  // crescimento — aceita volatilidade
  retirement:     55,  // reforma — longo prazo mas com cautela crescente
  legacy:         70,  // legado — horizonte máximo, aceita risco
};

const REACTION_SCORE: Record<UserProfile['market_reaction'], number> = {
  sell_all:  15,  // comportamento conservador real — penaliza fortemente
  sell_some: 35,
  hold:      60,
  buy_more:  90,  // comportamento agressivo real
};

const EXPERIENCE_SCORE: Record<UserProfile['experience_level'], number> = {
  none:         20,
  beginner:     35,
  intermediate: 55,
  experienced:  75,
  professional: 90,
};

const FINANCIAL_SCORE: Record<UserProfile['financial_status'], number> = {
  unstable:    20,  // rendimento instável — não deve arriscar muito
  stable:      50,
  comfortable: 70,
  wealthy:     90,
};

const LIQUIDITY_SCORE: Record<UserProfile['liquidity_need'], number> = {
  critical: 10,  // pode precisar a qualquer momento — forçar conservadorismo
  possible: 35,
  unlikely: 65,
  never:    90,
};

function horizonScore(years: number): number {
  if (years < 2)  return 15;
  if (years < 5)  return 30;
  if (years < 10) return 55;
  if (years < 20) return 75;
  return 90;
}

export function calcRiskScore(p: UserProfile): number {
  const raw =
    RISK_PROFILE_SCORE[p.risk_profile]    * WEIGHTS.risk_profile +
    GOAL_SCORE[p.investment_goal]         * WEIGHTS.investment_goal +
    horizonScore(p.horizon_years)         * WEIGHTS.horizon_years +
    REACTION_SCORE[p.market_reaction]     * WEIGHTS.market_reaction +
    EXPERIENCE_SCORE[p.experience_level]  * WEIGHTS.experience +
    FINANCIAL_SCORE[p.financial_status]   * WEIGHTS.financial_status +
    LIQUIDITY_SCORE[p.liquidity_need]     * WEIGHTS.liquidity_need;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. calcAllocation — alocação por classe a partir do riskScore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabela de alocação base por banda de riskScore.
 * Ajustada depois por objetivo e liquidez.
 */
function baseAllocation(score: number): Allocation {
  if (score <= 20)  return { stock: 0.05, etf: 0.45, bond_etf: 0.50 };
  if (score <= 35)  return { stock: 0.15, etf: 0.55, bond_etf: 0.30 };
  if (score <= 50)  return { stock: 0.30, etf: 0.50, bond_etf: 0.20 };
  if (score <= 65)  return { stock: 0.45, etf: 0.45, bond_etf: 0.10 };
  if (score <= 80)  return { stock: 0.60, etf: 0.35, bond_etf: 0.05 };
  return              { stock: 0.75, etf: 0.25, bond_etf: 0.00 };
}

/**
 * Ajustes por objetivo de investimento.
 * Modificam o mix base deslocando peso entre classes.
 */
function applyGoalAdjustment(alloc: Allocation, goal: UserProfile['investment_goal']): Allocation {
  const a = { ...alloc };

  switch (goal) {
    case 'emergency_fund':
      // Forçar máximo conservadorismo independente do score
      return { stock: 0.00, etf: 0.30, bond_etf: 0.70 };

    case 'short_purchase':
      // Reduzir ações, aumentar bond ETFs para proteger capital a curto prazo
      a.bond_etf = Math.min(1, a.bond_etf + 0.15);
      a.stock    = Math.max(0, a.stock - 0.10);
      a.etf      = Math.max(0, a.etf   - 0.05);
      break;

    case 'income':
      // Aumentar ETFs de dividendos (tratados como etf), reduzir ações growth
      a.etf   = Math.min(1, a.etf   + 0.10);
      a.stock = Math.max(0, a.stock - 0.10);
      break;

    case 'wealth_growth':
      // Aumentar ações, reduzir bond ETFs
      a.stock    = Math.min(1, a.stock    + 0.08);
      a.bond_etf = Math.max(0, a.bond_etf - 0.08);
      break;

    case 'legacy':
      // Horizonte máximo — mais ações
      a.stock    = Math.min(1, a.stock    + 0.10);
      a.bond_etf = Math.max(0, a.bond_etf - 0.10);
      break;

    case 'retirement':
      // Moderado por natureza — sem ajuste grande
      break;
  }

  return normalise(a);
}

/**
 * Ajuste por necessidade de liquidez.
 * Se o utilizador pode precisar do dinheiro, aumentar bond ETFs.
 */
function applyLiquidityAdjustment(alloc: Allocation, liquidity: UserProfile['liquidity_need']): Allocation {
  const a = { ...alloc };

  switch (liquidity) {
    case 'critical':
      a.bond_etf = Math.min(1, a.bond_etf + 0.20);
      a.stock    = Math.max(0, a.stock    - 0.12);
      a.etf      = Math.max(0, a.etf     - 0.08);
      break;
    case 'possible':
      a.bond_etf = Math.min(1, a.bond_etf + 0.08);
      a.stock    = Math.max(0, a.stock    - 0.05);
      a.etf      = Math.max(0, a.etf     - 0.03);
      break;
    case 'unlikely':
    case 'never':
      // sem ajuste
      break;
  }

  return normalise(a);
}

/** Normaliza a alocação para que a soma seja sempre 1.0 */
function normalise(a: Allocation): Allocation {
  const total = a.stock + a.etf + a.bond_etf;
  if (total === 0) return { stock: 0, etf: 0.5, bond_etf: 0.5 };
  return {
    stock:    Math.round((a.stock    / total) * 100) / 100,
    etf:      Math.round((a.etf      / total) * 100) / 100,
    bond_etf: Math.round((a.bond_etf / total) * 100) / 100,
  };
}

export function calcAllocation(score: number, p: UserProfile): Allocation {
  let alloc = baseAllocation(score);
  alloc = applyGoalAdjustment(alloc, p.investment_goal);
  alloc = applyLiquidityAdjustment(alloc, p.liquidity_need);
  return normalise(alloc);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. calcRate — taxa anual estimada a partir da alocação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retornos históricos anuais estimados por classe de ativo.
 * Baseados em médias de longo prazo (20+ anos):
 *   stock:    ~10% (S&P 500 histórico nominal)
 *   etf:      ~8%  (ETFs diversificados globais, ex: MSCI World)
 *   bond_etf: ~3.5% (bond ETFs investment grade, mix curto/longo prazo)
 */
const ASSET_RETURNS = {
  stock:    0.100,
  etf:      0.080,
  bond_etf: 0.035,
};

/**
 * Penalização comportamental por reação a quedas.
 * Quem vende em pânico realiza perdas — o retorno real é menor.
 */
const REACTION_PENALTY: Record<UserProfile['market_reaction'], number> = {
  sell_all:  -0.025, // −2.5% — vende no pior momento
  sell_some: -0.010, // −1.0%
  hold:       0.000, // sem penalização
  buy_more:  +0.005, // +0.5% — aproveita as quedas
};

export function calcRate(alloc: Allocation, p: UserProfile): number {
  const baseRate =
    alloc.stock    * ASSET_RETURNS.stock +
    alloc.etf      * ASSET_RETURNS.etf +
    alloc.bond_etf * ASSET_RETURNS.bond_etf;

  const behaviorPenalty = REACTION_PENALTY[p.market_reaction];

  return Math.round((baseRate + behaviorPenalty) * 10000) / 10000; // 4 casas decimais
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deteção de contradições
// ─────────────────────────────────────────────────────────────────────────────

export function detectConflicts(p: UserProfile): string[] {
  const warnings: string[] = [];

  if ((p.risk_profile === 'aggressive' || p.risk_profile === 'very_aggressive') && p.market_reaction === 'sell_all')
    warnings.push('Disseste ser agressivo, mas vendias tudo numa queda — o teu perfil real foi ajustado para moderado.');

  if ((p.risk_profile === 'conservative' || p.risk_profile === 'very_conservative') && p.horizon_years >= 15)
    warnings.push(`Com ${p.horizon_years} anos de horizonte podes aceitar mais risco e obter maior retorno.`);

  if (p.investment_goal === 'emergency_fund')
    warnings.push('Para um fundo de emergência recomendamos uma conta poupança, não um portfólio de investimento.');

  if (p.liquidity_need === 'critical' && (p.risk_profile === 'aggressive' || p.risk_profile === 'very_aggressive'))
    warnings.push('Com necessidade crítica de liquidez, um perfil agressivo pode forçar-te a vender em mau momento.');

  if (p.financial_status === 'unstable' && (p.risk_profile === 'aggressive' || p.risk_profile === 'very_aggressive'))
    warnings.push('Com rendimento instável, um perfil agressivo aumenta o risco de perdas permanentes.');

  if (p.investment_goal === 'short_purchase' && p.horizon_years < 2)
    warnings.push('Com menos de 2 anos, o mercado pode estar em baixa quando precisares do dinheiro.');

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Função principal — calcula tudo de uma vez
// ─────────────────────────────────────────────────────────────────────────────

export function calcPlan(p: UserProfile): PlanCalcResult {
  const riskScore  = calcRiskScore(p);
  const allocation = calcAllocation(riskScore, p);
  const rate       = calcRate(allocation, p);

  return {
    riskScore,
    allocation,
    rate,
    rateLow:   Math.max(0, Math.round((rate - 0.01) * 10000) / 10000),
    rateHigh:  Math.round((rate + 0.01) * 10000) / 10000,
    conflicts: detectConflicts(p),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Funções de projecção financeira
// ─────────────────────────────────────────────────────────────────────────────

/** Valor futuro de contribuições mensais (juro composto) */
export function calcFV(monthlyPmt: number, annualRate: number, years: number): number {
  if (annualRate === 0) return monthlyPmt * 12 * years;
  const r = annualRate / 12;
  const n = years * 12;
  return Math.round(monthlyPmt * ((Math.pow(1 + r, n) - 1) / r));
}

/** Montante mensal necessário para atingir um objetivo */
export function calcPMT(goalAmount: number, annualRate: number, years: number): number {
  if (annualRate === 0) return goalAmount / (12 * years);
  const r = annualRate / 12;
  const n = years * 12;
  return Math.round(goalAmount * r / (Math.pow(1 + r, n) - 1));
}

/** Número de anos para atingir um objetivo com contribuição mensal fixa */
export function calcYears(goalAmount: number, monthlyPmt: number, annualRate: number): number {
  if (annualRate === 0) return Math.ceil(goalAmount / (monthlyPmt * 12));
  const r = annualRate / 12;
  return Math.ceil(Math.log(goalAmount * r / monthlyPmt + 1) / Math.log(1 + r) / 12);
}
