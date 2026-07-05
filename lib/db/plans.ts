import type { AppDatabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<AppDatabase>;
type PlanUpsert = AppDatabase['public']['Tables']['investment_plans']['Insert'];

export async function getPlan(db: Client, userId: string) {
  return db
    .from('investment_plans')
    .select('amount, frequency, horizon_years, goal_amount, preferred_asset_classes')
    .eq('user_id', userId)
    .maybeSingle();
}

export async function upsertPlan(db: Client, row: PlanUpsert) {
  return db.from('investment_plans').upsert(row, { onConflict: 'user_id' });
}
