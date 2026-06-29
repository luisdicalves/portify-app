import { NextRequest, NextResponse } from 'next/server';
import { getHistory } from '@/lib/marketData';
import { getCached } from '@/lib/cache';
import { getAuthedUser } from '@/lib/apiAuth';

// Daily candles only change once a day — safe to cache for hours.
const HISTORY_TTL_SECONDS = 6 * 60 * 60;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get('symbol');
  if (!ticker) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });

  const apiKey = process.env.TWELVEDATA_API_KEY;
  const outputsize = req.nextUrl.searchParams.get('outputsize') ?? '30';

  try {
    const points = await getCached(`history:${ticker}:${outputsize}`, HISTORY_TTL_SECONDS, () => getHistory(ticker, outputsize, apiKey));

    if (points) return NextResponse.json({ points });
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
