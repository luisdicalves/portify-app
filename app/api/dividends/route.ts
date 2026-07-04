import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthedUser } from '@/lib/apiAuth';
import { buildCashFlowForecast } from '@/lib/cashFlowForecast';

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient();

  const [{ data: holdingsRaw }, { data: txRaw }] = await Promise.all([
    supabase
      .from('holdings')
      .select('ticker, units')
      .eq('user_id', user.id),
    supabase
      .from('transactions')
      .select('ticker, amount, executed_at')
      .eq('user_id', user.id)
      .eq('type', 'dividend'),
  ]);

  const holdings = (holdingsRaw ?? []) as { ticker: string; units: number }[];
  const history  = (txRaw ?? []) as { ticker: string; amount: number; executed_at: string }[];

  const forecast = buildCashFlowForecast(holdings, history, 0, 0, { horizonMonths: 3 });

  return NextResponse.json(
    { dividends: forecast.dividends },
    { headers: { 'Cache-Control': 'private, max-age=3600' } }, // 1h cache
  );
}
