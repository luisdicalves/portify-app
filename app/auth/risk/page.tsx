'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';
import { getSessionUserId } from '@/lib/hooks/useUser';
import { onbState } from '@/lib/onboardingState';
import { RISK_OPTIONS as OPTIONS } from '@/lib/profileOptions';

export default function RiskPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(() => {
    const saved = onbState.getRiskProfile();
    return saved !== null ? OPTIONS.findIndex(o => o.id === saved) : null;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleContinue() {
    if (selected === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const userId = await getSessionUserId();
      if (userId) {
        const supabase = createClient();
        const { error } = await supabase.from('profiles').update({ risk_profile: OPTIONS[selected].id }).eq('id', userId);
        if (error) throw error;
      }
      onbState.setRiskProfile(OPTIONS[selected].id);
      router.push('/auth/reaction');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={3} total={7} back={() => router.back()} title="Perfil de risco" sub="Quanto risco estás disposto a aceitar?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 0' }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
      </div>

      <div style={{ padding: '12px 20px 34px' }}>
        {saveError && (
          <div data-testid="save-error" style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 8 }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 16, color: 'var(--loss)', flexShrink: 0 }}>error</span>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{saveError}</span>
          </div>
        )}
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
