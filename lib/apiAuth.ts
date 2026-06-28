import { createClient } from '@/lib/supabase/server';

// Route handlers under app/api/* call real market-data providers (Finnhub, Twelve
// Data, Yahoo) that have free-tier rate limits — require a logged-in session so
// these endpoints can't be hit anonymously from outside the app and drain the quota.
//
// Uses getSession() (reads the cookie locally) instead of getUser() (which always
// makes a network round-trip to Supabase Auth to revalidate the JWT). These routes
// only serve read-only market data, not anything sensitive, so the extra
// revalidation isn't worth paying for on every single ticker request.
export async function getAuthedUser() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}
