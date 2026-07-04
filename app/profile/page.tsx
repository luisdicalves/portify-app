'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { useUser } from '@/lib/hooks/useUser';
import BottomNav from '@/components/ui/BottomNav';
import { SelectList, SelectOption } from '@/components/ui/SelectList';
import { calcPlan } from '@/lib/planCalculator';
import type { UserProfile } from '@/lib/planCalculator';
import type { DbProfile, DbPlan } from '@/lib/types/profile';

const RISK_LABELS: Record<string, string> = { conservative: 'Conservador', moderate: 'Moderado', aggressive: 'Agressivo' };
const GOAL_LABELS: Record<string, string> = { short: 'Curto prazo', long: 'Longo prazo', income: 'Rendimento', retirement: 'Reforma' };
const FREQ_LABELS: Record<string, string> = { weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };

// Same options as the onboarding pages (app/auth/risk, app/auth/objective) —
// duplicated here so the profile page can edit them in a bottom sheet instead
// of re-running the onboarding flow.
const RISK_OPTIONS: SelectOption[] = [
  { id: 'conservative', label: 'Conservador', desc: 'Prefiro proteger o capital.', icon: 'shield' },
  { id: 'moderate', label: 'Moderado', desc: 'Equilíbrio entre risco e retorno.', icon: 'balance' },
  { id: 'aggressive', label: 'Agressivo', desc: 'Aceito volatilidade por mais retorno.', icon: 'local_fire_department' },
];

const OBJECTIVE_OPTIONS: SelectOption[] = [
  { id: 'short', label: 'Curto prazo', desc: 'Comprar e vender no curto prazo.', icon: 'speed' },
  { id: 'long', label: 'Longo prazo', desc: 'Manter posições durante anos.', icon: 'calendar_month' },
  { id: 'income', label: 'Rendimento', desc: 'Gerar rendimento com dividendos.', icon: 'payments' },
  { id: 'retirement', label: 'Reforma', desc: 'Construir um capital para a reforma.', icon: 'beach_access' },
];

const SECTOR_OPTIONS = [
  { id: 'tech', label: 'Tecnologia', icon: 'computer' },
  { id: 'health', label: 'Saúde', icon: 'health_and_safety' },
  { id: 'finance', label: 'Finanças', icon: 'account_balance' },
  { id: 'energy', label: 'Energia', icon: 'bolt' },
  { id: 'consumer', label: 'Consumo', icon: 'shopping_bag' },
  { id: 'industry', label: 'Indústria', icon: 'factory' },
  { id: 'realestate', label: 'Imobiliário', icon: 'apartment' },
  { id: 'materials', label: 'Materiais', icon: 'diamond' },
  { id: 'comms', label: 'Comunicações', icon: 'cell_tower' },
];

const PLAN_AMOUNTS = ['100 €', '250 €', '300 €', '500 €', '1.000 €'];
const PLAN_PERIODS = ['Semanal', 'Mensal', 'Trimestral', 'Anual'];
const PLAN_HORIZONS = ['< 2 anos', '2 – 5 anos', '5 – 10 anos', '> 10 anos'];
const PLAN_AMOUNT_VALUES = [100, 250, 300, 500, 1000];
const PLAN_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
const PLAN_HORIZON_YEARS = [1, 3, 7, 15];

function PlanChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
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

function horizonLabel(years: number | null | undefined) {
  if (years == null) return '—';
  if (years < 2) return '< 2 anos';
  if (years <= 5) return '2 – 5 anos';
  if (years <= 10) return '5 – 10 anos';
  return '> 10 anos';
}

type Profile = DbProfile;
type Plan = DbPlan;

