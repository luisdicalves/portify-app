'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

/**
 * Returns the authenticated Supabase user (or null while loading / not signed in).
 * Uses getUser() which validates the JWT with the server — safe for components
 * that need to confirm the session is still valid on mount.
 */
export function useUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}

/**
 * Returns the current user ID from the local session cache (no network round-trip).
 * Use this in submit/save handlers that fire inside an already-authenticated flow
 * where the session is guaranteed to exist.
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Returns the full User object via a server-validated JWT check.
 * Use this when you need fields beyond the user ID, or when you need
 * to guarantee the token hasn't been revoked.
 */
export async function getUser(): Promise<User | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
