'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { LIQUIDITY_OPTIONS as OPTIONS, LIQUIDITY_CRITICAL_WARNING as CRITICAL_WARNING } from '@/lib/profileOptions';
import { createClient } from '@/lib/supabase/client';
import { getSessionUserId } from '@/lib/hooks/useUser';
import { onbState } from '@/lib/onboardingState';

export default function LiquidityPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(() => {
    const saved = onbState.getLiquidityNeed();
    return saved !== null ? OPTIONS.findIndex(o => o.id === saved) : null;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isCritical = selected !== null && OPTIONS[selected].id === 'critical';

  async function handleContinue() {
    if (selected === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const userId = await getSessionUserId();
      if (userId) {
        const supabase = createClient();
        const { error } = await supabase.from('profiles').update({ liquidity_need: OPTIONS[selected].id }).eq('id', userId);
        if (error) throw error;
      }
      onbState.setLiquidityNeed(OPTIONS[selected].id);
      router.push('/auth/sectors');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={6} total={7} back={() => router.back()} title="Acesso ao dinheiro" sub="E se precisares do dinheiro antes do prazo?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 0' }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
        {isCritical && (
          <div data-testid="critical-warning" style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, animation: 'fadeIn .2s ease' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: 'var(--loss)', flexShrink: 0, marginTop: 1 }}>warning</span>
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{CRITICAL_WARNING}</span>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 20px 34px' }}>
        {saveError && (
          <div data-testid="save-error" style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 8 }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 16, color: 'var(--loss)', flexShrink: 0 }}>error</span>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{saveError}</span>
          </div>
        )}
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          {isCritical ? 'Continuar mesmo assim' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
