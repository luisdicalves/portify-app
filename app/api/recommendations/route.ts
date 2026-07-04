import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthedUser } from '@/lib/apiAuth';
import { getUniverse, filterUniverseForUser, type AssetClass } from '@/lib/assetUniverse';
import { recommend } from '@/lib/recommendationEngine';
import type { UserProfile } from '@/lib/planCalculator';
import { fetchRiskReport } from '@/lib/riskScore';
import { calcQualityScoreFromReport } from '@/lib/qualityScore';

const REC_CACHE_SECONDS = 24 * 60 * 60; // 24h

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient();

  // ── Perfil ────────────────────────────────────────────────────────────────
  const { data: profileRaw, error: profileErr } = await supabase
    .from('profiles')
    .select(
      'risk_profile, investment_goal, experience_level, market_reaction, ' +
      'financial_status, liquidity_need, preferred_assets, preferred_sectors, risk_score'
    )
    .eq('id', user.id)
    .single();

  if (profileErr || !profileRaw) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  const profile = (profileRaw as unknown) as {
    risk_profile:     string | null;
    investment_goal:  string | null;
    experience_level: string | null;
    market_reaction:  string | null;
    financial_status: string | null;
    liquidity_need:   string | null;
    preferred_assets:  unknown;
    preferred_sectors: unknown;
    risk_score:        number | null;
  };

  if (!profile.risk_profile || !profile.investment_goal) {
    return NextResponse.json({ error: 'incomplete_profile' }, { status: 422 });
  }

  // ── Plano de investimento ─────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from('investment_plans')
    .select('horizon_years, monthly_amount, goal_amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const horizonYears:   number = (plan as { horizon_years?: number } | null)?.horizon_years   ?? 10;
  const monthlyAmount:  number = (plan as { monthly_amount?: number } | null)?.monthly_amount  ?? 250;
  const goalAmount:     number | undefined = (plan as { goal_amount?: number } | null)?.goal_amount ?? undefined;

  // ── Holdings ──────────────────────────────────────────────────────────────
  const { data: holdingsRaw } = await supabase
    .from('holdings')
    .select('ticker, units, avg_price')
    .eq('user_id', user.id);

  const holdings = ((holdingsRaw ?? []) as { ticker: string; units: number; avg_price: number }[])
    .map(h => ({ ticker: h.ticker, units: h.units, avgPrice: h.avg_price }));

  // ── UserProfile ───────────────────────────────────────────────────────────
  const userProfile = {
    risk_profile:     (profile.risk_profile  ?? 'moderate')      as UserProfile['risk_profile'],
    investment_goal:  (profile.investment_goal ?? 'wealth_growth') as UserProfile['investment_goal'],
    experience_level: (profile.experience_level ?? 'beginner')    as UserProfile['experience_level'],
    market_reaction:  (profile.market_reaction  ?? 'hold')        as UserProfile['market_reaction'],
    financial_status: (profile.financial_status ?? 'stable')      as UserProfile['financial_status'],
    liquidity_need:   (profile.liquidity_need   ?? 'unlikely')    as UserProfile['liquidity_need'],
    horizon_years:    horizonYears,
  } satisfies UserProfile;

  // ── Asset classes preferidas ──────────────────────────────────────────────
  const rawAssets: string[] = Array.isArray(profile.preferred_assets)
    ? (profile.preferred_assets as string[])
    : ['stock', 'etf', 'bond_etf'];

  const assetClasses: AssetClass[] = rawAssets
    .filter((a): a is AssetClass => ['stock', 'etf', 'bond_etf'].includes(a));

  const preferredSectors: string[] = Array.isArray(profile.preferred_sectors)
    ? (profile.preferred_sectors as string[])
    : [];

  try {
    const universe = await getUniverse();

    const filtered = filterUniverseForUser(universe, {
      preferredAssetClasses: assetClasses.length > 0 ? assetClasses : ['stock', 'etf', 'bond_etf'],
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
      // ── Qualidade score personalizado ──────────────────────────────────────
      .map(({ asset, report }) => {
        if (!report) return asset;
        return { ...asset, qualityScore: calcQualityScoreFromReport(report, userProfile) };
      });

    const result = recommend({
      universe:         enriched,
      profile:          userProfile,
      preferredSectors,
      monthlyAmount,
      goalAmount,
      holdings,
      maxPerClass:      3,
      maxPerSector:     2,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': `private, max-age=${REC_CACHE_SECONDS}` },
    });
  } catch (err) {
    console.error('[/api/recommendations]', err);
    return NextResponse.json({ error: 'engine_error' }, { status: 500 });
  }
}
