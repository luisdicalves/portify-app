'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'beginner',     label: 'Iniciante',   desc: 'Estou a começar a investir.',            icon: 'school' },
  { id: 'intermediate', label: 'Intermédio',  desc: 'Já invisto há algum tempo.',              icon: 'trending_up' },
  { id: 'advanced',     label: 'Avançado',    desc: 'Negoceio com frequência e confiança.',    icon: 'workspace_premium' },
];

export default function ExperiencePage() {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ experience_level: OPTIONS[selected].id }).eq('id', user.id);
    }
    router.push('/auth/risk');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={2} total={5} back={() => router.back()} title="Experiência a investir" sub="Ajustamos o conteúdo ao seu nível." />

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
