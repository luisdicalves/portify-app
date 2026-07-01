'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'emergency_fund',  label: 'Fundo de emergência',  desc: 'Reserva segura e acessível.',                    icon: 'health_and_safety' },
  { id: 'short_purchase',  label: 'Compra a curto prazo', desc: 'Casa, carro ou viagem (menos de 3 anos).',       icon: 'speed' },
  { id: 'income',          label: 'Rendimento passivo',   desc: 'Gerar rendimento com dividendos regulares.',     icon: 'payments' },
  { id: 'wealth_growth',   label: 'Crescimento',          desc: 'Fazer crescer o meu património.',                icon: 'trending_up' },
  { id: 'retirement',      label: 'Reforma',              desc: 'Construir capital para a reforma.',              icon: 'beach_access' },
  { id: 'legacy',          label: 'Legado',               desc: 'Deixar património para os meus herdeiros.',      icon: 'family_restroom' },
];

export default function ObjectivePage() {
  const router = useRouter();
  const [selected, setSelected] = useState(3);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ investment_goal: OPTIONS[selected].id }).eq('id', user.id);
    }
    router.push('/auth/horizon');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={2} total={9} back={() => router.back()} title="Objetivo ao investir" sub="O que procuras ao investir o teu dinheiro?" />

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
