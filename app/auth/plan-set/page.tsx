'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StepHeader } from '@/components/ui/StepHeader';

// ── Constantes ────────────────────────────────────────────────────
const AMOUNT_VALUES = [50, 100, 250, 500, 1000, 2000];
const AMOUNT_LABELS = ['50 €', '100 €', '250 €', '500 €', '1.000 €', '2.000 €'];
const FREQUENCIES   = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
const FREQ_LABELS   = ['Semanal', 'Mensal', 'Trimestral', 'Anual'];

// Taxa anual estimada por perfil de risco (para projecção)
const RATE_BY_RISK: Record<string, number> = {
  very_conservative: 0.035,
  conservative:      0.050,
  moderate:          0.070,
  aggressive:        0.090,
  very_aggressive:   0.110,
};

function calcFV(pmt: number, rAnnual: number, years: number): number {
  if (rAnnual === 0) return pmt * 12 * years;
  const r = rAnnual / 12;
  const n = years * 12;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

function calcPMT(fv: number, rAnnual: number, years: number): number {
  if (rAnnual === 0) return fv / (12 * years);
  const r = rAnnual / 12;
  const n = years * 12;
  return fv * r / (Math.pow(1 + r, n) - 1);
}

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// ── Chip ──────────────────────────────────────────────────────────
function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '10px 16px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
      fontSize: 14, fontWeight: 600, transition: 'all .15s', border: '1px solid',
      background: on ? 'var(--primary-container)' : 'var(--surface-low)',
      color: on ? 'var(--on-primary-container)' : 'var(--on-surface)',
      borderColor: on ? 'var(--primary-strong)' : 'var(--card-border)',
      userSelect: 'none',
    }}>
      {label}
    </div>
  );
}

const lbl = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--on-surface-variant)', marginBottom: 9 };

