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
      <div style={{ padding: '14px 24px 8px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer', display: 'block', marginBottom: 8 }}>
          arrow_back_ios_new
        </span>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, textWrap: 'pretty' as never }}>Define o teu plano</div>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 4, textWrap: 'pretty' as never }}>Podes alterar estes valores a qualquer momento.</div>
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
