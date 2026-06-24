'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';

const OPTIONS = [
  { id: 'conservative', label: 'Conservador', desc: 'Prefiro proteger o capital.',              icon: 'shield' },
  { id: 'moderate',     label: 'Moderado',    desc: 'Equilíbrio entre risco e retorno.',        icon: 'balance' },
  { id: 'aggressive',   label: 'Agressivo',   desc: 'Aceito volatilidade por mais retorno.',    icon: 'local_fire_department' },
];

export default function RiskPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(1);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={3} total={5} back={() => router.back()} title="Perfil de risco" sub="Define quanto risco está disposto a aceitar." />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />

        <div style={{ flex: 1 }} />
        <button onClick={() => router.push('/auth/objective')} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
