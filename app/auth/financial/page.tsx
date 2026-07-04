'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';
import { getSessionUserId } from '@/lib/hooks/useUser';

const OPTIONS = [
  { id: 'unstable',    label: 'Instável',    desc: 'Rendimento variável ou incerto.',          icon: 'warning' },
  { id: 'stable',      label: 'Estável',     desc: 'Rendimento fixo, despesas cobertas.',      icon: 'check_circle' },
  { id: 'comfortable', label: 'Confortável', desc: 'Poupo regularmente sem esforço.',          icon: 'savings' },
  { id: 'wealthy',     label: 'Elevada',     desc: 'Grande capacidade de poupança mensal.',    icon: 'diamond' },
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
      const userId = await getSessionUserId();
      if (userId) {
        const supabase = createClient();
        const { error } = await supabase.from('profiles').update({ financial_status: OPTIONS[selected].id }).eq('id', userId);
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

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 0' }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 0 4px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', flexShrink: 0, marginTop: 2 }}>lock</span>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Esta informação é privada e usada apenas para calibrar as tuas recomendações.
          </span>
        </div>
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
