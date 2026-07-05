/**
 * DB-accurate shape of the `profiles` table row.
 * All nullable columns are typed as `T | null` to match the Supabase schema.
 */
export interface DbProfile {
  first_name:       string | null;
  last_name:        string | null;
  user_handle:      string | null;
  risk_profile:     string | null;
  investment_goal:  string | null;
  experience_level: string | null;
  market_reaction:  string | null;
  financial_status: string | null;
  liquidity_need:   string | null;
  preferred_sectors: string[] | null;
  investor_since:   number | null;
}

/**
 * DB-accurate shape of the `investment_plans` table row.
 */
export interface DbPlan {
  amount:        number;
  frequency:     string;
  horizon_years: number;
  goal_amount:   number | null;
  asset_classes?: string[] | null;
}
