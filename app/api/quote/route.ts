import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/marketData';
import { getCached } from '@/lib/cache';
import { getAuthedUser } from '@/lib/apiAuth';

const QUOTE_TTL_SECONDS = 45;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get('symbol');
  if (!ticker) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });

  const apiKey = process.env.FINNHUB_API_KEY;

  try {
    const quote = await getCached(`quote:${ticker}`, QUOTE_TTL_SECONDS, () => getQuote(ticker, apiKey));

    if (quote) return NextResponse.json(quote);
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