function SectionLabel({ label }: { label: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 6px 8px' }}>{label}</div>;
}

function SettingsRow({ icon, label, value, onPress, border = true }: { icon: string; label: string; value?: string; onPress?: () => void; border?: boolean }) {
  return (
    <div onClick={onPress} style={{ cursor: onPress ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: border ? '1px solid var(--hairline)' : 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>{icon}</span>
        {label}
      </span>
      {value !== undefined
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--on-surface-variant)' }}>{value}<span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span></span>
        : onPress ? <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>chevron_right</span> : null
      }
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>{children}</div>;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const [riskSheetOpen, setRiskSheetOpen] = useState(false);
  const [riskSelected, setRiskSelected] = useState(1);
  const [objectiveSheetOpen, setObjectiveSheetOpen] = useState(false);
  const [objectiveSelected, setObjectiveSelected] = useState(1);
  const [sectorsSheetOpen, setSectorsSheetOpen] = useState(false);
  const [sectorsSelected, setSectorsSelected] = useState<Set<string>>(new Set());
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [planGoal, setPlanGoal] = useState('100000');
  const [planAmt, setPlanAmt] = useState(1);
  const [planPeriod, setPlanPeriod] = useState(1);
  const [planHorizon, setPlanHorizon] = useState(2);
  const [savingField, setSavingField] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = createClient();
      const [{ data: p }, { data: pl }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name, user_handle, risk_profile, investment_goal, experience_level, market_reaction, financial_status, liquidity_need, preferred_sectors, investor_since').eq('id', user.id).single(),
        supabase.from('investment_plans').select('amount, frequency, horizon_years, goal_amount').eq('user_id', user.id).maybeSingle(),
      ]);
      if (p) setProfile(p);
      if (pl) setPlan(pl);
    })();
  }, [user]);

  // Calcular riskScore e alocação sempre que o perfil ou plano mudar
  const planResult = (() => {
    if (!profile?.risk_profile || !profile?.investment_goal) return null;
    try {
      return calcPlan({
        risk_profile:     profile.risk_profile     as UserProfile['risk_profile'],
        investment_goal:  profile.investment_goal   as UserProfile['investment_goal'],
        experience_level: (profile.experience_level ?? 'beginner') as UserProfile['experience_level'],
        market_reaction:  (profile.market_reaction  ?? 'hold')     as UserProfile['market_reaction'],
        financial_status: (profile.financial_status ?? 'stable')   as UserProfile['financial_status'],
        liquidity_need:   (profile.liquidity_need   ?? 'unlikely') as UserProfile['liquidity_need'],
        horizon_years:    plan?.horizon_years ?? 10,
      });
    } catch { return null; }
  })();

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '...';
  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const riskLabel = profile?.risk_profile ? RISK_LABELS[profile.risk_profile] ?? profile.risk_profile : '—';
  const goalLabel = profile?.investment_goal ? GOAL_LABELS[profile.investment_goal] ?? profile.investment_goal : '—';
  const sectorsCount = profile?.preferred_sectors?.length ?? 0;
  const sectorsLabel = sectorsCount > 0
    ? `${sectorsCount} ${sectorsCount === 1 ? 'setor' : 'setores'}`
    : '—';
  const planLabel = plan ? `${plan.amount} €/${FREQ_LABELS[plan.frequency] ?? plan.frequency}` : '—';

  function openRiskSheet() {
    const idx = RISK_OPTIONS.findIndex(o => o.id === profile?.risk_profile);
    setRiskSelected(idx >= 0 ? idx : 1);
    setRiskSheetOpen(true);
  }

  async function saveRisk() {
    if (!user) return;
    setSavingField(true);
    const supabase = createClient();
    const riskId = RISK_OPTIONS[riskSelected].id;
    await supabase.from('profiles').update({ risk_profile: riskId }).eq('id', user.id);
    setProfile(p => p ? { ...p, risk_profile: riskId } : p);
    sessionStorage.removeItem('rec-etag');
    setSavingField(false);
    setRiskSheetOpen(false);
  }

  function openObjectiveSheet() {
    const idx = OBJECTIVE_OPTIONS.findIndex(o => o.id === profile?.investment_goal);
    setObjectiveSelected(idx >= 0 ? idx : 1);
    setObjectiveSheetOpen(true);
  }

  async function saveObjective() {
    if (!user) return;
    setSavingField(true);
    const supabase = createClient();
    const goalId = OBJECTIVE_OPTIONS[objectiveSelected].id;
    await supabase.from('profiles').update({ investment_goal: goalId }).eq('id', user.id);
    setProfile(p => p ? { ...p, investment_goal: goalId } : p);
    sessionStorage.removeItem('rec-etag');
    setSavingField(false);
    setObjectiveSheetOpen(false);
  }

  function openSectorsSheet() {
    setSectorsSelected(new Set(profile?.preferred_sectors ?? []));
    setSectorsSheetOpen(true);
  }

  function toggleSector(id: string) {
    setSectorsSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function saveSectors() {
    if (!user) return;
    setSavingField(true);
    const supabase = createClient();
    const sectors = Array.from(sectorsSelected);
    await supabase.from('profiles').update({ preferred_sectors: sectors }).eq('id', user.id);
    setProfile(p => p ? { ...p, preferred_sectors: sectors } : p);
    sessionStorage.removeItem('rec-etag');
    setSavingField(false);
    setSectorsSheetOpen(false);
  }

  function openPlanSheet() {
    setPlanGoal(plan?.goal_amount != null ? String(plan.goal_amount) : '100000');
    setPlanAmt(plan ? Math.max(0, PLAN_AMOUNT_VALUES.indexOf(plan.amount)) : 1);
    setPlanPeriod(plan ? Math.max(0, PLAN_FREQUENCIES.indexOf(plan.frequency as typeof PLAN_FREQUENCIES[number])) : 1);
    setPlanHorizon(plan ? Math.max(0, PLAN_HORIZON_YEARS.indexOf(plan.horizon_years)) : 2);
    setPlanSheetOpen(true);
  }

  async function savePlan() {
    if (!user) return;
    setSavingField(true);
    const supabase = createClient();
    const amount = PLAN_AMOUNT_VALUES[planAmt];
    const frequency = PLAN_FREQUENCIES[planPeriod];
    const horizon_years = PLAN_HORIZON_YEARS[planHorizon];
    const goal_amount = parseFloat(planGoal) || 0;
    await supabase.from('investment_plans').upsert({
      user_id: user.id, amount, frequency, horizon_years, goal_amount,
    });
    setPlan({ amount, frequency, horizon_years, goal_amount });
    setSavingField(false);
    setPlanSheetOpen(false);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{t.profileTitle}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 100px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 88, height: 88, borderRadius: 'var(--radius-full)', background: 'var(--primary-strong)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>{initials}</div>
            <div onClick={() => router.push('/profile/personal')} style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 'var(--radius-full)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--bg)', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>edit</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{fullName}</div>
            {profile?.user_handle && (
              <div style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>@{profile.user_handle}</div>
            )}
            <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 2 }}>{profile?.investor_since ? `Membro desde ${profile.investor_since}` : ''}</div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>trending_up</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>{t.risk}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{riskLabel}</span>
          </div>
          <div style={{ flex: 1, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--gain)' }}>flag</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>{t.objective}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gain)' }}>{goalLabel}</span>
          </div>
        </div>

        {/* Risk score meter */}
        {planResult && (
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{t.riskScoreLabel}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{planResult.riskScore}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface-variant)' }}>/100</span></span>
            </div>
            {/* Gradient bar */}
            <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'linear-gradient(to right, #22C55E, #F59E0B, #EF4444)', overflow: 'visible' }}>
              <div style={{
                position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
                left: `${planResult.riskScore}%`,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff', border: '3px solid var(--primary)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
              }} />
            </div>
            {/* Labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--on-surface-variant)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span>{t.riskScoreVeryConservative}</span>
              <span>{t.riskScoreVeryAggressive}</span>
            </div>
            {/* Alocação sugerida */}
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>{t.allocationLabel}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { label: 'Ações', value: planResult.allocation.stock, color: 'var(--primary)' },
                  { label: 'ETFs', value: planResult.allocation.etf, color: 'var(--gain)' },
                  { label: 'Obrig.', value: planResult.allocation.bond_etf, color: '#F59E0B' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)', padding: '8px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color }}>{Math.round(value * 100)}%</div>
                    <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Investor profile */}
        <div>
          <SectionLabel label={t.investorProfileSection} />
          <Card>
            <SettingsRow icon="local_fire_department" label={t.riskProfileLabel} value={riskLabel} onPress={openRiskSheet} />
            <SettingsRow icon="schedule" label={t.horizonLabel} value={horizonLabel(plan?.horizon_years)} onPress={openPlanSheet} />
            <SettingsRow icon="target" label={t.objective} value={goalLabel} onPress={openObjectiveSheet} />
            <SettingsRow icon="sell" label={t.sectorsLabel} value={sectorsLabel} onPress={openSectorsSheet} border={false} />
          </Card>
        </div>

        {/* Investment plan */}
        <div>
          <SectionLabel label={t.investmentPlanSection} />
          <Card>
            <SettingsRow icon="account_balance_wallet" label={t.activePlan} value={planLabel} onPress={openPlanSheet} border={false} />
          </Card>
        </div>

        {/* Account */}
        <div>
          <SectionLabel label={t.accountSection} />
          <Card>
            <SettingsRow icon="lock" label={t.security} onPress={() => router.push('/profile/security')} />
            <SettingsRow icon="settings" label={t.settingsLabel} onPress={() => router.push('/profile/settings')} border={false} />
          </Card>
        </div>

        {/* Sign out */}
        <button onClick={signOut} style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, color: 'var(--loss)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.signOut}
        </button>

      </div>

      {riskSheetOpen && (
        <div onClick={() => setRiskSheetOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', overflow: 'auto', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.riskProfileLabel}</span>
              <span onClick={() => setRiskSheetOpen(false)} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>Define quanto risco está disposto a aceitar.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SelectList options={RISK_OPTIONS} selected={riskSelected} onSelect={setRiskSelected} />
            </div>
            <button onClick={saveRisk} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      {objectiveSheetOpen && (
        <div onClick={() => setObjectiveSheetOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', overflow: 'auto', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.objective}</span>
              <span onClick={() => setObjectiveSheetOpen(false)} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>O que procura ao negociar.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SelectList options={OBJECTIVE_OPTIONS} selected={objectiveSelected} onSelect={setObjectiveSelected} />
            </div>
            <button onClick={saveObjective} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      {sectorsSheetOpen && (
        <div onClick={() => setSectorsSheetOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', overflow: 'auto', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.sectorsLabel}</span>
              <span onClick={() => setSectorsSheetOpen(false)} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>Escolha as áreas que quer acompanhar.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {SECTOR_OPTIONS.map(s => {
                const on = sectorsSelected.has(s.id);
                return (
                  <button key={s.id} onClick={() => toggleSector(s.id)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px',
                    background: on ? 'var(--primary-strong)' : 'var(--surface-low)',
                    border: `1px solid ${on ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                    borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all .15s',
                    fontSize: 14, fontWeight: 600, color: on ? '#fff' : 'var(--on-surface)', fontFamily: 'inherit',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: on ? '#fff' : 'var(--on-surface-variant)' }}>{s.icon}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <button onClick={saveSectors} disabled={sectorsSelected.size === 0 || savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: sectorsSelected.size === 0 || savingField ? 0.5 : 1 }}>
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      {planSheetOpen && (
        <div onClick={() => setPlanSheetOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', overflow: 'auto', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.activePlan}</span>
              <span onClick={() => setPlanSheetOpen(false)} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>Podes alterar estes valores em qualquer altura.</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 9 }}>Objetivo financeiro</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 16px' }}>
                <span style={{ fontSize: 18, color: 'var(--outline)' }}>€</span>
                <input value={planGoal} onChange={e => setPlanGoal(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '15px 0', fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 9 }}>Montante por período</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {PLAN_AMOUNTS.map((a, i) => <PlanChip key={i} label={a} on={planAmt === i} onClick={() => setPlanAmt(i)} />)}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 9 }}>Periodicidade</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {PLAN_PERIODS.map((p, i) => <PlanChip key={i} label={p} on={planPeriod === i} onClick={() => setPlanPeriod(i)} />)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 9 }}>Horizonte temporal</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {PLAN_HORIZONS.map((h, i) => <PlanChip key={i} label={h} on={planHorizon === i} onClick={() => setPlanHorizon(i)} />)}
              </div>
            </div>

            <button onClick={savePlan} disabled={savingField} style={{ width: '100%', marginTop: 20, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
