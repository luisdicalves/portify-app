'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';
import { getUser } from '@/lib/hooks/useUser';

const OPTIONS = [
  { id: 'critical', label: 'É crítico',  desc: 'Posso precisar do dinheiro a qualquer momento.', icon: 'emergency' },
  { id: 'possible', label: 'É possível', desc: 'Pode acontecer em situação de emergência.',       icon: 'warning_amber' },
  { id: 'unlikely', label: 'Improvável', desc: 'Tenho reservas. Dificilmente vou precisar.',      icon: 'check' },
  { id: 'never',    label: 'Nunca',      desc: 'Este dinheiro é intocável até ao fim do prazo.',  icon: 'lock' },
];

const CRITICAL_WARNING = 'Se podes precisar deste dinheiro a qualquer momento, considera uma conta poupança em vez de investimento. O mercado pode estar em baixa quando precisares de sacar.';

export default function LiquidityPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isCritical = selected !== null && OPTIONS[selected].id === 'critical';

  async function handleContinue() {
    if (selected === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const user = await getUser();
      if (user) {
        const supabase = createClient();
        const { error } = await supabase.from('profiles').update({ liquidity_need: OPTIONS[selected].id }).eq('id', user.id);
        if (error) throw error;
      }
      router.push('/auth/sectors');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={8} total={9} back={() => router.back()} title="Acesso ao dinheiro" sub="E se precisares do dinheiro antes do prazo?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 0' }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
        {isCritical && (
          <div style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, animation: 'fadeIn .2s ease' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: 'var(--loss)', flexShrink: 0, marginTop: 1 }}>info</span>
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{CRITICAL_WARNING}</span>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 20px 34px' }}>
        {saveError && <div style={{ fontSize: 13, color: 'var(--loss)', textAlign: 'center', marginBottom: 8 }}>{saveError}</div>}
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          {isCritical ? 'Continuar mesmo assim' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
