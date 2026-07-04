import type { AppDatabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<AppDatabase>;
type TransactionInsert = AppDatabase['public']['Tables']['transactions']['Insert'];

export async function getTransactions(db: Client, userId: string) {
  return db
    .from('transactions')
    .select('id, ticker, type, units, price, amount, executed_at, notes')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false });
}

export async function insertTransaction(db: Client, row: TransactionInsert) {
  return db.from('transactions').insert(row);
}

export async function deleteTransaction(db: Client, id: string) {
  return db.from('transactions').delete().eq('id', id);
}
