'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { useUser } from '@/lib/hooks/useUser';
import { useProfileData } from '@/lib/hooks/useProfileData';
import BottomNav from '@/components/ui/BottomNav';
import { SelectList } from '@/components/ui/SelectList';
import { PlanEditor } from '@/components/ui/PlanEditor';
import { calcPlan } from '@/lib/planCalculator';
import type { UserProfile, AssetClass } from '@/lib/planCalculator';
import { RISK_OPTIONS, OBJECTIVE_OPTIONS, SECTOR_OPTIONS, EXPERIENCE_OPTIONS, REACTION_OPTIONS, FINANCIAL_OPTIONS, LIQUIDITY_OPTIONS, LIQUIDITY_CRITICAL_WARNING } from '@/lib/profileOptions';

const RISK_LABELS:       Record<string, string> = { very_conservative: 'Muito conservador', conservative: 'Conservador', moderate: 'Moderado', aggressive: 'Agressivo', very_aggressive: 'Muito agressivo' };
const GOAL_LABELS:       Record<string, string> = { emergency_fund: 'Fundo de emergência', short_purchase: 'Compra a curto prazo', income: 'Rendimento passivo', wealth_growth: 'Crescimento', retirement: 'Reforma', legacy: 'Legado' };
const FREQ_LABELS:       Record<string, string> = { weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };
const EXPERIENCE_LABELS: Record<string, string> = { none: 'Nenhuma', beginner: 'Iniciante', intermediate: 'Intermédio', experienced: 'Experiente', professional: 'Profissional' };
const REACTION_LABELS:   Record<string, string> = { sell_all: 'Vendo tudo', sell_some: 'Vendo parte', hold: 'Aguardo', buy_more: 'Compro mais' };
const FINANCIAL_LABELS:  Record<string, string> = { unstable: 'Instável', stable: 'Estável', comfortable: 'Confortável', wealthy: 'Elevada' };
const LIQUIDITY_LABELS:  Record<string, string> = { critical: 'É crítico', possible: 'É possível', unlikely: 'Improvável', never: 'Nunca' };

function horizonLabel(years: number | null | undefined) {
  if (years == null) return '—';
  if (years < 2) return '< 2 anos';
  if (years <= 5) return '2 – 5 anos';
  if (years <= 10) return '5 – 10 anos';
  return '> 10 anos';
}

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

