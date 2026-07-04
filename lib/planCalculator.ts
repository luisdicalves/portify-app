/**
 * lib/planCalculator.ts
 *
 * Calcula o perfil de risco numérico e alocação de ativos recomendada
 * com base nas respostas do questionário de onboarding.
 */

export interface UserProfile {
  risk_profile:     'very_conservative' | 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';
  investment_goal:  'wealth_growth' | 'income' | 'capital_preservation' | 'retirement' | 'education' | string;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | string;
  market_reaction:  'sell_all' | 'sell_some' | 'hold' | 'buy_more' | string;
  financial_status: 'struggling' | 'stable' | 'comfortable' | 'wealthy' | string;
  liquidity_need:   'very_likely' | 'likely' | 'unlikely' | 'very_unlikely' | string;
  horizon_years:    number;
}

export interface PlanResult {
  riskScore:  number;              // 0–100
  allocation: {
    stock:    number;              // 0–1
    etf:      number;              // 0–1
    bond_etf: number;              // 0–1
  };
  rate:     number;                // expected annual return (fraction)
  rateLow:  number;
  rateHigh: number;
  conflicts: string[];
}

const RISK_SCORE: Record<string, number> = {
  very_conservative: 10,
  conservative:      30,
  moderate:          50,
  aggressive:        70,
  very_aggressive:   90,
};

const EXPERIENCE_BOOST: Record<string, number> = {
  beginner:     -5,
  intermediate:  0,
  advanced:      5,
};

const REACTION_BOOST: Record<string, number> = {
  sell_all:  -10,
  sell_some:  -5,
  hold:        0,
  buy_more:   10,
};

const LIQUIDITY_PENALTY: Record<string, number> = {
  very_likely:   -15,
  likely:         -8,
  unlikely:        0,
  very_unlikely:   5,
};

export function calcPlan(profile: UserProfile): PlanResult {
  const base = RISK_SCORE[profile.risk_profile] ?? 50;
  const boost =
    (EXPERIENCE_BOOST[profile.experience_level] ?? 0) +
    (REACTION_BOOST[profile.market_reaction]    ?? 0) +
    (LIQUIDITY_PENALTY[profile.liquidity_need]  ?? 0);

  const riskScore = Math.min(100, Math.max(0, base + boost));

  // Horizon modifier: longer horizon → more equities
  const horizonBonus = Math.min(10, Math.floor((profile.horizon_years - 5) / 2));
  const effectiveScore = Math.min(100, Math.max(0, riskScore + horizonBonus));

  // Alocação base por score
  let stock:    number;
  let etf:      number;
  let bond_etf: number;

  if (effectiveScore <= 20) {
    stock = 0.05; etf = 0.15; bond_etf = 0.80;
  } else if (effectiveScore <= 35) {
    stock = 0.10; etf = 0.25; bond_etf = 0.65;
  } else if (effectiveScore <= 50) {
    stock = 0.20; etf = 0.40; bond_etf = 0.40;
  } else if (effectiveScore <= 65) {
    stock = 0.35; etf = 0.45; bond_etf = 0.20;
  } else if (effectiveScore <= 80) {
    stock = 0.50; etf = 0.40; bond_etf = 0.10;
  } else {
    stock = 0.65; etf = 0.30; bond_etf = 0.05;
  }

  // Income goal → shift towards dividend ETFs
  if (profile.investment_goal === 'income') {
    bond_etf = Math.min(bond_etf + 0.10, 0.40);
    stock    = Math.max(stock    - 0.05, 0.05);
  }

  // Capital preservation → more bonds
  if (profile.investment_goal === 'capital_preservation') {
    bond_etf = Math.min(bond_etf + 0.15, 0.60);
    stock    = Math.max(stock    - 0.10, 0.05);
    etf      = Math.max(etf      - 0.05, 0.10);
  }

  // Normalise to sum = 1
  const total = stock + etf + bond_etf;
  stock    = parseFloat((stock    / total).toFixed(4));
  etf      = parseFloat((etf      / total).toFixed(4));
  bond_etf = parseFloat((1 - stock - etf).toFixed(4));

  // Expected returns (rough annualised estimates)
  const rate     = stock * 0.09 + etf * 0.07 + bond_etf * 0.035;
  const rateLow  = stock * 0.05 + etf * 0.04 + bond_etf * 0.02;
  const rateHigh = stock * 0.14 + etf * 0.11 + bond_etf * 0.05;

  const conflicts: string[] = [];
  if (profile.liquidity_need === 'very_likely' && effectiveScore > 60) {
    conflicts.push('high_liquidity_with_high_risk');
  }

  return {
    riskScore: effectiveScore,
    allocation: { stock, etf, bond_etf },
    rate:     parseFloat(rate.toFixed(4)),
    rateLow:  parseFloat(rateLow.toFixed(4)),
    rateHigh: parseFloat(rateHigh.toFixed(4)),
    conflicts,
  };
}
