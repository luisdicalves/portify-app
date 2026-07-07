import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/apiAuth';
import { getCached } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { calcQualityEngineScore, buildQualityEngineInput } from '@/lib/engines/qualityEngine';
import { calcRiskEngineScore, buildRiskEngineInput } from '@/lib/engines/riskEngine';
import { calcConvictionEngineScore, buildConvictionEngineInput } from '@/lib/engines/convictionEngine';
import { classifyHoldingType } from '@/lib/engines/classification';
import type { AssetClass } from '@/lib/engines/types';
import type { Json } from '@/lib/supabase/database.types';

// Fundamentais não mudam intradiariamente — cache 24h, como /api/risk.
const SCORES_TTL_SECONDS = 24 * 60 * 60;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get('symbol');
  if (!ticker) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });
  const assetClass = (req.nextUrl.searchParams.get('assetClass') ?? undefined) as AssetClass | undefined;

  const finnhubApiKey = process.env.FINNHUB_API_KEY;
  const twelveDataApiKey = process.env.TWELVEDATA_API_KEY;

  let cacheMiss = false;
  try {
    const result = await getCached(`asset-scores:${ticker}`, SCORES_TTL_SECONDS, async () => {
      cacheMiss = true;

      const [qualityInput, riskInput, convictionInput] = await Promise.all([
        buildQualityEngineInput(ticker, finnhubApiKey),
        buildRiskEngineInput(ticker, { finnhubApiKey, twelveDataApiKey }),
        buildConvictionEngineInput(ticker, finnhubApiKey),
      ]);

      if (!qualityInput) return null;

      const quality = calcQualityEngineScore(qualityInput);
      const risk = calcRiskEngineScore(riskInput ?? {});
      const conviction = calcConvictionEngineScore(convictionInput ?? {});
      const holdingType = classifyHoldingType(ticker, assetClass);

      return { ticker, quality, risk, conviction, holdingType };
    });

    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Só persiste um novo snapshot histórico quando o cache dá miss — evita
    // uma linha nova em asset_scores em cada pedido repetido dentro do TTL.
    if (cacheMiss) {
      const supabase = await createClient();
      await supabase.from('asset_scores').insert({
        user_id: user.id,
        ticker: result.ticker,
        quality_score: result.quality.total,
        risk_score: result.risk.total,
        conviction_score: result.conviction.total,
        valuation_score: result.quality.valuationScore,
        financial_health_score: result.quality.financialHealthScore,
        growth_score: result.quality.growthScore,
        holding_type: result.holdingType,
        metadata: { risk: result.risk, conviction: result.conviction } as unknown as Json,
      });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