function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '90%', overflow: 'auto', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
        <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: subtitle ? 4 : 18 }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{title}</span>
          <span onClick={onClose} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
        </div>
        {subtitle && <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);
  const { profile, plan, saving: savingField, saveRisk, saveObjective, saveSectors, saveExperience, saveReaction, saveFinancial, saveLiquidity, savePlan, saveHorizonYears } = useProfileData(user?.id);

  const [riskSheetOpen,       setRiskSheetOpen]       = useState(false);
  const [riskSelected,        setRiskSelected]        = useState(1);
  const [objectiveSheetOpen,  setObjectiveSheetOpen]  = useState(false);
  const [objectiveSelected,   setObjectiveSelected]   = useState(1);
  const [sectorsSheetOpen,    setSectorsSheetOpen]    = useState(false);
  const [sectorsSelected,     setSectorsSelected]     = useState<Set<string>>(new Set());
  const [planSheetOpen,       setPlanSheetOpen]       = useState(false);
  const [horizonSheetOpen,    setHorizonSheetOpen]    = useState(false);
  const [horizonYears,        setHorizonYears]        = useState(10);
  const [experienceSheetOpen, setExperienceSheetOpen] = useState(false);
  const [experienceSelected,  setExperienceSelected]  = useState(1);
  const [reactionSheetOpen,   setReactionSheetOpen]   = useState(false);
  const [reactionSelected,    setReactionSelected]    = useState(2);
  const [financialSheetOpen,  setFinancialSheetOpen]  = useState(false);
  const [financialSelected,   setFinancialSelected]   = useState(1);
  const [liquiditySheetOpen,  setLiquiditySheetOpen]  = useState(false);
  const [liquiditySelected,   setLiquiditySelected]   = useState(2);

  const planResult = (() => {
    if (!profile?.risk_profile || !profile?.investment_goal) return null;
    if (!profile?.experience_level || !profile?.market_reaction || !profile?.financial_status || !profile?.liquidity_need) return null;
    try {
      return calcPlan({
        risk_profile:     profile.risk_profile     as UserProfile['risk_profile'],
        investment_goal:  profile.investment_goal   as UserProfile['investment_goal'],
        experience_level: profile.experience_level  as UserProfile['experience_level'],
        market_reaction:  profile.market_reaction   as UserProfile['market_reaction'],
        financial_status: profile.financial_status  as UserProfile['financial_status'],
        liquidity_need:   profile.liquidity_need    as UserProfile['liquidity_need'],
        horizon_years:    plan?.horizon_years ?? 10,
      });
    } catch { return null; }
  })();

  const fullName       = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '...';
  const initials       = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const riskLabel      = profile?.risk_profile      ? RISK_LABELS[profile.risk_profile]           ?? profile.risk_profile      : '—';
  const goalLabel      = profile?.investment_goal   ? GOAL_LABELS[profile.investment_goal]         ?? profile.investment_goal   : '—';
  const experienceLabel = profile?.experience_level ? EXPERIENCE_LABELS[profile.experience_level] ?? profile.experience_level  : '—';
  const reactionLabel  = profile?.market_reaction   ? REACTION_LABELS[profile.market_reaction]    ?? profile.market_reaction   : '—';
  const financialLabel = profile?.financial_status  ? FINANCIAL_LABELS[profile.financial_status]  ?? profile.financial_status  : '—';
  const liquidityLabel = profile?.liquidity_need    ? LIQUIDITY_LABELS[profile.liquidity_need]    ?? profile.liquidity_need    : '—';
  const sectorsCount   = profile?.preferred_sectors?.length ?? 0;
  const sectorsLabel   = sectorsCount > 0 ? `${sectorsCount} ${sectorsCount === 1 ? 'setor' : 'setores'}` : '—';
  const planLabel      = plan ? `${plan.amount} €/${FREQ_LABELS[plan.frequency] ?? plan.frequency}` : '—';

  function openRiskSheet() {
    const idx = RISK_OPTIONS.findIndex(o => o.id === profile?.risk_profile);
    setRiskSelected(idx >= 0 ? idx : 1);
    setRiskSheetOpen(true);
  }
  function openObjectiveSheet() {
    const idx = OBJECTIVE_OPTIONS.findIndex(o => o.id === profile?.investment_goal);
    setObjectiveSelected(idx >= 0 ? idx : 1);
    setObjectiveSheetOpen(true);
  }
  function openSectorsSheet() {
    setSectorsSelected(new Set(profile?.preferred_sectors ?? []));
    setSectorsSheetOpen(true);
  }
  function openHorizonSheet() {
    setHorizonYears(plan?.horizon_years ?? 10);
    setHorizonSheetOpen(true);
  }
  function openExperienceSheet() {
    const idx = EXPERIENCE_OPTIONS.findIndex(o => o.id === profile?.experience_level);
    setExperienceSelected(idx >= 0 ? idx : 1);
    setExperienceSheetOpen(true);
  }
  function openReactionSheet() {
    const idx = REACTION_OPTIONS.findIndex(o => o.id === profile?.market_reaction);
    setReactionSelected(idx >= 0 ? idx : 2);
    setReactionSheetOpen(true);
  }
  function openFinancialSheet() {
    const idx = FINANCIAL_OPTIONS.findIndex(o => o.id === profile?.financial_status);
    setFinancialSelected(idx >= 0 ? idx : 1);
    setFinancialSheetOpen(true);
  }
  function openLiquiditySheet() {
    const idx = LIQUIDITY_OPTIONS.findIndex(o => o.id === profile?.liquidity_need);
    setLiquiditySelected(idx >= 0 ? idx : 2);
    setLiquiditySheetOpen(true);
  }

  function toggleSector(id: string) {
    setSectorsSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  const isLiquidityCritical = LIQUIDITY_OPTIONS[liquiditySelected]?.id === 'critical';

  return (
    <div className="phone-shell" style={{ overflow: 'hidden', position: 'relative' }}>
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
            <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'linear-gradient(to right, #22C55E, #F59E0B, #EF4444)', overflow: 'visible' }}>
              <div style={{ position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', left: `${planResult.riskScore}%`, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: '3px solid var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--on-surface-variant)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span>{t.riskScoreVeryConservative}</span>
              <span>{t.riskScoreVeryAggressive}</span>
            </div>
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
            <SettingsRow icon="schedule" label={t.horizonLabel} value={horizonLabel(plan?.horizon_years)} onPress={openHorizonSheet} />
            <SettingsRow icon="target" label={t.objective} value={goalLabel} onPress={openObjectiveSheet} />
            <SettingsRow icon="sell" label={t.sectorsLabel} value={sectorsLabel} onPress={openSectorsSheet} border={false} />
          </Card>
        </div>

        {/* Behavior & knowledge */}
        <div>
          <SectionLabel label="Conhecimento e comportamento" />
          <Card>
            <SettingsRow icon="school" label="Experiência" value={experienceLabel} onPress={openExperienceSheet} />
            <SettingsRow icon="trending_down" label="Reação a quedas" value={reactionLabel} onPress={openReactionSheet} />
            <SettingsRow icon="savings" label="Situação financeira" value={financialLabel} onPress={openFinancialSheet} />
            <SettingsRow icon="emergency" label="Acesso ao dinheiro" value={liquidityLabel} onPress={openLiquiditySheet} border={false} />
          </Card>
        </div>

        {/* Investment plan */}
        <div>
          <SectionLabel label={t.investmentPlanSection} />
          <Card>
            <SettingsRow icon="account_balance_wallet" label={t.activePlan} value={planLabel} onPress={() => setPlanSheetOpen(true)} border={false} />
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

        <button onClick={signOut} style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, color: 'var(--loss)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.signOut}
        </button>
      </div>

      {/* Risk sheet */}
      <Sheet open={riskSheetOpen} onClose={() => setRiskSheetOpen(false)} title={t.riskProfileLabel} subtitle="Define quanto risco está disposto a aceitar.">
        <SelectList options={RISK_OPTIONS} selected={riskSelected} onSelect={setRiskSelected} />
        <button onClick={() => { saveRisk(riskSelected); setRiskSheetOpen(false); }} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Objective sheet */}
      <Sheet open={objectiveSheetOpen} onClose={() => setObjectiveSheetOpen(false)} title={t.objective} subtitle="O que procura ao negociar.">
        <SelectList options={OBJECTIVE_OPTIONS} selected={objectiveSelected} onSelect={setObjectiveSelected} />
        <button onClick={() => { saveObjective(objectiveSelected); setObjectiveSheetOpen(false); }} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Sectors sheet */}
      <Sheet open={sectorsSheetOpen} onClose={() => setSectorsSheetOpen(false)} title={t.sectorsLabel} subtitle="Escolha as áreas que quer acompanhar.">
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
        <button onClick={() => { saveSectors(sectorsSelected); setSectorsSheetOpen(false); }} disabled={sectorsSelected.size === 0 || savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: sectorsSelected.size === 0 || savingField ? 0.5 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Horizon sheet */}
      <Sheet open={horizonSheetOpen} onClose={() => setHorizonSheetOpen(false)} title={t.horizonLabel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setHorizonYears(y => Math.max(1, y - 1))} style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', background: 'var(--surface-low)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', fontFamily: 'inherit' }}>−</button>
          <span style={{ fontSize: 26, fontWeight: 700, minWidth: 70, textAlign: 'center', letterSpacing: '-0.02em' }}>
            {horizonYears} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--on-surface-variant)' }}>anos</span>
          </span>
          <button onClick={() => setHorizonYears(y => Math.min(50, y + 1))} style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', border: '1px solid var(--card-border)', background: 'var(--surface-low)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', fontFamily: 'inherit' }}>+</button>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[5, 10, 15, 20, 30].map(y => (
              <button key={y} onClick={() => setHorizonYears(y)} style={{
                padding: '5px 10px', borderRadius: 'var(--radius-full)',
                border: `1px solid ${horizonYears === y ? 'var(--primary-strong)' : 'var(--card-border)'}`,
                background: horizonYears === y ? 'var(--primary-container)' : 'var(--surface-low)',
                color: horizonYears === y ? 'var(--primary-strong)' : 'var(--on-surface-variant)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{y}</button>
            ))}
          </div>
        </div>
        <button onClick={() => { saveHorizonYears(horizonYears); setHorizonSheetOpen(false); }} disabled={savingField} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Experience sheet */}
      <Sheet open={experienceSheetOpen} onClose={() => setExperienceSheetOpen(false)} title="Experiência a investir" subtitle="Ajuda a personalizar as tuas recomendações.">
        <SelectList options={EXPERIENCE_OPTIONS} selected={experienceSelected} onSelect={setExperienceSelected} />
        <button onClick={() => { saveExperience(EXPERIENCE_OPTIONS[experienceSelected].id); setExperienceSheetOpen(false); }} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Reaction sheet */}
      <Sheet open={reactionSheetOpen} onClose={() => setReactionSheetOpen(false)} title="Reação a uma queda" subtitle="O mercado cai 20% de repente. O que fazes?">
        <div style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span className="material-symbols-outlined icf" style={{ fontSize: 22, color: 'var(--loss)', flexShrink: 0 }}>trending_down</span>
          <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
            Imagina que investiste <strong>10.000€</strong> e em 2 semanas o teu portfólio vale <strong>8.000€</strong>.
          </span>
        </div>
        <SelectList options={REACTION_OPTIONS} selected={reactionSelected} onSelect={setReactionSelected} />
        <button onClick={() => { saveReaction(REACTION_OPTIONS[reactionSelected].id); setReactionSheetOpen(false); }} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Financial sheet */}
      <Sheet open={financialSheetOpen} onClose={() => setFinancialSheetOpen(false)} title="Situação financeira" subtitle="A tua capacidade de poupança atual.">
        <SelectList options={FINANCIAL_OPTIONS} selected={financialSelected} onSelect={setFinancialSelected} />
        <button onClick={() => { saveFinancial(FINANCIAL_OPTIONS[financialSelected].id); setFinancialSheetOpen(false); }} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {t.confirm}
        </button>
      </Sheet>

      {/* Liquidity sheet */}
      <Sheet open={liquiditySheetOpen} onClose={() => setLiquiditySheetOpen(false)} title="Acesso ao dinheiro" subtitle="E se precisares do dinheiro antes do prazo?">
        <SelectList options={LIQUIDITY_OPTIONS} selected={liquiditySelected} onSelect={setLiquiditySelected} />
        {isLiquidityCritical && (
          <div style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: 'var(--loss)', flexShrink: 0, marginTop: 1 }}>info</span>
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{LIQUIDITY_CRITICAL_WARNING}</span>
          </div>
        )}
        <button onClick={() => { saveLiquidity(LIQUIDITY_OPTIONS[liquiditySelected].id); setLiquiditySheetOpen(false); }} disabled={savingField} style={{ width: '100%', marginTop: 18, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingField ? 0.7 : 1 }}>
          {isLiquidityCritical ? 'Confirmar mesmo assim' : t.confirm}
        </button>
      </Sheet>

      {/* Plan sheet */}
      <Sheet open={planSheetOpen} onClose={() => setPlanSheetOpen(false)} title={t.activePlan} subtitle="Podes alterar estes valores em qualquer altura.">
        <PlanEditor
          profile={profile ? {
            risk_profile:     (profile.risk_profile     ?? 'moderate')   as UserProfile['risk_profile'],
            investment_goal:  (profile.investment_goal  ?? 'wealth_growth') as UserProfile['investment_goal'],
            experience_level: (profile.experience_level ?? 'beginner')   as UserProfile['experience_level'],
            market_reaction:  (profile.market_reaction  ?? 'hold')       as UserProfile['market_reaction'],
            financial_status: (profile.financial_status ?? 'stable')     as UserProfile['financial_status'],
            liquidity_need:   (profile.liquidity_need   ?? 'unlikely')   as UserProfile['liquidity_need'],
            horizon_years:    plan?.horizon_years ?? 10,
          } : null}
          initialAmount={plan?.amount}
          initialFrequency={plan?.frequency}
          initialYears={plan?.horizon_years}
          initialGoal={plan?.goal_amount ?? undefined}
          initialClasses={plan?.preferred_asset_classes as AssetClass[] | undefined}
          onSave={result => { savePlan(result); setPlanSheetOpen(false); }}
          saveLabel={t.confirm}
          saving={savingField}
        />
      </Sheet>

      <BottomNav />
    </div>
  );
}
