'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calcPlan, calcFV, type UserProfile, type PlanCalcResult } from '@/lib/planCalculator';

// ── Labels ────────────────────────────────────────────────────────
const RISK_LABELS: Record<string, string> = {
  very_conservative: 'Muito conservador',
  conservative:      'Conservador',
  moderate:          'Moderado',
  aggressive:        'Agressivo',
  very_aggressive:   'Muito agressivo',
};
const GOAL_LABELS: Record<string, string> = {
  emergency_fund: 'Fundo de emergência',
  short_purchase: 'Compra a curto prazo',
  income:         'Rendimento passivo',
  wealth_growth:  'Crescimento de capital',
  retirement:     'Reforma',
  legacy:         'Legado',
};
const EXP_LABELS: Record<string, string> = {
  none: 'Nenhuma', beginner: 'Iniciante', intermediate: 'Intermédio',
  experienced: 'Experiente', professional: 'Profissional',
};
const REACTION_LABELS: Record<string, string> = {
  sell_all: 'Venderia tudo', sell_some: 'Venderia parte',
  hold: 'Aguardaria', buy_more: 'Compraria mais',
};
const FINANCIAL_LABELS: Record<string, string> = {
  unstable: 'Instável', stable: 'Estável', comfortable: 'Confortável', wealthy: 'Elevada',
};
const LIQUIDITY_LABELS: Record<string, string> = {
  critical: 'É crítico', possible: 'É possível', unlikely: 'Improvável', never: 'Nunca',
};
const FREQ_LABELS: Record<string, string> = {
  weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual',
};
const SECTOR_LABELS: Record<string, string> = {
  tech: 'Tecnologia', health: 'Saúde', finance: 'Finanças', energy: 'Energia',
  consumer: 'Consumo', industry: 'Indústria', realestate: 'Imobiliário',
  materials: 'Materiais', comms: 'Comunicações',
};

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// ── Tipos ─────────────────────────────────────────────────────────
interface Profile extends UserProfile {
  first_name: string;
  last_name: string;
  user_handle: string;
  preferred_sectors: string[];
}
interface Plan {
  amount: number;
  frequency: string;
  horizon_years: number;
  goal_amount: number;
}

// ── Componentes ───────────────────────────────────────────────────
function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
      {label}
    </div>
  );
}

function Row({ icon, label, value, last = false }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--card-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>{icon}</span>
        <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', textAlign: 'right', maxWidth: 170 }}>{value}</span>
    </div>
  );
}

function Toast({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'absolute', bottom: 24, left: 20, right: 20,
      background: 'var(--primary-strong)', color: '#fff',
      borderRadius: 'var(--radius-lg)', padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: 'var(--shadow)',
      transform: visible ? 'translateY(0)' : 'translateY(120px)',
      opacity: visible ? 1 : 0,
      transition: 'all .35s cubic-bezier(.4,0,.2,1)',
      zIndex: 200,
    }}>
      <span className="material-symbols-outlined icf" style={{ fontSize: 22, flexShrink: 0 }}>check_circle</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Perfil guardado!</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Bem-vindo ao Portify.</div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────
