'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'very_conservative', label: 'Muito conservador', desc: 'Aceito retornos baixos. Zero perdas.',                icon: 'shield' },
  { id: 'conservative',      label: 'Conservador',       desc: 'Prefiro proteger o capital.',                         icon: 'security' },
  { id: 'moderate',          label: 'Moderado',          desc: 'Equilíbrio entre risco e retorno.',                   icon: 'balance' },
  { id: 'aggressive',        label: 'Agressivo',         desc: 'Aceito volatilidade por mais retorno.',               icon: 'local_fire_department' },
  { id: 'very_aggressive',   label: 'Muito agressivo',   desc: 'Maximizar retorno. Aceito perdas elevadas.',          icon: 'bolt' },
];

export default function RiskPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(2);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ risk_profile: OPTIONS[selected].id }).eq('id', user.id);
    }
    router.push('/auth/reaction');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={4} total={9} back={() => router.back()} title="Perfil de risco" sub="Quanto risco estás disposto a aceitar?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
        <div style={{ flex: 1 }} />
        <button onClick={handleContinue} disabled={saving} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
