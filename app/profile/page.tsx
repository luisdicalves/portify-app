'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';
import Switch from '@/components/ui/Switch';

const RISK_LABELS: Record<string, string> = { conservative: 'Conservador', moderate: 'Moderado', aggressive: 'Agressivo' };
const GOAL_LABELS: Record<string, string> = { short: 'Curto prazo', long: 'Longo prazo', income: 'Rendimento', retirement: 'Reforma' };
const SECTOR_LABELS: Record<string, string> = {
  tech: 'Tecnologia', health: 'Saúde', finance: 'Finanças', energy: 'Energia',
  consumer: 'Consumo', industry: 'Indústria', realestate: 'Imobiliário', materials: 'Materiais', comms: 'Comunicações',
};
const FREQ_LABELS: Record<string, string> = { weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };

function horizonLabel(years: number | null | undefined) {
  if (years == null) return '—';
  if (years < 2) return '< 2 anos';
  if (years <= 5) return '2 – 5 anos';
  if (years <= 10) return '5 – 10 anos';
  return '> 10 anos';
}

type Profile = {
  first_name: string | null;
  last_name: string | null;
  risk_profile: string | null;
  investment_goal: string | null;
  preferred_sectors: string[] | null;
  investor_since: number | null;
};

type Plan = {
  amount: number;
  frequency: string;
  horizon_years: number;
};

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
  const { theme, toggleTheme, lang, setLang } = useApp();
  const t = useDict(lang);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: p }, { data: pl }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name, risk_profile, investment_goal, preferred_sectors, investor_since').eq('id', user.id).single(),
        supabase.from('investment_plans').select('amount, frequency, horizon_years').eq('user_id', user.id).maybeSingle(),
      ]);
      if (p) setProfile(p);
      if (pl) setPlan(pl);
    })();
  }, []);

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '...';
  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const riskLabel = profile?.risk_profile ? RISK_LABELS[profile.risk_profile] ?? profile.risk_profile : '—';
  const goalLabel = profile?.investment_goal ? GOAL_LABELS[profile.investment_goal] ?? profile.investment_goal : '—';
  const sectorsLabel = profile?.preferred_sectors?.length
    ? profile.preferred_sectors.map(s => SECTOR_LABELS[s] ?? s).join(', ')
    : '—';
  const planLabel = plan ? `${plan.amount} €/${FREQ_LABELS[plan.frequency] ?? plan.frequency}` : '—';

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{t.profileTitle}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 100px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 88, height: 88, borderRadius: 'var(--radius-full)', background: 'var(--primary-strong)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>{initials}</div>
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 'var(--radius-full)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--bg)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>edit</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{fullName}</div>
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

        {/* Personal data */}
        <Card>
          <SettingsRow icon="manage_accounts" label={t.personalData} onPress={() => router.push('/profile/personal')} border={false} />
        </Card>

        {/* Investor profile */}
        <div>
          <SectionLabel label={t.investorProfileSection} />
          <Card>
            <SettingsRow icon="local_fire_department" label={t.riskProfileLabel} value={riskLabel} onPress={() => router.push('/auth/risk')} />
            <SettingsRow icon="schedule" label={t.horizonLabel} value={horizonLabel(plan?.horizon_years)} onPress={() => router.push('/auth/plan-set')} />
            <SettingsRow icon="target" label={t.objective} value={goalLabel} onPress={() => router.push('/auth/objective')} />
            <SettingsRow icon="sell" label={t.sectorsLabel} value={sectorsLabel} onPress={() => router.push('/auth/sectors')} border={false} />
          </Card>
        </div>

        {/* Investment plan */}
        <div>
          <SectionLabel label={t.investmentPlanSection} />
          <Card>
            <SettingsRow icon="account_balance_wallet" label={t.activePlan} value={planLabel} onPress={() => router.push('/auth/plan-set')} border={false} />
          </Card>
        </div>

        {/* Preferences */}
        <div>
          <SectionLabel label={t.preferences} />
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid var(--hairline)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>dark_mode</span>
                {t.darkTheme}
              </span>
              <Switch checked={theme === 'dark'} onChange={toggleTheme} />
            </div>
            <SettingsRow
              icon="language"
              label={t.language}
              value={t.langValue}
              onPress={() => setLang(lang === 'pt' ? 'en' : 'pt')}
            />
            <SettingsRow icon="euro" label={t.currency} value="EUR (€)" border={false} />
          </Card>
        </div>

        {/* Import / Export */}
        <div>
          <SectionLabel label={t.portfolioSection} />
          <Card>
            <SettingsRow icon="description" label={t.importCsv} value={t.importAction} onPress={() => {}} />
            <SettingsRow icon="upload_file" label={t.exportData} onPress={() => router.push('/profile/export')} />
            <SettingsRow icon="link" label={t.linkBroker} border={false} />
          </Card>
        </div>

        {/* Account */}
        <div>
          <SectionLabel label={t.accountSection} />
          <Card>
            <SettingsRow icon="lock" label={t.security} onPress={() => router.push('/profile/security')} />
            <SettingsRow icon="settings" label={t.settingsLabel} onPress={() => {}} border={false} />
          </Card>
        </div>

        {/* Sign out */}
        <button onClick={signOut} style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, color: 'var(--loss)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.signOut}
        </button>

      </div>

      <BottomNav />
    </div>
  );
}
