import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export type AppDatabase = Omit<Database, '__InternalSupabase'>;

export function createClient() {
  return createBrowserClient<AppDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
