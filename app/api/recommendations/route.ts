import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthedUser } from '@/lib/apiAuth';
import { getUniverse, filterUniverseForUser, type AssetClass, type CandidateAsset } from '@/lib/assetUniverse';
import { getHoldings } from '@/lib/db/holdings';
import { recommend, type HoldingSnapshot } from '@/lib/recommendationEngine';
import type { UserProfile } from '@/lib/planCalculator';
import { fetchRiskReport } from '@/lib/riskScore';
import { calcQualityScoreFromReport } from '@/lib/qualityScore';
import { checkRateLimit } from '@/lib/rateLimiter';
import { getQuote } from '@/lib/marketData';
import { getCached } from '@/lib/cache';
import { buildPortfolioState } from '@/lib/portfolio/portfolioState';
import { holdingsToPortfolioInput, quotesToLatestQuotes, DEFAULT_CURRENCY } from '@/lib/portfolio/portfolioStateAdapters';

// ── Enum parsers ──────────────────────────────────────────────────────────────
function parseEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const RISK_PROFILES     = ['very_conservative', 'conservative', 'moderate', 'aggressive', 'very_aggressive'] as const;
const INVESTMENT_GOALS  = ['emergency_fund', 'short_purchase', 'income', 'wealth_growth', 'retirement', 'legacy'] as const;
const EXPERIENCE_LEVELS = ['none', 'beginner', 'intermediate', 'experienced', 'professional'] as const;
const MARKET_REACTIONS  = ['sell_all', 'sell_some', 'hold', 'buy_more'] as const;
const FINANCIAL_STATUSES = ['unstable', 'stable', 'comfortable', 'wealthy'] as const;
const LIQUIDITY_NEEDS   = ['critical', 'possible', 'unlikely', 'never'] as const;
const ASSET_CLASSES: readonly AssetClass[] = ['stock', 'etf', 'bond_etf'] as const;

// investment_plans.preferred_asset_classes vem como text[] do Supabase — filtra
// valores desconhecidos e cai para as 3 classes se o campo estiver vazio/nulo
// (mantém o comportamento anterior para planos criados antes desta coluna existir).
function parseAssetClasses(value: string[] | null | undefined): AssetClass[] {
  const valid = (value ?? []).filter((v): v is AssetClass => (ASSET_CLASSES as readonly string[]).includes(v));
  return valid.length > 0 ? valid : [...ASSET_CLASSES];
}

// 2 calls per hour per user — the Finnhub calls are cached server-side;
// this prevents burst abuse of the rate limiter.
const RATE_LIMIT_MAX    = 2;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// Same cache key/TTL as app/api/quote/route.ts — intentional, so both routes
// share the same cached quote instead of each keeping their own copy.
const QUOTE_TTL_SECONDS = 45;

// Stable hash of the inputs that determine the recommendation output.
// When profile or holdings change the ETag changes → browser re-fetches.
function makeETag(
  profile: Record<string, unknown>,
  holdingsSig: string,
  horizonYears: number,
  monthlyAmount: number,
): string {
  const raw = JSON.stringify({ profile, holdingsSig, horizonYears, monthlyAmount });
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return `"rec-${(h >>> 0).toString(16)}"`;
}

