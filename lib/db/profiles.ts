import type { AppDatabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<AppDatabase>;
type ProfileUpdate = AppDatabase['public']['Tables']['profiles']['Update'];

export async function updateProfile(db: Client, userId: string, patch: ProfileUpdate) {
  return db.from('profiles').update(patch).eq('id', userId);
}
