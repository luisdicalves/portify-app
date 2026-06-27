import { NextRequest, NextResponse } from 'next/server';
import { fetchRiskReport } from '@/lib/riskScore';
import { getCached } from '@/lib/cache';
import { getAuthedUser } from '@/lib/apiAuth';

// Fundamentals don't change intraday — cache for a day to minimize Finnhub calls.
const RISK_TTL_SECONDS = 24 * 60 * 60;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get('symbol');
  if (!ticker) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });
  const lang = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'pt';

  try {
    const report = await getCached(`risk:${ticker}:${lang}`, RISK_TTL_SECONDS, () => fetchRiskReport(ticker, lang));
    if (report) return NextResponse.json(report);
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
