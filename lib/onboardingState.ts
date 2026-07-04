export interface OnbPlan {
  amount: number;
  frequency: string;
  horizon_years: number;
  goal_amount: number;
}

const KEYS = {
  riskProfile: 'onb_risk_profile',
  horizon:     'onb_horizon',
  plan:        'onb_plan',
} as const;

export const onbState = {
  getRiskProfile(): string | null {
    return sessionStorage.getItem(KEYS.riskProfile);
  },
  setRiskProfile(value: string): void {
    sessionStorage.setItem(KEYS.riskProfile, value);
  },

  getHorizon(): number | null {
    const raw = sessionStorage.getItem(KEYS.horizon);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  },
  setHorizon(years: number): void {
    sessionStorage.setItem(KEYS.horizon, String(years));
  },

  getPlan(): OnbPlan | null {
    const raw = sessionStorage.getItem(KEYS.plan);
    if (!raw) return null;
    try { return JSON.parse(raw) as OnbPlan; } catch { return null; }
  },
  setPlan(plan: OnbPlan): void {
    sessionStorage.setItem(KEYS.plan, JSON.stringify(plan));
  },

  clear(): void {
    sessionStorage.removeItem(KEYS.riskProfile);
    sessionStorage.removeItem(KEYS.horizon);
    sessionStorage.removeItem(KEYS.plan);
  },
};