// ── Página ────────────────────────────────────────────────────────
export default function PlanSetPage() {
  const router = useRouter();

  // Modo activo: qual variável está a ser calculada
  type Mode = 'calc_goal' | 'calc_years' | 'calc_amount';
  const [mode, setMode] = useState<Mode>('calc_goal');

  // Valores do plano
  const [amtIdx, setAmtIdx]   = useState(2);          // 250 €
  const [freqIdx, setFreqIdx] = useState(1);          // Mensal
  const [years, setYears]     = useState(10);
  const [goal, setGoal]       = useState('');         // input livre quando mode=calc_amount

  // Perfil de risco do utilizador (carregado do sessionStorage gravado nos steps anteriores)
  const [riskProfile, setRiskProfile] = useState('moderate');

  useEffect(() => {
    const stored = sessionStorage.getItem('onb_risk_profile');
    if (stored) setRiskProfile(stored);
  }, []);

  const rate = RATE_BY_RISK[riskProfile] ?? 0.07;
  const monthlyAmt = AMOUNT_VALUES[amtIdx];

  // ── Projecção calculada ───────────────────────────────────────
  const projectedGoal   = calcFV(monthlyAmt, rate, years);
  const requiredMonthly = goal ? calcPMT(parseFloat(goal.replace(/\D/g, '')), rate, years) : null;

  // Valor final que vai para o summary
  const goalAmount = mode === 'calc_amount' && goal
    ? parseFloat(goal.replace(/\D/g, ''))
    : projectedGoal;

  function handleContinue() {
    // Guardar em sessionStorage — sem gravar na DB ainda
    sessionStorage.setItem('onb_plan', JSON.stringify({
      amount:      monthlyAmt,
      frequency:   FREQUENCIES[freqIdx],
      horizon_years: years,
      goal_amount: Math.round(goalAmount),
    }));
    router.push('/auth/summary');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <StepHeader step={9} total={9} back={() => router.back()} title="Define o teu plano" sub="Podes alterar estes valores a qualquer momento." />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Modo selector */}
        <div style={{ display: 'flex', background: 'var(--surface-low)', borderRadius: 'var(--radius-lg)', padding: 4, gap: 2 }}>
          {([
            { m: 'calc_goal'   as Mode, label: 'Calcular objetivo' },
            { m: 'calc_years'  as Mode, label: 'Calcular prazo' },
            { m: 'calc_amount' as Mode, label: 'Calcular montante' },
          ]).map(({ m, label }) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '8px 4px', border: 'none', borderRadius: 'var(--radius-md)',
              background: mode === m ? 'var(--primary-strong)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--on-surface-variant)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all .2s', lineHeight: 1.3,
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Montante mensal */}
        <div>
          <div style={lbl}>
            {mode === 'calc_amount' ? 'Objetivo financeiro (€)' : 'Montante mensal'}
          </div>
          {mode === 'calc_amount' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 16px' }}>
              <span style={{ fontSize: 18, color: 'var(--outline)' }}>€</span>
              <input
                value={goal}
                onChange={e => setGoal(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="100 000"
                inputMode="numeric"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '15px 0', fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', fontFamily: 'inherit' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {AMOUNT_LABELS.map((a, i) => (
                <Chip key={i} label={a} on={amtIdx === i} onClick={() => setAmtIdx(i)} />
              ))}
            </div>
          )}
        </div>

        {/* Periodicidade */}
        <div>
          <div style={lbl}>Periodicidade</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FREQ_LABELS.map((f, i) => (
              <Chip key={i} label={f} on={freqIdx === i} onClick={() => setFreqIdx(i)} />
            ))}
          </div>
        </div>

        {/* Horizonte — input numérico livre */}
        {mode !== 'calc_years' && (
          <div>
            <div style={lbl}>Horizonte (anos)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setYears(y => Math.max(1, y - 1))} style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', background: 'var(--surface-low)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', fontFamily: 'inherit' }}>−</button>
              <span style={{ fontSize: 28, fontWeight: 700, minWidth: 60, textAlign: 'center', letterSpacing: '-0.02em' }}>{years} <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--on-surface-variant)' }}>anos</span></span>
              <button onClick={() => setYears(y => Math.min(50, y + 1))} style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', background: 'var(--surface-low)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', fontFamily: 'inherit' }}>+</button>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[5, 10, 15, 20, 30].map(y => (
                  <button key={y} onClick={() => setYears(y)} style={{
                    padding: '5px 11px', borderRadius: 'var(--radius-full)', border: `1px solid ${years === y ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                    background: years === y ? 'var(--primary-container)' : 'var(--surface-low)',
                    color: years === y ? 'var(--primary-strong)' : 'var(--on-surface-variant)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{y}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Projecção em destaque */}
        <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          {mode === 'calc_goal' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--gain-strong)', fontWeight: 600, marginBottom: 4 }}>Objetivo estimado</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>{fmt(projectedGoal)}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                {fmt(monthlyAmt)}/mês · {years} anos · {(rate * 100).toFixed(1)}% a.a.
              </div>
            </>
          )}
          {mode === 'calc_years' && goal && (
            <>
              <div style={{ fontSize: 12, color: 'var(--gain-strong)', fontWeight: 600, marginBottom: 4 }}>Prazo estimado</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>
                {Math.ceil(Math.log(parseFloat(goal) * rate / 12 / monthlyAmt + 1) / Math.log(1 + rate / 12) / 12)} anos
              </div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                Para atingir {fmt(parseFloat(goal))} com {fmt(monthlyAmt)}/mês
              </div>
            </>
          )}
          {mode === 'calc_amount' && goal && requiredMonthly && (
            <>
              <div style={{ fontSize: 12, color: 'var(--gain-strong)', fontWeight: 600, marginBottom: 4 }}>Montante mensal necessário</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>{fmt(requiredMonthly)}/mês</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                Para atingir {fmt(parseFloat(goal))} em {years} anos
              </div>
            </>
          )}
          {!goal && mode !== 'calc_goal' && (
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>Introduz o teu objetivo para ver a projecção.</div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={handleContinue} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Ver resumo
        </button>
      </div>
    </div>
  );
}
