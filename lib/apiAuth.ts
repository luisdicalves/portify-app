import { createClient } from '@/lib/supabase/server';

// Route handlers under app/api/* call real market-data providers (Finnhub, Twelve
// Data, Yahoo) that have free-tier rate limits — require a logged-in session so
// these endpoints can't be hit anonymously from outside the app and drain the quota.
export async function getAuthedUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
