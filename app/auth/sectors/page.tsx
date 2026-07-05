'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { createClient } from '@/lib/supabase/client';
import { getSessionUserId } from '@/lib/hooks/useUser';
import { SECTOR_OPTIONS as SECTORS } from '@/lib/profileOptions';
import { onbState } from '@/lib/onboardingState';

export default function SectorsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(onbState.getSectors()));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  async function handleContinue() {
    setSaving(true);
    setSaveError(null);
    try {
      const userId = await getSessionUserId();
      if (userId) {
        const supabase = createClient();
        const { error } = await supabase.from('profiles').update({ preferred_sectors: Array.from(selected) }).eq('id', userId);
        if (error) throw error;
      }
      onbState.setSectors(Array.from(selected));
      router.push('/auth/plan-ask');
    } catch {
      setSaveError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={7} total={7} back={() => router.back()} title="Setores de interesse" sub="Escolhe as áreas que queres acompanhar." />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {SECTORS.map(s => {
            const on = selected.has(s.id);
            return (
              <button key={s.id} onClick={() => toggle(s.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 14px',
                background: on ? 'var(--primary-strong)' : 'var(--surface-low)',
                border: '1px solid ' + (on ? 'var(--primary-strong)' : 'var(--card-border)'),
                borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all .15s',
                fontSize: 14, fontWeight: 600,
                color: on ? '#fff' : 'var(--on-surface)',
                fontFamily: 'inherit',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: on ? '#fff' : 'var(--on-surface-variant)' }}>{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '12px 20px 34px' }}>
        {saveError && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 8 }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 16, color: 'var(--loss)', flexShrink: 0 }}>error</span>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{saveError}</span>
          </div>
        )}
        <button
          disabled={selected.size === 0 || saving}
          onClick={handleContinue}
          style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 || saving ? 0.5 : 1 }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
