'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';

const OPTIONS = [
  { id: 'short',  label: 'Curto prazo', desc: 'Comprar e vender no curto prazo.',    icon: 'speed' },
  { id: 'long',   label: 'Longo prazo', desc: 'Manter posições durante anos.',        icon: 'calendar_month' },
  { id: 'income', label: 'Rendimento',  desc: 'Gerar rendimento com dividendos.',     icon: 'payments' },
];

export default function ObjectivePage() {
  const router = useRouter();
  const [selected, setSelected] = useState(1);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={4} total={5} back={() => router.back()} title="Objetivo ao investir" sub="O que procura ao negociar." />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />

        <div style={{ flex: 1 }} />
        <button onClick={() => router.push('/auth/sectors')} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