export default function SummaryPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan]       = useState<Plan | null>(null);
  const [result, setResult]   = useState<PlanCalcResult | null>(null);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: p } = await supabase
        .from('profiles')
        .select('first_name, last_name, user_handle, experience_level, risk_profile, investment_goal, market_reaction, financial_status, liquidity_need, preferred_sectors')
        .eq('id', user.id)
        .single();

      if (p) setProfile(p as Profile);

      const stored = sessionStorage.getItem('onb_plan');
      if (stored) {
        try {
          const parsedPlan = JSON.parse(stored);
          setPlan(parsedPlan);

          // Calcular taxa e alocação dinamicamente a partir do perfil + horizonte real
          if (p) {
            const userProfile: UserProfile = {
              ...(p as Profile),
              horizon_years: parsedPlan.horizon_years,
            };
            setResult(calcPlan(userProfile));
          }
        } catch { /* ignore */ }
      }
    })();
  }, []);

  async function handleFinalize() {
    if (!plan || saving) return;
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('investment_plans').upsert({
      user_id:       user.id,
      amount:        plan.amount,
      frequency:     plan.frequency,
      horizon_years: plan.horizon_years,
      goal_amount:   plan.goal_amount,
    });

    sessionStorage.removeItem('onb_plan');

    setSaving(false);
    setToast(true);
    setTimeout(() => router.push('/dashboard'), 1800);
  }

  if (!profile || !plan || !result) {
    return (
      <div className="phone-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--on-surface-variant)' }}>progress_activity</span>
      </div>
    );
  }

  const { rate, rateLow, rateHigh, allocation, riskScore, conflicts } = result;
  const fvLow  = calcFV(plan.amount, rateLow,  plan.horizon_years);
  const fvHigh = calcFV(plan.amount, rateHigh, plan.horizon_years);

  const sectors = (profile.preferred_sectors ?? [])
    .map(s => SECTOR_LABELS[s] ?? s)
    .join(', ');

  return (
    <div className="phone-shell" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Título */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Tudo pronto! 🎉</div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 6 }}>
            Confirma o teu perfil antes de entrar.
          </div>
        </div>

        {/* Projecção dinâmica */}
        <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 6 }}>
            Projecção estimada
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>
            {fmt(fvLow)} – {fmt(fvHigh)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 6 }}>
            {fmt(plan.amount)}/{FREQ_LABELS[plan.frequency]?.toLowerCase()} · {plan.horizon_years} anos · {(rateLow * 100).toFixed(1)}%–{(rateHigh * 100).toFixed(1)}% a.a.
          </div>

          {/* Como a taxa foi calculada */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gain)' }}>
            <div style={{ fontSize: 11, color: 'var(--gain-strong)', fontWeight: 600, marginBottom: 8 }}>
              COMO CALCULÁMOS A TAXA · SCORE DE RISCO {riskScore}/100
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: 'Ações',     value: allocation.stock,    color: 'var(--primary-strong)', return: '10%' },
                { label: 'ETFs',      value: allocation.etf,      color: 'var(--gain)',           return: '8%' },
                { label: 'Bond ETFs', value: allocation.bond_etf, color: 'var(--on-surface-variant)', return: '3.5%' },
              ].filter(a => a.value > 0).map(a => (
                <div key={a.label} style={{ flex: 1, background: 'rgba(0,0,0,0.04)', borderRadius: 'var(--radius-md)', padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: a.color }}>{Math.round(a.value * 100)}%</div>
                  <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: a.color, fontWeight: 600 }}>{a.return} a.a.</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 8 }}>
              Taxa = média ponderada dos retornos históricos por classe de ativo, ajustada pelo teu comportamento em quedas de mercado.
            </div>
          </div>
        </div>

        {/* Alertas de contradição */}
        {conflicts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conflicts.map((c, i) => (
              <div key={i} style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined icf" style={{ fontSize: 18, color: 'var(--loss)', flexShrink: 0, marginTop: 1 }}>warning</span>
                <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </div>
        )}

        {/* Perfil de investidor */}
        <div>
          <SectionTitle label="Perfil de investidor" />
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '0 16px' }}>
            <Row icon="school"               label="Experiência"        value={EXP_LABELS[profile.experience_level]     ?? '—'} />
            <Row icon="local_fire_department" label="Perfil de risco"   value={RISK_LABELS[profile.risk_profile]        ?? '—'} />
            <Row icon="flag"                 label="Objetivo"           value={GOAL_LABELS[profile.investment_goal]     ?? '—'} />
            <Row icon="trending_down"        label="Reação a queda"     value={REACTION_LABELS[profile.market_reaction] ?? '—'} />
            <Row icon="savings"              label="Situação financeira" value={FINANCIAL_LABELS[profile.financial_status] ?? '—'} />
            <Row icon="lock"                 label="Acesso ao dinheiro" value={LIQUIDITY_LABELS[profile.liquidity_need] ?? '—'} last />
          </div>
        </div>

        {/* Plano */}
        <div>
          <SectionTitle label="Plano de investimento" />
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '0 16px' }}>
            <Row icon="payments"       label="Montante"   value={`${fmt(plan.amount)}/${FREQ_LABELS[plan.frequency]?.toLowerCase()}`} />
            <Row icon="calendar_month" label="Horizonte"  value={`${plan.horizon_years} anos`} />
            <Row icon="target"         label="Objetivo"   value={fmt(plan.goal_amount)} last />
          </div>
        </div>

        {/* Setores */}
        <div>
          <SectionTitle label="Setores de interesse" />
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '0 16px' }}>
            <Row icon="category" label="Setores" value={sectors || '—'} last />
          </div>
        </div>

        {/* Nota */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', flexShrink: 0, marginTop: 2 }}>info</span>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Os dados só são guardados quando carregas em <strong>Finalizar</strong>. Podes voltar atrás e editar qualquer campo.
          </span>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleFinalize}
            disabled={saving}
            style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'A guardar…' : 'Finalizar e entrar'}
          </button>
          <button
            onClick={() => router.back()}
            style={{ background: 'transparent', color: 'var(--on-surface-variant)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Voltar e editar
          </button>
        </div>
      </div>

      <Toast visible={toast} />
    </div>
  );
}
