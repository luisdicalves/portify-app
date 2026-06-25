'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const AMOUNTS  = ['100 €','250 €','300 €','500 €','1.000 €'];
const PERIODS  = ['Semanal','Mensal','Trimestral','Anual'];
const HORIZONS = ['< 2 anos','2 – 5 anos','5 – 10 anos','> 10 anos'];

const AMOUNT_VALUES = [100, 250, 300, 500, 1000];
const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
const HORIZON_YEARS = [1, 3, 7, 15];

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '10px 16px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
      fontSize: 14, fontWeight: 600, transition: 'all .15s', border: '1px solid',
      background: on ? 'var(--primary-container)' : 'var(--surface-low)',
      color: on ? 'var(--on-primary-container)' : 'var(--on-surface)',
      borderColor: on ? 'var(--primary-strong)' : 'var(--card-border)',
    }}>
      {label}
    </div>
  );
}

const label11 = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--on-surface-variant)', marginBottom: 9 };

export default function PlanSetPage() {
  const router = useRouter();
  const [goal, setGoal] = useState('100000');
  const [amt, setAmt] = useState(1);
  const [period, setPeriod] = useState(1);
  const [horizon, setHorizon] = useState(2);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('investment_plans').upsert({
        user_id: user.id,
        amount: AMOUNT_VALUES[amt],
        frequency: FREQUENCIES[period],
        horizon_years: HORIZON_YEARS[horizon],
        goal_amount: parseFloat(goal) || 0,
      });
    }
    router.push('/auth/summary');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 24px 8px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer', display: 'block', marginBottom: 8 }}>
          arrow_back_ios_new
        </span>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Define o teu plano</div>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 4, textWrap: 'pretty' as never }}>Podes alterar estes valores em qualquer altura.</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Goal amount */}
        <div>
          <div style={label11}>Objetivo financeiro</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 16px' }}>
            <span style={{ fontSize: 18, color: 'var(--outline)' }}>€</span>
            <input value={goal} onChange={e => setGoal(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '15px 0', fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }} />
          </div>
        </div>

        {/* Amount per period */}
        <div>
          <div style={label11}>Montante por período</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {AMOUNTS.map((a, i) => <Chip key={i} label={a} on={amt === i} onClick={() => setAmt(i)} />)}
          </div>
        </div>

        {/* Frequency */}
        <div>
          <div style={label11}>Periodicidade</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {PERIODS.map((p, i) => <Chip key={i} label={p} on={period === i} onClick={() => setPeriod(i)} />)}
          </div>
        </div>

        {/* Horizon */}
        <div>
          <div style={label11}>Horizonte temporal</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {HORIZONS.map((h, i) => <Chip key={i} label={h} on={horizon === i} onClick={() => setHorizon(i)} />)}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 8 }} />

        <button onClick={handleContinue} disabled={saving}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
          Ver resumo
        </button>
      </div>
    </div>
  );
}