export async function GET(req: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = checkRateLimit(user.id, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds ?? 3600) },
      },
    );
  }

  const supabase = await createClient();

  // ── Perfil ────────────────────────────────────────────────────────────────
  const { data: profileRaw, error: profileErr } = await supabase
    .from('profiles')
    .select('risk_profile, investment_goal, experience_level, market_reaction, financial_status, liquidity_need, preferred_sectors, risk_score')
    .eq('id', user.id)
    .single();

  if (profileErr || !profileRaw) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  if (!profileRaw.risk_profile || !profileRaw.investment_goal) {
    return NextResponse.json({ error: 'incomplete_profile' }, { status: 422 });
  }

  // ── Plano de investimento ─────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from('investment_plans')
    .select('horizon_years, amount, goal_amount, preferred_asset_classes')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const horizonYears:  number             = plan?.horizon_years ?? 10;
  const monthlyAmount: number             = plan?.amount        ?? 250;
  const goalAmount:    number | undefined = plan?.goal_amount   ?? undefined;
  const preferredClasses: AssetClass[]    = parseAssetClasses(plan?.preferred_asset_classes);

  // ── Holdings ──────────────────────────────────────────────────────────────
  // assetClass é anexado mais abaixo (Passo 5 do modelo precisa de saber quais
  // holdings pertencem a classes fora do plano) usando o universo completo,
  // ainda não filtrado, como mapa ticker → classe.
  const holdingsRaw = await getHoldings(supabase, user.id);
  const holdingsBase = holdingsRaw.map(h => ({ ticker: h.ticker, units: h.units, avgPrice: h.avg_price }));

  // ── UserProfile ───────────────────────────────────────────────────────────
  const userProfile: UserProfile = {
    risk_profile:     parseEnum(profileRaw.risk_profile,     RISK_PROFILES,      'moderate'),
    investment_goal:  parseEnum(profileRaw.investment_goal,  INVESTMENT_GOALS,   'wealth_growth'),
    experience_level: parseEnum(profileRaw.experience_level, EXPERIENCE_LEVELS,  'beginner'),
    market_reaction:  parseEnum(profileRaw.market_reaction,  MARKET_REACTIONS,   'hold'),
    financial_status: parseEnum(profileRaw.financial_status, FINANCIAL_STATUSES, 'stable'),
    liquidity_need:   parseEnum(profileRaw.liquidity_need,   LIQUIDITY_NEEDS,    'unlikely'),
    horizon_years:    horizonYears,
  };

  const preferredSectors: string[] = profileRaw.preferred_sectors ?? [];

  try {
    const universe = await getUniverse();

    // ── Valor de mercado das posições ─────────────────────────────────────────
    // Mesma semântica conceptual de Dashboard/Portfolio: holdings snapshot +
    // cotações mais recentes, sem replay de transactions (ver
    // lib/hooks/usePortfolioData.ts / app/dashboard/page.tsx). Uma falha de
    // cotação isolada não deve rebentar o endpoint inteiro — cai para null e
    // buildPortfolioState() usa o fallback de average cost, tal como as outras
    // páginas já fazem.
    const finnhubApiKey = process.env.FINNHUB_API_KEY;
    const quoteEntries = await Promise.all(
      holdingsRaw.map(async (h): Promise<readonly [string, { price: number } | null]> => {
        try {
          const quote = await getCached(`quote:${h.ticker}`, QUOTE_TTL_SECONDS, () => getQuote(h.ticker, finnhubApiKey));
          return [h.ticker, quote] as const;
        } catch (err) {
          console.error(`[/api/recommendations] quote fetch failed for ${h.ticker}`, err);
          return [h.ticker, null] as const;
        }
      })
    );
    const quoteByTicker: Record<string, { price: number } | null> = Object.fromEntries(quoteEntries);

    const portfolioState = buildPortfolioState({
      holdings: holdingsToPortfolioInput(holdingsRaw),
      transactions: [],
      latestQuotes: quotesToLatestQuotes(quoteByTicker),
      userCurrency: DEFAULT_CURRENCY,
    });
    const marketValueByTicker = new Map(portfolioState.holdings.map(h => [h.ticker, h.marketValue]));

    // Ticker → assetClass a partir do universo completo (ainda não filtrado) —
    // usado para saber se um holding existente pertence a uma classe fora do
    // plano (preferredClasses), independentemente de o filtro duro o ter excluído.
    const tickerClassMap = new Map<string, AssetClass>(universe.map((a: CandidateAsset) => [a.ticker, a.assetClass]));
    const holdings: HoldingSnapshot[] = holdingsBase.map(h => ({
      ...h,
      assetClass: tickerClassMap.get(h.ticker),
      marketValue: marketValueByTicker.get(h.ticker),
    }));

    const filtered = filterUniverseForUser(universe, {
      preferredAssetClasses: preferredClasses,
      investmentGoal:        userProfile.investment_goal,
      liquidityNeed:         userProfile.liquidity_need,
      horizonYears,
      riskProfile:           userProfile.risk_profile,
    });

    // ── Enriquecer stocks com RiskReport (cached 24h) ────────────────────────
    // Aproveita os reports para: (a) qualityScore personalizado, (b) filtro duro
    const CONSERVATIVE_PROFILES = new Set(['very_conservative', 'conservative', 'moderate']);

    const enriched = (
      await Promise.all(
        filtered.map(async asset => {
          if (asset.assetClass !== 'stock') return { asset, report: null };
          const report = await fetchRiskReport(asset.ticker, 'pt');
          return { asset, report };
        })
      )
    )
      // ── Filtro duro baseado em RiskReport ──────────────────────────────────
      .filter(({ asset, report }) => {
        if (!report) return true; // sem report → não excluir (benefício da dúvida)

        // Saúde financeira crítica → excluir sempre
        if (report.pillars.health.score < 40) return false;

        // Ativo de alto risco para perfis não agressivos
        if (
          report.scoreLabel === 'high' &&
          CONSERVATIVE_PROFILES.has(userProfile.risk_profile)
        ) return false;

        // Valuation esticada para perfil muito conservador
        if (
          userProfile.risk_profile === 'very_conservative' &&
          report.pillars.valuation.score < 50
        ) return false;

        return true;
      })
      // ── Qualidade score personalizado + campos usados no goalCompatibility ──
      .map(({ asset, report }) => {
        if (!report) return asset;
        return {
          ...asset,
          qualityScore:        calcQualityScoreFromReport(report, userProfile),
          pillarHealthScore:   report.pillars.health.score,
          pillarGrowthScore:   report.pillars.growth.score,
          savingsPlanSuitable: report.actionGuide.savingsPlanSuitable,
        };
      });

    const result = recommend({
      universe:         enriched,
      profile:          userProfile,
      preferredSectors,
      monthlyAmount,
      goalAmount,
      holdings,
      preferredClasses,
      maxPerClass:      3,
      maxPerSector:     2,
      externalWarnings: portfolioState.dataQualityWarnings.map(w => w.message),
    });

    // ETag changes whenever profile or holdings change → browser re-fetches automatically.
    // no-store for the actual payload so stale data never accumulates;
    // the Finnhub data is already cached server-side in lib/cache.ts.
    const holdingsSig = holdings.map(h => `${h.ticker}:${h.units}`).sort().join(',');
    const etag = makeETag(
      { risk_profile: userProfile.risk_profile, investment_goal: userProfile.investment_goal,
        experience_level: userProfile.experience_level, market_reaction: userProfile.market_reaction,
        preferred_sectors: preferredSectors.slice().sort().join(','),
        preferred_asset_classes: preferredClasses.slice().sort().join(',') },
      holdingsSig,
      horizonYears,
      monthlyAmount,
    );

    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store',
        ETag: etag,
      },
    });
  } catch (err) {
    console.error('[/api/recommendations]', err);
    return NextResponse.json({ error: 'engine_error' }, { status: 500 });
  }
}
