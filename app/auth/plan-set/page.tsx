'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { onbState } from '@/lib/onboardingState';
import { PlanEditor } from '@/components/ui/PlanEditor';
import type { UserProfile } from '@/lib/planCalculator';

export default function PlanSetPage() {
  const router = useRouter();
  const { user } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('risk_profile, investment_goal, experience_level, market_reaction, financial_status, liquidity_need')
        .eq('id', user.id)
        .single();
      if (data) setProfile(data as UserProfile);
    })();
  }, [user]);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 4px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', borderRadius: 'var(--radius-full)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>Define o teu plano</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Podes alterar estes valores a qualquer momento.</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 24px' }}>
        <PlanEditor
          profile={profile}
          onSave={result => {
            onbState.setPlan({
              amount:                   result.amount,
              frequency:                result.frequency,
              horizon_years:            result.horizon_years,
              goal_amount:              result.goal_amount,
              preferred_asset_classes:  result.preferred_asset_classes,
            });
            router.push('/auth/summary');
          }}
          saveLabel="Ver resumo"
        />
      </div>
    </div>
  );
}
