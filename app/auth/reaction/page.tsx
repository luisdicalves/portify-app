'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'sell_all',   label: 'Vendo tudo',     desc: 'Prefiro sair e evitar mais perdas.',             icon: 'trending_down' },
  { id: 'sell_some',  label: 'Vendo parte',    desc: 'Reduzo a exposição para ficar mais tranquilo.',   icon: 'remove_circle' },
  { id: 'hold',       label: 'Aguardo',        desc: 'Não faço nada. Espero que o mercado recupere.',   icon: 'pause_circle' },
  { id: 'buy_more',   label: 'Compro mais',    desc: 'É uma oportunidade. Aumento a minha posição.',    icon: 'add_shopping_cart' },
];

export default function ReactionPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (selected === null) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ market_reaction: OPTIONS[selected].id }).eq('id', user.id);
    }
    router.push('/auth/financial');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={5} total={9} back={() => router.back()} title="Reação a uma queda" sub="O mercado cai 20% de repente. O que fazes?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Contexto visual */}
        <div style={{
          background: 'var(--loss-container)',
          border: '1px solid var(--loss)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <span className="material-symbols-outlined icf" style={{ fontSize: 22, color: 'var(--loss)', flexShrink: 0 }}>trending_down</span>
          <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
            Imagina que investiste <strong>10.000€</strong> e em 2 semanas o teu portfólio vale <strong>8.000€</strong>.
          </span>
        </div>

        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
        <div style={{ flex: 1 }} />
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
