import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Destructive action — revalidate against Supabase Auth servers (getUser, not
// getSession) instead of trusting the local cookie, unlike the read-only
// market-data routes in lib/apiAuth.ts.
export async function POST() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: 'not_configured' }, { status: 500 });

  // profiles/holdings/transactions/investment_plans all cascade from
  // auth.users via "on delete cascade" FKs (see supabase-schema.sql) — deleting
  // the auth user wipes every row belonging to them.
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return NextResponse.json({ error: 'delete_failed' }, { status: 502 });

  return NextResponse.json({ ok: true });
}
