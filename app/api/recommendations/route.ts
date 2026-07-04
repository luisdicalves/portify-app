import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthedUser } from '@/lib/apiAuth';
import { getUniverse, filterUniverseForUser, type AssetClass } from '@/lib/assetUniverse';
import { recommend } from '@/lib/recommendationEngine';
import type { UserProfile } from '@/lib/planCalculator';

// Recomendações mudam com o universo (cache 7 dias) e o perfil raramente muda,
// por isso cache por user_id durante 1 hora.
const REC_TTL_SECONDS = 60 * 60;

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient();

  // ── Carregar perfil do utilizador ────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select(
      'risk_profile, investment_goal, experience_level, market_reaction, ' +
      'financial_status, liquidity_need, preferred_assets, preferred_sectors'
    )
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  // ── Carregar horizonte do plano de investimento ──────────────────────────
  const { data: plan } = await supabase
    .from('investment_plans')
    .select('horizon_years')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const horizonYears: number = plan?.horizon_years ?? 10;

  // ── Validar que o perfil tem campos suficientes para recomendar ──────────
  if (!profile.risk_profile || !profile.investment_goal) {
    return NextResponse.json({ error: 'incomplete_profile' }, { status: 422 });
  }

  const userProfile: UserProfile = {
    risk_profile:     profile.risk_profile,
    investment_goal:  profile.investment_goal,
    experience_level: profile.experience_level ?? 'beginner',
    market_reaction:  profile.market_reaction  ?? 'hold',
    financial_status: profile.financial_status ?? 'stable',
    liquidity_need:   profile.liquidity_need   ?? 'unlikely',
    horizon_years:    horizonYears,
  };

  // Preferred asset classes: vêm de preferred_assets (onboarding step 1)
  // Fallback: todas as classes se não configurado
  const rawAssets: string[] = Array.isArray(profile.preferred_assets)
    ? profile.preferred_assets
    : ['stock', 'etf', 'bond_etf'];

  const preferredAssetClasses = rawAssets.filter(
    (a): a is AssetClass => ['stock', 'etf', 'bond_etf'].includes(a)
  );
  const assetClasses: AssetClass[] = preferredAssetClasses.length > 0
    ? preferredAssetClasses
    : ['stock', 'etf', 'bond_etf'];

  const preferredSectors: string[] = Array.isArray(profile.preferred_sectors)
    ? profile.preferred_sectors
    : [];

  try {
    // ── Obter e filtrar universo ─────────────────────────────────────────
    const universe = await getUniverse();

    const filtered = filterUniverseForUser(universe, {
      preferredAssetClasses: assetClasses,
      investmentGoal:        userProfile.investment_goal,
      liquidityNeed:         userProfile.liquidity_need,
      horizonYears,
      riskProfile:           userProfile.risk_profile,
    });

    // ── Gerar recomendações ──────────────────────────────────────────────
    const result = recommend({
      universe:         filtered,
      profile:          userProfile,
      preferredSectors,
      maxResults:       20,
      maxPerSector:     2,
    });

    // Cache hint para o cliente (CDN / SWR)
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `private, max-age=${REC_TTL_SECONDS}`,
      },
    });
  } catch (err) {
    console.error('[/api/recommendations]', err);
    return NextResponse.json({ error: 'engine_error' }, { status: 500 });
  }
}
