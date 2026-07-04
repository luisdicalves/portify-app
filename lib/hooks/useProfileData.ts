'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getPlan, upsertPlan } from '@/lib/db/plans';
import { updateProfile } from '@/lib/db/profiles';
import type { DbProfile, DbPlan } from '@/lib/types/profile';
import { RISK_OPTIONS, OBJECTIVE_OPTIONS } from '@/lib/profileOptions';
import { PLAN_AMOUNT_VALUES, PLAN_FREQUENCIES, PLAN_HORIZON_YEARS } from '@/lib/profileConstants';

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

  async function savePlan(planAmt: number, planPeriod: number, planHorizon: number, planGoal: string) {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const amount       = PLAN_AMOUNT_VALUES[planAmt];
    const frequency    = PLAN_FREQUENCIES[planPeriod];
    const horizon_years = PLAN_HORIZON_YEARS[planHorizon];
    const goal_amount  = parseFloat(planGoal) || 0;
    await upsertPlan(supabase, { user_id: userId, amount, frequency, horizon_years, goal_amount });
    setPlan({ amount, frequency, horizon_years, goal_amount });
    setSaving(false);
  }

  return { profile, plan, saving, saveRisk, saveObjective, saveSectors, savePlan };
}
