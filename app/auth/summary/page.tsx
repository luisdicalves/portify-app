'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
  none:         'Nenhuma',
  beginner:     'Iniciante',
  intermediate: 'Intermédio',
  experienced:  'Experiente',
  professional: 'Profissional',
};
const REACTION_LABELS: Record<string, string> = {
  sell_all:  'Venderia tudo',
  sell_some: 'Venderia parte',
  hold:      'Aguardaria',
  buy_more:  'Compraria mais',
};
const FINANCIAL_LABELS: Record<string, string> = {
  unstable:    'Instável',
  stable:      'Estável',
  comfortable: 'Confortável',
  wealthy:     'Elevada',
};
const LIQUIDITY_LABELS: Record<string, string> = {
  critical: 'É crítico',
  possible: 'É possível',
  unlikely: 'Improvável',
  never:    'Nunca',
};
const FREQ_LABELS: Record<string, string> = {
  weekly:    'Semanal',
  monthly:   'Mensal',
  quarterly: 'Trimestral',
  annual:    'Anual',
};
const RATE_BY_RISK: Record<string, number> = {
  very_conservative: 0.035,
  conservative:      0.050,
  moderate:          0.070,
  aggressive:        0.090,
  very_aggressive:   0.110,
};

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function calcFV(pmt: number, rAnnual: number, years: number) {
  if (rAnnual === 0) return pmt * 12 * years;
  const r = rAnnual / 12;
  const n = years * 12;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

// ── Tipos ─────────────────────────────────────────────────────────
interface Profile {
  first_name: string;
  last_name: string;
  user_handle: string;
  experience_level: string;
  risk_profile: string;
  investment_goal: string;
  market_reaction: string;
  financial_status: string;
  liquidity_need: string;
  preferred_sectors: string[];
}
interface Plan {
  amount: number;
  frequency: string;
  horizon_years: number;
  goal_amount: number;
}

// ── Row do resumo ─────────────────────────────────────────────────
function Row({ icon, label, value, last = false }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--card-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>{icon}</span>
        <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', textAlign: 'right', maxWidth: 160 }}>{value}</span>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────
function Toast({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'absolute', bottom: 100, left: 20, right: 20,
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
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(false);

  // Carregar dados do Supabase (perfil) + sessionStorage (plano)
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

      // Plano vem do sessionStorage (ainda não foi gravado)
      const stored = sessionStorage.getItem('onb_plan');
      if (stored) {
        try { setPlan(JSON.parse(stored)); } catch { /* ignore */ }
      }
    })();
  }, []);

  // ── Projecção ──────────────────────────────────────────────────
  const rate = profile ? (RATE_BY_RISK[profile.risk_profile] ?? 0.07) : 0.07;
  const projectedFV = plan
    ? calcFV(plan.amount, rate, plan.horizon_years)
    : 0;
  // Intervalo optimista/pessimista ±1%
  const fvLow  = plan ? calcFV(plan.amount, Math.max(0, rate - 0.01), plan.horizon_years) : 0;
  const fvHigh = plan ? calcFV(plan.amount, rate + 0.01, plan.horizon_years) : 0;

  // ── Gravação final ─────────────────────────────────────────────
  async function handleFinalize() {
    if (!plan || saving) return;
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Gravar plano na DB
    await supabase.from('investment_plans').upsert({
      user_id:       user.id,
      amount:        plan.amount,
      frequency:     plan.frequency,
      horizon_years: plan.horizon_years,
      goal_amount:   plan.goal_amount,
    });

    // Limpar sessionStorage
    sessionStorage.removeItem('onb_plan');
    sessionStorage.removeItem('onb_risk_profile');

    setSaving(false);

    // Mostrar toast e navegar após 1.8s
    setToast(true);
    setTimeout(() => router.push('/dashboard'), 1800);
  }

  if (!profile || !plan) {
    return (
      <div className="phone-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--on-surface-variant)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
      </div>
    );
  }

  const sectors = (profile.preferred_sectors ?? [])
    .map((s: string) => ({ tech: 'Tecnologia', health: 'Saúde', finance: 'Finanças', energy: 'Energia', consumer: 'Consumo', industry: 'Indústria', realestate: 'Imobiliário', materials: 'Materiais', comms: 'Comunicações' }[s] ?? s))
    .join(', ');

  return (
    <div className="phone-shell" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Tudo pronto! 🎉</div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 6 }}>
            Confirma o teu perfil antes de entrar.
          </div>
        </div>

        {/* Projecção */}
        <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gain-strong)', marginBottom: 6 }}>
            Projecção estimada
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--gain)', letterSpacing: '-0.02em' }}>
            {fmt(fvLow)} – {fmt(fvHigh)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 6 }}>
            Com {fmt(plan.amount)}/{FREQ_LABELS[plan.frequency]?.toLowerCase()} durante {plan.horizon_years} anos · {(rate * 100).toFixed(1)}% a.a.
          </div>
        </div>

        {/* Secção: Perfil de investidor */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
            Perfil de investidor
          </div>
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '0 16px' }}>
            <Row icon="school"              label="Experiência"         value={EXP_LABELS[profile.experience_level] ?? '—'} />
            <Row icon="local_fire_department" label="Perfil de risco"   value={RISK_LABELS[profile.risk_profile] ?? '—'} />
            <Row icon="flag"               label="Objetivo"             value={GOAL_LABELS[profile.investment_goal] ?? '—'} />
            <Row icon="trending_down"      label="Reação a queda"       value={REACTION_LABELS[profile.market_reaction] ?? '—'} />
            <Row icon="savings"            label="Situação financeira"  value={FINANCIAL_LABELS[profile.financial_status] ?? '—'} />
            <Row icon="lock"               label="Acesso ao dinheiro"   value={LIQUIDITY_LABELS[profile.liquidity_need] ?? '—'} last />
          </div>
        </div>

        {/* Secção: Plano */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
            Plano de investimento
          </div>
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '0 16px' }}>
            <Row icon="payments"        label="Montante"        value={`${fmt(plan.amount)}/${FREQ_LABELS[plan.frequency]?.toLowerCase()}`} />
            <Row icon="calendar_month"  label="Horizonte"       value={`${plan.horizon_years} anos`} />
            <Row icon="target"          label="Objetivo"        value={fmt(plan.goal_amount)} last />
          </div>
        </div>

        {/* Secção: Setores */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
            Setores de interesse
          </div>
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '0 16px' }}>
            <Row icon="category" label="Setores" value={sectors || '—'} last />
          </div>
        </div>

        {/* Nota */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', flexShrink: 0, marginTop: 2 }}>info</span>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Os dados são guardados apenas quando carregas em <strong>Finalizar</strong>. Podes voltar atrás e editar qualquer campo.
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

      {/* Toast */}
      <Toast visible={toast} />
    </div>
  );
}
