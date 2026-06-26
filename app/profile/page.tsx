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
  user_handle: string | null;
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

type ParsedHolding = { ticker: string; units: number; avg_price: number; name?: string };

function parseHoldingsCsv(text: string): ParsedHolding[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('empty');

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const tickerIdx = header.indexOf('ticker');
  const unitsIdx = header.indexOf('units');
  const priceIdx = header.findIndex(h => h === 'avg_price' || h === 'price');
  const nameIdx = header.indexOf('name');
  if (tickerIdx === -1 || unitsIdx === -1 || priceIdx === -1) throw new Error('missing columns');

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const ticker = cols[tickerIdx]?.toUpperCase();
    const units = parseFloat(cols[unitsIdx]);
    const avg_price = parseFloat(cols[priceIdx]);
    if (!ticker || Number.isNaN(units) || Number.isNaN(avg_price)) throw new Error('bad row');
    return { ticker, units, avg_price, name: nameIdx >= 0 ? cols[nameIdx] : undefined };
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, toggleTheme, lang, setLang } = useApp();
  const t = useDict(lang);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importToast, setImportToast] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [exportPeriodOpen, setExportPeriodOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<'allTime' | 'thisMonth' | 'thisYear' | 'last12'>('allTime');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: p }, { data: pl }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name, user_handle, risk_profile, investment_goal, preferred_sectors, investor_since').eq('id', user.id).single(),
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

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportError('');
  }

  async function submitImport() {
    if (!importFile) { setImportError(t.impNoFile); return; }
    setImportError('');
    setImporting(true);
    try {
      const text = await importFile.text();
      const rows = parseHoldingsCsv(text);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      await supabase.from('holdings').upsert(
        rows.map(r => ({ user_id: user.id, ticker: r.ticker, units: r.units, avg_price: r.avg_price, name: r.name })),
        { onConflict: 'user_id,ticker' }
      );
      setImporting(false);
      closeImport();
      setImportToast(true);
      setTimeout(() => setImportToast(false), 3000);
    } catch {
      setImporting(false);
      setImportError(t.impParseError);
    }
  }

  const PERIODS = [
    { id: 'allTime' as const, label: t.periodAllTime },
    { id: 'thisMonth' as const, label: t.periodThisMonth },
    { id: 'thisYear' as const, label: t.periodThisYear },
    { id: 'last12' as const, label: t.periodLast12 },
  ];

  async function downloadExport() {
    if (exportFormat === 'csv') {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: holdings } = await supabase.from('holdings').select('ticker, units, avg_price').eq('user_id', user.id);
      const rows = [['ticker', 'units', 'avg_price'], ...(holdings ?? []).map(h => [h.ticker, String(h.units), String(h.avg_price)])];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'portify-portfolio.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
    setExportOpen(false);
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
            <SettingsRow icon="upload_file" label={t.importCsv} value={t.importAction} onPress={() => setImportOpen(true)} />
            <SettingsRow icon="upload_file" label={t.exportData} onPress={() => setExportOpen(true)} />
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

      {importOpen && (
        <div onClick={closeImport} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.impTitle}</span>
              <span onClick={closeImport} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>{t.impSub}</div>

            <label style={{ border: '2px dashed var(--outline-variant)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-low)', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', cursor: 'pointer' }}>
              <input type="file" accept=".csv,text/csv" onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportError(''); }} style={{ display: 'none' }} />
              <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-full)', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--primary)' }}>upload_file</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{importFile ? importFile.name : t.impDrop}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{t.impDropHint}</div>
            </label>

            {importError && (
              <div style={{ fontSize: 13, color: 'var(--loss)', marginTop: 12 }}>{importError}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={closeImport} disabled={importing} style={{ flex: 1, background: 'transparent', color: 'var(--on-surface)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t.impCancel}
              </button>
              <button onClick={submitImport} disabled={importing} style={{ flex: 1, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: importing ? 0.7 : 1 }}>
                {importing ? t.impImporting : t.impConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div onClick={() => setExportOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.exportTitle}</span>
              <span onClick={() => setExportOpen(false)} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>{t.exportDesc}</div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 8 }}>{t.format}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setExportFormat('csv')} style={{
                  flex: 1, border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: exportFormat === 'csv' ? 'var(--primary-strong)' : 'var(--surface-high)', color: exportFormat === 'csv' ? '#fff' : 'var(--on-surface)',
                }}>{t.exportCsv}</button>
                <button onClick={() => setExportFormat('pdf')} style={{
                  flex: 1, border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: exportFormat === 'pdf' ? 'var(--primary-strong)' : 'var(--surface-high)', color: exportFormat === 'pdf' ? '#fff' : 'var(--on-surface)',
                }}>{t.exportPdf}</button>
              </div>
            </div>

            <div onClick={() => setExportPeriodOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)', marginBottom: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{t.period}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600 }}>
                {PERIODS.find(p => p.id === exportPeriod)?.label}
                <span className="material-symbols-outlined" style={{ fontSize: 20, transition: 'transform .2s', transform: exportPeriodOpen ? 'rotate(180deg)' : 'none' }}>expand_more</span>
              </span>
            </div>

            {exportPeriodOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {PERIODS.map(p => (
                  <button key={p.id} onClick={() => { setExportPeriod(p.id); setExportPeriodOpen(false); }} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-low)', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span>{p.label}</span>
                    {exportPeriod === p.id && <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--primary)' }}>check</span>}
                  </button>
                ))}
              </div>
            )}

            <button onClick={downloadExport} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 21 }}>download</span>{t.download}
            </button>
          </div>
        </div>
      )}

      {importToast && (
        <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--inverse-surface)', borderRadius: 'var(--radius-md)', padding: '13px 16px', boxShadow: 'var(--shadow)', zIndex: 110 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--gain-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: '#fff' }}>check</span>
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--inverse-on-surface)' }}>{t.impToastTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--inverse-on-surface)', opacity: 0.7 }}>{t.impToastSub}</div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
