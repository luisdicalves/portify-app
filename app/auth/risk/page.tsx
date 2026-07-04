'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';
import { getSessionUserId } from '@/lib/hooks/useUser';
import { onbState } from '@/lib/onboardingState';

const OPTIONS = [
  { id: 'very_conservative', label: 'Muito conservador', desc: 'Aceito retornos baixos. Zero perdas.',       icon: 'shield' },
  { id: 'conservative',      label: 'Conservador',       desc: 'Prefiro proteger o capital.',                icon: 'security' },
  { id: 'moderate',          label: 'Moderado',          desc: 'Equilíbrio entre risco e retorno.',          icon: 'balance' },
  { id: 'aggressive',        label: 'Agressivo',         desc: 'Aceito volatilidade por mais retorno.',      icon: 'local_fire_department' },
  { id: 'very_aggressive',   label: 'Muito agressivo',   desc: 'Maximizar retorno. Aceito perdas elevadas.', icon: 'bolt' },
];

export default function RiskPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
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
      <StepHeader step={5} total={9} back={() => router.back()} title="Perfil de risco" sub="Quanto risco estás disposto a aceitar?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 0' }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
      </div>

      <div style={{ padding: '12px 20px 34px' }}>
        {saveError && <div style={{ fontSize: 13, color: 'var(--loss)', textAlign: 'center', marginBottom: 8 }}>{saveError}</div>}
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
