'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'critical',  label: 'É crítico',    desc: 'Posso precisar do dinheiro a qualquer momento.',      icon: 'emergency' },
  { id: 'possible',  label: 'É possível',   desc: 'Pode acontecer em situação de emergência.',            icon: 'warning_amber' },
  { id: 'unlikely',  label: 'Improvável',   desc: 'Tenho reservas. Dificilmente vou precisar.',           icon: 'check' },
  { id: 'never',     label: 'Nunca',        desc: 'Este dinheiro é intocável até ao fim do prazo.',       icon: 'lock' },
];

// Aviso especial para "critical" — não deveria investir este capital
const CRITICAL_WARNING = 'Se podes precisar deste dinheiro a qualquer momento, considera uma conta poupança em vez de investimento. O mercado pode estar em baixa quando precisares de sacar.';

export default function LiquidityPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const isCritical = selected !== null && OPTIONS[selected].id === 'critical';

  async function handleContinue() {
    if (selected === null) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ liquidity_need: OPTIONS[selected].id }).eq('id', user.id);
    }
    router.push('/auth/sectors');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={7} total={9} back={() => router.back()} title="Acesso ao dinheiro" sub="E se precisares do dinheiro antes do prazo?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />

        {/* Aviso para perfil crítico */}
        {isCritical && (
          <div style={{
            background: 'var(--loss-container)',
            border: '1px solid var(--loss)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex', gap: 10, alignItems: 'flex-start',
            animation: 'fadeIn .2s ease',
          }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: 'var(--loss)', flexShrink: 0, marginTop: 1 }}>info</span>
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{CRITICAL_WARNING}</span>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          {isCritical ? 'Continuar mesmo assim' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
