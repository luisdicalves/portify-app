import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthedUser } from '@/lib/apiAuth';
import { getHoldings } from '@/lib/db/holdings';
import { buildCashFlowForecast } from '@/lib/cashFlowForecast';

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = await createClient();

  const [holdingsRaw, { data: txRaw }] = await Promise.all([
    getHoldings(supabase, user.id),
    supabase
      .from('transactions')
      .select('ticker, amount, executed_at')
      .eq('user_id', user.id)
      .eq('type', 'dividend'),
  ]);

  const holdings = holdingsRaw.map(h => ({ ticker: h.ticker, units: h.units }));
  const history = (txRaw ?? [])
    .filter((t): t is typeof t & { ticker: string; executed_at: string } => t.ticker != null && t.executed_at != null)
    .map(t => ({ ticker: t.ticker, amount: t.amount, executed_at: t.executed_at }));

  const forecast = buildCashFlowForecast(holdings, history, 0, 0, { horizonMonths: 3 });

  return NextResponse.json(
    { dividends: forecast.dividends },
    { headers: { 'Cache-Control': 'private, max-age=3600' } }, // 1h cache
  );
}
