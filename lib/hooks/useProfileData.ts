'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getPlan, upsertPlan } from '@/lib/db/plans';
import { updateProfile } from '@/lib/db/profiles';
import type { DbProfile, DbPlan } from '@/lib/types/profile';
import { RISK_OPTIONS, OBJECTIVE_OPTIONS } from '@/lib/profileOptions';
import type { PlanEditorResult } from '@/components/ui/PlanEditor';

export function useProfileData(userId: string | undefined) {
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [plan, setPlan]       = useState<DbPlan | null>(null);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = createClient();
      const [{ data: p }, { data: pl }] = await Promise.all([
        supabase.from('profiles')
          .select('first_name, last_name, user_handle, risk_profile, investment_goal, experience_level, market_reaction, financial_status, liquidity_need, preferred_sectors, investor_since')
          .eq('id', userId).single(),
        getPlan(supabase, userId),
      ]);
      if (p) setProfile(p);
      if (pl) setPlan(pl);
    })();
  }, [userId]);

  async function saveRisk(riskSelected: number) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const riskId = RISK_OPTIONS[riskSelected].id;
    await updateProfile(supabase, userId, { risk_profile: riskId });
    setProfile(p => p ? { ...p, risk_profile: riskId } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function saveObjective(objectiveSelected: number) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const goalId = OBJECTIVE_OPTIONS[objectiveSelected].id;
    await updateProfile(supabase, userId, { investment_goal: goalId });
    setProfile(p => p ? { ...p, investment_goal: goalId } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function saveSectors(sectorsSelected: Set<string>) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const sectors = Array.from(sectorsSelected);
    await updateProfile(supabase, userId, { preferred_sectors: sectors });
    setProfile(p => p ? { ...p, preferred_sectors: sectors } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function saveExperience(experienceId: string) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    await updateProfile(supabase, userId, { experience_level: experienceId });
    setProfile(p => p ? { ...p, experience_level: experienceId } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function saveReaction(reactionId: string) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    await updateProfile(supabase, userId, { market_reaction: reactionId });
    setProfile(p => p ? { ...p, market_reaction: reactionId } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function saveFinancial(financialId: string) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    await updateProfile(supabase, userId, { financial_status: financialId });
    setProfile(p => p ? { ...p, financial_status: financialId } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function saveLiquidity(liquidityId: string) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    await updateProfile(supabase, userId, { liquidity_need: liquidityId });
    setProfile(p => p ? { ...p, liquidity_need: liquidityId } : p);
    sessionStorage.removeItem('rec-etag');
    setSaving(false);
  }

  async function savePlan(result: PlanEditorResult) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const { amount, frequency, horizon_years, goal_amount, preferred_asset_classes } = result;
    await upsertPlan(supabase, { user_id: userId, amount, frequency, horizon_years, goal_amount, preferred_asset_classes });
    setPlan(prev => ({ amount, frequency, horizon_years, goal_amount, preferred_asset_classes: preferred_asset_classes ?? prev?.preferred_asset_classes }));
    setSaving(false);
  }

  async function saveHorizonYears(years: number) {
    if (!userId || !plan) return;
    setSaving(true);
    const supabase = createClient();
    await upsertPlan(supabase, {
      user_id:       userId,
      amount:        plan.amount,
      frequency:     plan.frequency,
      horizon_years: years,
      goal_amount:   plan.goal_amount,
    });
    setPlan(prev => prev ? { ...prev, horizon_years: years } : prev);
    setSaving(false);
  }

  return { profile, plan, saving, saveRisk, saveObjective, saveSectors, saveExperience, saveReaction, saveFinancial, saveLiquidity, savePlan, saveHorizonYears };
}
