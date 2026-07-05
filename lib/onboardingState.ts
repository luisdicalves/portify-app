export interface OnbPlan {
  amount: number;
  frequency: string;
  horizon_years: number;
  goal_amount: number;
  preferred_asset_classes: string[];
}

const KEYS = {
  riskProfile:    'onb_risk_profile',
  investmentGoal: 'onb_investment_goal',
  experienceLevel:'onb_experience_level',
  marketReaction: 'onb_market_reaction',
  financialStatus:'onb_financial_status',
  liquidityNeed:  'onb_liquidity_need',
  sectors:        'onb_sectors',
  plan:           'onb_plan',
} as const;

function get(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* noop */ }
}

export const onbState = {
  getRiskProfile():     string | null { return get(KEYS.riskProfile); },
  setRiskProfile(v: string):    void  { set(KEYS.riskProfile, v); },

  getInvestmentGoal():  string | null { return get(KEYS.investmentGoal); },
  setInvestmentGoal(v: string): void  { set(KEYS.investmentGoal, v); },

  getExperienceLevel(): string | null { return get(KEYS.experienceLevel); },
  setExperienceLevel(v: string): void { set(KEYS.experienceLevel, v); },

  getMarketReaction():  string | null { return get(KEYS.marketReaction); },
  setMarketReaction(v: string): void  { set(KEYS.marketReaction, v); },

  getFinancialStatus(): string | null { return get(KEYS.financialStatus); },
  setFinancialStatus(v: string): void { set(KEYS.financialStatus, v); },

  getLiquidityNeed():   string | null { return get(KEYS.liquidityNeed); },
  setLiquidityNeed(v: string):  void  { set(KEYS.liquidityNeed, v); },

  getSectors(): string[] {
    const raw = get(KEYS.sectors);
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  },
  setSectors(v: string[]): void { set(KEYS.sectors, JSON.stringify(v)); },

  getPlan(): OnbPlan | null {
    const raw = get(KEYS.plan);
    if (!raw) return null;
    try { return JSON.parse(raw) as OnbPlan; } catch { return null; }
  },
  setPlan(plan: OnbPlan): void { set(KEYS.plan, JSON.stringify(plan)); },

  clear(): void {
    Object.values(KEYS).forEach(k => {
      try { sessionStorage.removeItem(k); } catch { /* noop */ }
    });
  },
};
