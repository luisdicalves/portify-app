'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { SelectList } from '@/components/ui/SelectList';
import { createClient } from '@/lib/supabase/client';

const OPTIONS = [
  { id: 'none',         label: 'Nenhuma',       desc: 'Nunca investi.',                               icon: 'person' },
  { id: 'beginner',     label: 'Iniciante',      desc: 'Investi pontualmente.',                        icon: 'school' },
  { id: 'intermediate', label: 'Intermédio',     desc: 'Invisto regularmente há 1–3 anos.',            icon: 'trending_up' },
  { id: 'experienced',  label: 'Experiente',     desc: 'Invisto há mais de 3 anos.',                   icon: 'workspace_premium' },
  { id: 'professional', label: 'Profissional',   desc: 'Trabalho ou trabalhei na área financeira.',    icon: 'business_center' },
];

export default function ExperiencePage() {
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
        const { error } = await supabase.from('profiles').update({ experience_level: OPTIONS[selected].id }).eq('id', user.id);
        if (error) throw error;
      }
      router.push('/auth/objective');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={2} total={9} back={() => router.back()} title="Experiência a investir" sub="Ajudamos a personalizar as tuas recomendações." />

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectList options={OPTIONS} selected={selected} onSelect={setSelected} />
        <div style={{ flex: 1 }} />
        {saveError && <div style={{ fontSize: 13, color: 'var(--loss)', textAlign: 'center' }}>{saveError}</div>}
        <button onClick={handleContinue} disabled={selected === null || saving} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected === null || saving ? 0.5 : 1 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
