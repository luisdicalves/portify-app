import type { AppDatabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<AppDatabase>;

export type HoldingRow = { ticker: string; units: number; avg_price: number };

export async function getHoldings(db: Client, userId: string): Promise<HoldingRow[]> {
  const { data } = await db
    .from('holdings')
    .select('ticker, units, avg_price')
    .eq('user_id', userId);
  return data ?? [];
}

export async function getHolding(db: Client, userId: string, ticker: string): Promise<{ units: number; avg_price: number } | null> {
  const { data } = await db
    .from('holdings')
    .select('units, avg_price')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .maybeSingle();
  return data ?? null;
}

export async function upsertHolding(db: Client, userId: string, ticker: string, units: number, avg_price: number) {
  return db.from('holdings').upsert({ user_id: userId, ticker, units, avg_price });
}

export async function updateHolding(db: Client, userId: string, ticker: string, patch: Partial<{ units: number; avg_price: number }>) {
  return db.from('holdings').update(patch).eq('user_id', userId).eq('ticker', ticker);
}

export async function deleteHolding(db: Client, userId: string, ticker: string) {
  return db.from('holdings').delete().eq('user_id', userId).eq('ticker', ticker);
}
