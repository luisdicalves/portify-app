'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';
import { createClient } from '@/lib/supabase/client';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="section-header">{title}</div>
      <div style={{ background: 'var(--surface-lowest)', borderRadius: 'var(--radius-xl)', margin: '0 20px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, value, arrow = true, danger = false, onClick }: {
  icon: string; label: string; value?: string; arrow?: boolean; danger?: boolean; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className="list-row" style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: danger ? 'var(--loss-container)' : 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: danger ? 'var(--loss)' : 'var(--on-surface-variant)' }}>{icon}</span>
      </div>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: danger ? 'var(--loss)' : 'var(--on-surface)' }}>{label}</span>
      {value && <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{value}</span>}
      {arrow && <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline-variant)' }}>chevron_right</span>}
    </div>
  );
}

export default function ProfilePage() {
  const { lang, theme, toggleTheme, setLang } = useApp();
  const t = useDict(lang);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  return (
    <div className="phone-shell">
      {/* Header */}
      <div className="top-bar">
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)' }}>
          {lang === 'pt' ? 'Perfil' : 'Profile'}
        </div>
      </div>

      <div className="screen-content">
        {/* Avatar + info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 8px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: 'var(--primary-strong)', marginBottom: 12 }}>R</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Ricardo Ferreira</div>
          <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 2 }}>@ricardoferreira</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <span style={{ background: 'var(--primary-container)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-full)' }}>
              {lang === 'pt' ? 'Conservador' : 'Conservative'}
            </span>
            <span style={{ background: 'var(--surface-high)', color: 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-full)' }}>
              {t.investorSince}
            </span>
          </div>
        </div>

        {/* Account */}
        <Section title={lang === 'pt' ? 'Conta' : 'Account'}>
          <Row icon="person" label={t.personalData} />
          <Row icon="donut_small" label={lang === 'pt' ? 'Perfil de Investidor' : 'Investor Profile'} value={lang === 'pt' ? 'Conservador' : 'Conservative'} />
          <Row icon="trending_up" label={t.investmentPlan} value="€ 100 · Semanal" />
        </Section>

        {/* Preferences */}
        <Section title={t.preferences}>
          <div className="list-row" style={{ cursor: 'pointer' }} onClick={toggleTheme}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{t.darkTheme}</span>
            <div style={{ width: 48, height: 28, borderRadius: 'var(--radius-full)', background: theme === 'dark' ? 'var(--primary-strong)' : 'var(--surface-highest)', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transform: theme === 'dark' ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
            </div>
          </div>
          <div className="list-row" style={{ cursor: 'pointer' }} onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>language</span>
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{t.language}</span>
            <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{t.langValue}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline-variant)' }}>chevron_right</span>
          </div>
          <Row icon="currency_exchange" label={t.currency} value="EUR €" />
        </Section>

        {/* Data */}
        <Section title={t.dataManagement}>
          <Row icon="upload_file" label={t.importPortfolio} value={lang === 'pt' ? 'CSV, XLSX' : 'CSV, XLSX'} />
          <Row icon="download" label={t.exportReport} value={lang === 'pt' ? 'PDF anual' : 'Annual PDF'} />
        </Section>

        {/* Security */}
        <Section title={lang === 'pt' ? 'Segurança' : 'Security'}>
          <Row icon="pin" label={lang === 'pt' ? 'Alterar PIN' : 'Change PIN'} onClick={() => router.push('/auth/pin')} />
          <Row icon="lock" label={lang === 'pt' ? 'Alterar palavra-passe' : 'Change password'} />
          <Row icon="security" label={lang === 'pt' ? 'Autenticação 2 fatores' : '2-factor auth'} value={lang === 'pt' ? 'Ativo' : 'Active'} />
        </Section>

        {/* Sign out */}
        <div style={{ margin: '16px 20px 0' }}>
          <button onClick={handleSignOut} style={{ width: '100%', padding: '16px', background: 'var(--loss-container)', color: 'var(--loss)', border: 'none', borderRadius: 'var(--radius-lg)', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
            {t.signOut}
          </button>
        </div>

        <div style={{ height: 24 }} />
      </div>

      <BottomNav />
    </div>
  );
}
