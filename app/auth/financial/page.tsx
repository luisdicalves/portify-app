'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'unstable',    label: 'Instável',      desc: 'Rendimento variável ou incerto.',                     icon: 'warning' },
  { id: 'stable',      label: 'Estável',       desc: 'Rendimento fixo, despesas cobertas.',                 icon: 'check_circle' },
  { id: 'comfortable', label: 'Confortável',   desc: 'Poupo regularmente sem esforço.',                     icon: 'savings' },
  { id: 'wealthy',     label: 'Elevada',       desc: 'Grande capacidade de poupança mensal.',               icon: 'diamond' },
];

export default function FinancialPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleContinue() {
    if (selected === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('profiles').update({ financial_status: OPTIONS[selected].id }).eq('id', user.id);
        if (error) throw error;
      }
      router.push('/auth/liquidity');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={7} total={9} back={() => router.back()} title="Situação financeira" sub="Como descreves a tua situação financeira atual?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />

        {/* Nota de privacidade */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', flexShrink: 0, marginTop: 2 }}>lock</span>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Esta informação é privada e usada apenas para calibrar as tuas recomendações.
          </span>
        </div>

        <div style={{ flex: 1 }} />
        {saveError && <div style={{ fontSize: 13, color: 'var(--loss)', textAlign: 'center' }}>{saveError}</div>}
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
