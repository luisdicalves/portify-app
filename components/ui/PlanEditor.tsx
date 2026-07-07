'use client';

import { useState } from 'react';
import { calcPlan, calcFV, calcPMT, calcYears, type UserProfile, type AssetClass } from '@/lib/planCalculator';
import { PLAN_AMOUNT_VALUES, PLAN_AMOUNTS, PLAN_PERIODS, PLAN_FREQUENCIES, PLAN_FREQUENCY_PERIODS_PER_YEAR } from '@/lib/profileConstants';

export interface PlanEditorResult {
  amount: number;
  frequency: string;
  horizon_years: number;
  goal_amount: number;
  preferred_asset_classes: string[];
}

interface PlanEditorProps {
  profile: UserProfile | null;
  initialAmount?: number;
  initialFrequency?: string;
  initialYears?: number;
  initialGoal?: number;
  initialClasses?: AssetClass[];
  onSave: (plan: PlanEditorResult) => void;
  saveLabel?: string;
  saving?: boolean;
}

type Mode = 'calc_goal' | 'calc_years' | 'calc_amount';

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

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
  fontSize: 11, fontWeight: 600 as const, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, color: 'var(--on-surface-variant)', marginBottom: 9,
};

export function PlanEditor({ profile, initialAmount, initialFrequency, initialYears, initialGoal, initialClasses, onSave, saveLabel = 'Confirmar', saving = false }: PlanEditorProps) {
  const initAmtIdx = initialAmount != null
    ? Math.max(0, PLAN_AMOUNT_VALUES.indexOf(initialAmount))
    : 2; // 250 €
  const initFreqIdx = initialFrequency != null
    ? Math.max(0, (PLAN_FREQUENCIES as readonly string[]).indexOf(initialFrequency))
    : PLAN_FREQUENCIES.indexOf('monthly');

  const [mode, setMode]       = useState<Mode>('calc_goal');
  const [amtIdx, setAmtIdx]   = useState(initAmtIdx);
  const [freqIdx, setFreqIdx] = useState(initFreqIdx);
  const [years, setYears]     = useState(initialYears ?? 10);
  const [goal, setGoal]       = useState(initialGoal ? String(initialGoal) : '');
  const [preferredClasses, setPreferredClasses] = useState<AssetClass[]>(
    (initialClasses ?? ['stock', 'etf', 'bond_etf']) as AssetClass[]
  );

  const plan      = profile ? calcPlan({ ...profile, horizon_years: years }, preferredClasses) : null;
  const rate      = plan?.rate      ?? 0.07;
  const rateLow   = plan?.rateLow   ?? 0.06;
  const rateHigh  = plan?.rateHigh  ?? 0.08;

  // Alocação sempre calculada a partir das classes selecionadas,
  // mesmo quando profile ainda não carregou.
  const alloc = plan?.allocation ?? (() => {
    const base = { stock: 0.45, etf: 0.45, bond_etf: 0.10 };
    const filtered = {
      stock:    preferredClasses.includes('stock')    ? base.stock    : 0,
      etf:      preferredClasses.includes('etf')      ? base.etf      : 0,
      bond_etf: preferredClasses.includes('bond_etf') ? base.bond_etf : 0,
    };
    const total = filtered.stock + filtered.etf + filtered.bond_etf || 1;
    return {
      stock:    Math.round(filtered.stock    / total * 100) / 100,
      etf:      Math.round(filtered.etf      / total * 100) / 100,
      bond_etf: Math.round(filtered.bond_etf / total * 100) / 100,
    };
  })();

  const monthlyAmt   = PLAN_AMOUNT_VALUES[amtIdx];
  const goalNum      = parseInt(goal.replace(/\D/g, ''), 10) || 0;
  const periodsPerYr = PLAN_FREQUENCY_PERIODS_PER_YEAR[PLAN_FREQUENCIES[freqIdx]];

  const rawYears        = goalNum > 0 ? calcYears(goalNum, monthlyAmt, rate, periodsPerYr) : null;
  const yearsInfeasible = rawYears !== null && (!isFinite(rawYears) || rawYears > 50);
  const projectedYears  = yearsInfeasible ? null : rawYears;
  const requiredMonthly = goalNum > 0 ? calcPMT(goalNum, rate, years, periodsPerYr) : null;

  const finalGoal = mode === 'calc_goal' ? calcFV(monthlyAmt, rate, years, periodsPerYr)
    : goalNum > 0 ? goalNum
    : calcFV(monthlyAmt, rate, years, periodsPerYr);

  function toggleClass(cls: AssetClass) {
    setPreferredClasses(prev => {
      if (prev.includes(cls)) {
        const next = prev.filter(c => c !== cls);
        return next.length === 0 ? prev : next;
      }
      return [...prev, cls];
    });
  }

  function handleSave() {
    onSave({
      amount: monthlyAmt,
      frequency: PLAN_FREQUENCIES[freqIdx],
      horizon_years: years,
      goal_amount: finalGoal,
      preferred_asset_classes: preferredClasses,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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

      {/* Input principal */}
      <div>
        <div style={lbl}>
          {mode === 'calc_amount' || mode === 'calc_years' ? 'Objetivo financeiro (€)' : 'Montante por período'}
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
            {PLAN_AMOUNTS.map((a, i) => (
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
            {PLAN_PERIODS.map((p, i) => (
              <Chip key={i} label={p} on={freqIdx === i} onClick={() => setFreqIdx(i)} />
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

      {/* Classes de ativo */}
      <div>
        <div style={lbl}>O que queres incluir no portfólio?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { cls: 'stock'    as AssetClass, label: 'Ações' },
            { cls: 'etf'      as AssetClass, label: 'ETFs' },
            { cls: 'bond_etf' as AssetClass, label: 'Bond ETFs' },
          ]).map(({ cls, label }) => (
            <Chip key={cls} label={label} on={preferredClasses.includes(cls)} onClick={() => toggleClass(cls)} />
          ))}
        </div>
        {preferredClasses.length === 1 && (
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
            Tens de manter pelo menos uma classe ativa.
          </div>
        )}
      </div>

      {/* Projecção */}
      <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
        {mode === 'calc_goal' && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 4 }}>Objetivo estimado</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>
              {fmt(calcFV(monthlyAmt, rateLow, years, periodsPerYr))} – {fmt(calcFV(monthlyAmt, rateHigh, years, periodsPerYr))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
              {fmt(monthlyAmt)}/{PLAN_PERIODS[freqIdx]?.toLowerCase()} · {years} anos · {(rateLow * 100).toFixed(1)}%–{(rateHigh * 100).toFixed(1)}% a.a.
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
                  Com {fmt(monthlyAmt)}/{PLAN_PERIODS[freqIdx]?.toLowerCase()} não é possível atingir {fmt(goalNum)} num prazo razoável. Aumenta o montante ou reduz o objetivo.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>{projectedYears} anos</div>
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
                  Para atingir {fmt(goalNum)} com {fmt(monthlyAmt)}/{PLAN_PERIODS[freqIdx]?.toLowerCase()} · {(rate * 100).toFixed(1)}% a.a.
                </div>
              </>
            )}
          </>
        )}
        {mode === 'calc_amount' && requiredMonthly !== null && goalNum > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 4 }}>Montante {PLAN_PERIODS[freqIdx]?.toLowerCase()} necessário</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>{fmt(requiredMonthly)}/{PLAN_PERIODS[freqIdx]?.toLowerCase()}</div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 6 }}>
              Para atingir {fmt(goalNum)} em {years} anos · {(rate * 100).toFixed(1)}% a.a.
            </div>
          </>
        )}
        {goalNum === 0 && mode !== 'calc_goal' && (
          <div style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>Introduz o teu objetivo para ver a projecção.</div>
        )}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gain)', display: 'flex', gap: 8 }}>
          {[
            { label: 'Ações',     value: alloc.stock,    color: 'var(--primary-strong)' },
            { label: 'ETFs',      value: alloc.etf,      color: 'var(--gain)' },
            { label: 'Bond ETFs', value: alloc.bond_etf, color: 'var(--on-surface-variant)' },
          ].filter(a => a.value > 0).map(a => (
            <div key={a.label} data-testid="alloc-item" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: a.color }}>{Math.round(a.value * 100)}%</div>
              <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{a.label}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
      >
        {saveLabel}
      </button>
    </div>
  );
}
