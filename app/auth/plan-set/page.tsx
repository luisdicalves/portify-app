'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { calcPlan, calcFV, calcPMT, calcYears, type UserProfile } from '@/lib/planCalculator';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';

// ── Constantes ────────────────────────────────────────────────────
const AMOUNT_VALUES = [50, 100, 250, 500, 1000, 2000];
const AMOUNT_LABELS = ['50 €', '100 €', '250 €', '500 €', '1.000 €', '2.000 €'];
const FREQUENCIES   = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
const FREQ_LABELS   = ['Semanal', 'Mensal', 'Trimestral', 'Anual'];

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

const lbl = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, color: 'var(--on-surface-variant)', marginBottom: 9,
};

// ── Página ────────────────────────────────────────────────────────
export default function PlanSetPage() {
  const router = useRouter();
  const { user } = useUser();

  type Mode = 'calc_goal' | 'calc_years' | 'calc_amount';
  const [mode, setMode]       = useState<Mode>('calc_goal');
  const [amtIdx, setAmtIdx]   = useState(2);   // 250 €
  const [freqIdx, setFreqIdx] = useState(1);   // Mensal
  const [years, setYears]     = useState(() => {
    if (typeof window === 'undefined') return 10;
    const h = parseInt(sessionStorage.getItem('onb_horizon') ?? '', 10);
    return !isNaN(h) && h >= 1 && h <= 50 ? h : 10;
  });
  const [goal, setGoal]       = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('risk_profile, investment_goal, experience_level, market_reaction, financial_status, liquidity_need')
        .eq('id', user.id)
        .single();
      if (data) setProfile(data as UserProfile);
    })();
  }, [user]);

  // ── Cálculo dinâmico ──────────────────────────────────────────
  const plan      = profile ? calcPlan({ ...profile, horizon_years: years }) : null;
  const rate      = plan?.rate      ?? 0.07;
  const rateLow   = plan?.rateLow   ?? 0.06;
  const rateHigh  = plan?.rateHigh  ?? 0.08;
  const alloc     = plan?.allocation ?? { stock: 0.45, etf: 0.45, bond_etf: 0.10 };

  const monthlyAmt = AMOUNT_VALUES[amtIdx];
  const goalNum    = parseInt(goal.replace(/\D/g, ''), 10) || 0;

  // calcYears pode devolver Infinity se PMT < juros mensais gerados
  const rawYears       = goalNum > 0 ? calcYears(goalNum, monthlyAmt, rate) : null;
  const yearsInfeasible = rawYears !== null && (!isFinite(rawYears) || rawYears > 50);
  const projectedYears  = yearsInfeasible ? null : rawYears;

  const projectedGoal   = calcFV(monthlyAmt, rate, years);
  const requiredMonthly = goalNum > 0 ? calcPMT(goalNum, rate, years) : null;

  const finalGoal = mode === 'calc_goal' ? projectedGoal
    : mode === 'calc_years' && goalNum > 0 ? goalNum
    : mode === 'calc_amount' && goalNum > 0 ? goalNum
    : projectedGoal;

  function handleContinue() {
    sessionStorage.setItem('onb_plan', JSON.stringify({
      amount:        monthlyAmt,
      frequency:     FREQUENCIES[freqIdx],
      horizon_years: years,
      goal_amount:   finalGoal,
    }));
    router.push('/auth/summary');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>

      {/* Header simples — não é um passo do onboarding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 4px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--on-surface)', display: 'flex', alignItems: 'center', borderRadius: 'var(--radius-full)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>Define o teu plano</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Podes alterar estes valores a qualquer momento.</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Modo de cálculo */}
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

        {/* Input principal — montante ou objetivo */}
        <div>
          <div style={lbl}>
            {mode === 'calc_amount' || mode === 'calc_years' ? 'Objetivo financeiro (€)' : 'Montante mensal'}
          </div>
          {mode === 'calc_amount' || mode === 'calc_years' ? (
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
        {mode !== 'calc_years' && (
          <div>
            <div style={lbl}>Periodicidade</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FREQ_LABELS.map((f, i) => (
                <Chip key={i} label={f} on={freqIdx === i} onClick={() => setFreqIdx(i)} />
              ))}
            </div>
          </div>
        )}

        {/* Horizonte em anos */}
        {mode !== 'calc_years' && (
          <div>
            <div style={lbl}>Horizonte (anos)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setYears(y => Math.max(1, y - 1))} style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', background: 'var(--surface-low)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', fontFamily: 'inherit' }}>−</button>
              <span style={{ fontSize: 26, fontWeight: 700, minWidth: 70, textAlign: 'center', letterSpacing: '-0.02em' }}>
                {years} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--on-surface-variant)' }}>anos</span>
              </span>
              <button onClick={() => setYears(y => Math.min(50, y + 1))} style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', background: 'var(--surface-low)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', fontFamily: 'inherit' }}>+</button>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {[5, 10, 15, 20, 30].map(y => (
                  <button key={y} onClick={() => setYears(y)} style={{
                    padding: '5px 10px', borderRadius: 'var(--radius-full)',
                    border: `1px solid ${years === y ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                    background: years === y ? 'var(--primary-container)' : 'var(--surface-low)',
                    color: years === y ? 'var(--primary-strong)' : 'var(--on-surface-variant)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{y}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Projecção */}
        <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          {mode === 'calc_goal' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 4 }}>Objetivo estimado</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>
                {fmt(calcFV(monthlyAmt, rateLow, years))} – {fmt(calcFV(monthlyAmt, rateHigh, years))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
                {fmt(monthlyAmt)}/mês · {years} anos · taxa {(rateLow * 100).toFixed(1)}%–{(rateHigh * 100).toFixed(1)}% a.a.
              </div>
            </>
          )}
          {mode === 'calc_years' && goalNum > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 4 }}>Prazo estimado</div>
              {yearsInfeasible ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface-variant)', letterSpacing: '-0.02em' }}>Mais de 50 anos</div>
                  <div style={{ fontSize: 12, color: 'var(--loss)', marginTop: 6 }}>
                    Com {fmt(monthlyAmt)}/mês não é possível atingir {fmt(goalNum)} num prazo razoável. Aumenta o montante ou reduz o objetivo.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>{projectedYears} anos</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
                    Para atingir {fmt(goalNum)} com {fmt(monthlyAmt)}/mês · {(rate * 100).toFixed(1)}% a.a.
                  </div>
                </>
              )}
            </>
          )}
          {mode === 'calc_amount' && requiredMonthly !== null && goalNum > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 4 }}>Montante mensal necessário</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>{fmt(requiredMonthly)}/mês</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
                Para atingir {fmt(goalNum)} em {years} anos · {(rate * 100).toFixed(1)}% a.a.
              </div>
            </>
          )}
          {goalNum === 0 && mode !== 'calc_goal' && (
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>Introduz o teu objetivo para ver a projecção.</div>
          )}

          {/* Alocação sugerida */}
          {plan && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gain)', display: 'flex', gap: 8 }}>
              {[
                { label: 'Ações',     value: alloc.stock,    color: 'var(--primary-strong)' },
                { label: 'ETFs',      value: alloc.etf,      color: 'var(--gain)' },
                { label: 'Bond ETFs', value: alloc.bond_etf, color: 'var(--on-surface-variant)' },
              ].filter(a => a.value > 0).map(a => (
                <div key={a.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: a.color }}>{Math.round(a.value * 100)}%</div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{a.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleContinue}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Ver resumo
        </button>
      </div>
    </div>
  );
}
