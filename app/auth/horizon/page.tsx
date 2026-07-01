'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';
import { createClient } from '@/lib/supabase/client';

function getWarning(years: number): { text: string; color: string } | null {
  if (years < 2) return {
    text: 'Com menos de 2 anos, recomendamos perfis muito conservadores para evitar perdas.',
    color: 'var(--loss)',
  };
  if (years < 5) return {
    text: 'Com menos de 5 anos, prefere ativos estáveis como ETFs de obrigações.',
    color: '#F59E0B',
  };
  if (years >= 20) return {
    text: 'Excelente! Com 20+ anos podes aceitar mais risco e beneficiar do crescimento composto.',
    color: 'var(--gain)',
  };
  return null;
}

export default function HorizonPage() {
  const router = useRouter();
  const [years, setYears] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parsed = parseInt(years, 10);
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 50;
  const warning = isValid ? getWarning(parsed) : null;

  function handleChange(val: string) {
    setError('');
    if (val === '' || /^\d{1,2}$/.test(val)) setYears(val);
  }

  async function handleContinue() {
    if (!isValid) {
      setError('Introduz um valor entre 1 e 50 anos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: dbError } = await supabase.from('investment_plans').upsert({ user_id: user.id, horizon_years: parsed });
        if (dbError) throw dbError;
      }
      router.push('/auth/risk');
    } catch {
      setError('Erro ao guardar. Tenta novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={4} total={9} back={() => router.back()} title="Horizonte de investimento" sub="Durante quantos anos planeias investir?" />

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Input principal */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={years}
              onChange={e => handleChange(e.target.value)}
              placeholder="—"
              style={{
                width: 120,
                fontSize: 56,
                fontWeight: 700,
                textAlign: 'center',
                background: 'transparent',
                border: 'none',
                borderBottom: `3px solid ${error ? 'var(--loss)' : isValid ? 'var(--primary-strong)' : 'var(--outline)'}`,
                color: 'var(--on-surface)',
                outline: 'none',
                fontFamily: 'inherit',
                letterSpacing: '-0.02em',
                MozAppearance: 'textfield',
              }}
            />
            <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--on-surface-variant)' }}>anos</span>
          </div>

          {/* Sugestões rápidas */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[3, 5, 10, 15, 20, 30].map(y => (
              <button
                key={y}
                onClick={() => { setYears(String(y)); setError(''); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${parsed === y ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                  background: parsed === y ? 'var(--primary-container)' : 'var(--surface-low)',
                  color: parsed === y ? 'var(--primary-strong)' : 'var(--on-surface-variant)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
              >
                {y} anos
              </button>
            ))}
          </div>
        </div>

        {/* Aviso contextual */}
        {warning && (
          <div style={{
            background: 'var(--surface-low)',
            border: `1px solid ${warning.color}`,
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: warning.color, flexShrink: 0, marginTop: 1 }}>info</span>
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{warning.text}</span>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: 'var(--loss)', textAlign: 'center' }}>{error}</div>
        )}

        <div style={{ flex: 1 }} />
        <button
          onClick={handleContinue}
          disabled={saving || !isValid}
          style={{
            background: 'var(--primary-strong)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600,
            cursor: isValid ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            opacity: saving || !isValid ? 0.5 : 1,
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
