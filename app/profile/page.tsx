'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';
import Switch from '@/components/ui/Switch';
import TradeDateDialog from '@/components/ui/TradeDateDialog';

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
type ParsedTransaction = {
  external_id: string;
  ticker: string;
  type: 'buy' | 'sell' | 'dividend';
  units?: number;
  price?: number;
  amount: number;
  executed_at: string;
};
type ParseResult = { holdings: ParsedHolding[]; transactions: ParsedTransaction[] };

// Excel serial date → ISO string
function xlDateToIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
}

function rowsToHoldings(header: string[], rows: string[][]): ParsedHolding[] {
  const h = header.map(c => c.toLowerCase().trim());
  const tickerIdx = h.indexOf('ticker');
  const unitsIdx = h.indexOf('units');
  const priceIdx = h.findIndex(c => c === 'avg_price' || c === 'price');
  const nameIdx = h.indexOf('name');
  if (tickerIdx === -1 || unitsIdx === -1 || priceIdx === -1) throw new Error('missing columns');
  return rows.map(cols => {
    const ticker = String(cols[tickerIdx] ?? '').trim().toUpperCase();
    const units = parseFloat(String(cols[unitsIdx]).replace(',', '.'));
    const avg_price = parseFloat(String(cols[priceIdx]).replace(',', '.'));
    if (!ticker || Number.isNaN(units) || Number.isNaN(avg_price)) throw new Error('bad row');
    return { ticker, units, avg_price, name: nameIdx >= 0 ? String(cols[nameIdx] ?? '').trim() || undefined : undefined };
  });
}

function parseHoldingsCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('empty');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map(l => l.split(','));
  return { holdings: rowsToHoldings(header, rows), transactions: [] };
}

async function parseXlsxFile(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });

  // ── XTB format detection ──────────────────────────────────────────
  const cashSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CASH OPERATION'));
  if (cashSheet) {
    const ws = wb.Sheets[cashSheet];
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
    const headerIdx = data.findIndex(row => String(row[0]).trim() === 'ID' && String(row[1]).trim() === 'Type');
    if (headerIdx === -1) throw new Error('xtb_no_header');

    const holdingsMap = new Map<string, { units: number; totalCost: number }>();
    const transactions: ParsedTransaction[] = [];

    for (const row of data.slice(headerIdx + 1)) {
      const extId = String(row[0] ?? '').trim();
      const type = String(row[1] ?? '');
      const timeSer = typeof row[2] === 'number' ? row[2] : null;
      const comment = String(row[3] ?? '');
      const symbol = String(row[4] ?? '').trim();
      const amount = typeof row[5] === 'number' ? row[5] : 0;
      if (!extId || !type) continue;

      const typeLow = type.toLowerCase();
      const executedAt = timeSer ? xlDateToIso(timeSer) : new Date().toISOString();

      if (typeLow.includes('stock')) {
        const volumeMatch = comment.match(/OPEN (?:BUY|SELL) ([0-9.]+)/);
        const priceMatch = comment.match(/@ ([0-9.]+)/);
        if (!volumeMatch || !priceMatch || !symbol) continue;
        const volume = parseFloat(volumeMatch[1]);
        const price = parseFloat(priceMatch[1]);
        if (isNaN(volume) || isNaN(price)) continue;
        const isSale = typeLow.includes('sale') || typeLow.includes('sell');
        const txType = isSale ? 'sell' : 'buy';

        // Update holdings map
        const h = holdingsMap.get(symbol) ?? { units: 0, totalCost: 0 };
        if (isSale) { h.units -= volume; }
        else { h.units += volume; h.totalCost += volume * price; }
        holdingsMap.set(symbol, h);

        transactions.push({
          external_id: `xtb_${extId}`,
          ticker: symbol,
          type: txType,
          units: volume,
          price,
          amount: Math.abs(amount),
          executed_at: executedAt,
        });
      } else if (typeLow === 'divident' || typeLow === 'dividend') {
        if (!symbol || amount === 0) continue;
        // Only import positive dividends (skip correction entries)
        if (amount < 0) continue;
        transactions.push({
          external_id: `xtb_${extId}`,
          ticker: symbol,
          type: 'dividend',
          amount,
          executed_at: executedAt,
        });
      }
    }

    const holdings = Array.from(holdingsMap.entries())
      .filter(([, h]) => h.units > 0.0001)
      .map(([ticker, h]) => ({
        ticker,
        units: Math.round(h.units * 10000) / 10000,
        avg_price: Math.round((h.totalCost / h.units) * 100) / 100,
      }));

    return { holdings, transactions };
  }

  // ── Generic format ────────────────────────────────────────────────
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
  if (data.length < 2) throw new Error('empty');
  const holdings = rowsToHoldings(data[0], data.slice(1).filter(r => r.some(c => c != null && c !== '')));
  return { holdings, transactions: [] };
}

async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') return parseXlsxFile(await file.arrayBuffer());
  const text = await file.text();
  return parseHoldingsCsv(text);
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
  const [importToast, setImportToast] = useState<{ holdings: number; transactions: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [exportPeriodOpen, setExportPeriodOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<'allTime' | 'thisYear' | 'last12' | 'custom'>('allTime');
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [exportRangeTarget, setExportRangeTarget] = useState<'start' | 'end' | null>(null);
  const [exportToast, setExportToast] = useState(false);

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
      const { holdings, transactions } = await parseFile(importFile);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      // Upsert holdings (positions)
      if (holdings.length > 0) {
        await supabase.from('holdings').upsert(
          holdings.map(r => ({ user_id: user.id, ticker: r.ticker, units: r.units, avg_price: r.avg_price, name: r.name })),
          { onConflict: 'user_id,ticker' }
        );
      }

      // Insert transactions — skip duplicates via external_id unique index
      let importedTxns = 0;
      if (transactions.length > 0) {
        const rows = transactions.map(tx => ({
          user_id: user.id,
          external_id: tx.external_id,
          ticker: tx.ticker,
          type: tx.type,
          units: tx.units ?? null,
          price: tx.price ?? null,
          amount: tx.amount,
          executed_at: tx.executed_at,
        }));
        const { data: inserted } = await supabase
          .from('transactions')
          .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
          .select('id');
        importedTxns = inserted?.length ?? 0;
      }

      setImporting(false);
      closeImport();
      setImportToast({ holdings: holdings.length, transactions: importedTxns });
      setTimeout(() => setImportToast(null), 4000);
    } catch {
      setImporting(false);
      setImportError(t.impParseError);
    }
  }

  const PERIODS = [
    { id: 'allTime' as const, label: t.periodAllTime },
    { id: 'thisYear' as const, label: t.periodThisYear },
    { id: 'last12' as const, label: t.periodLast12 },
    { id: 'custom' as const, label: t.periodCustom },
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
    setExportToast(true);
    setTimeout(() => setExportToast(false), 3000);
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
            <SettingsRow icon="file_save" label={t.exportData} onPress={() => setExportOpen(true)} />
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
              <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportError(''); }} style={{ display: 'none' }} />
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

            {exportPeriod === 'custom' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.exportStartLabel}</div>
                  <div onClick={() => setExportRangeTarget('start')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 10px', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)', flex: 'none' }}>calendar_month</span>
                    <span style={{ flex: 1, minWidth: 0, padding: '12px 0', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: exportStart ? 'var(--on-surface)' : 'var(--outline)' }}>
                      {exportStart ? new Date(exportStart).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB') : t.regDobPh}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.exportEndLabel}</div>
                  <div onClick={() => setExportRangeTarget('end')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '0 10px', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)', flex: 'none' }}>calendar_month</span>
                    <span style={{ flex: 1, minWidth: 0, padding: '12px 0', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: exportEnd ? 'var(--on-surface)' : 'var(--outline)' }}>
                      {exportEnd ? new Date(exportEnd).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB') : t.regDobPh}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button onClick={downloadExport} style={{ width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 21 }}>download</span>{t.download}
            </button>
          </div>
        </div>
      )}

      {exportRangeTarget && (
        <TradeDateDialog
          value={exportRangeTarget === 'start' ? exportStart : exportEnd}
          lang={lang}
          confirmLabel={t.confirm}
          onClose={() => setExportRangeTarget(null)}
          onConfirm={iso => {
            if (exportRangeTarget === 'start') setExportStart(iso); else setExportEnd(iso);
            setExportRangeTarget(null);
          }}
        />
      )}

      {importToast && (
        <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--inverse-surface)', borderRadius: 'var(--radius-md)', padding: '13px 16px', boxShadow: 'var(--shadow)', zIndex: 110 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--gain-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: '#fff' }}>check</span>
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--inverse-on-surface)' }}>{t.impToastTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--inverse-on-surface)', opacity: 0.7 }}>
              {importToast.holdings} {lang === 'pt' ? 'posições' : 'positions'} · {importToast.transactions} {lang === 'pt' ? 'transações importadas' : 'transactions imported'}
            </div>
          </div>
        </div>
      )}

      {exportToast && (
        <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--inverse-surface)', borderRadius: 'var(--radius-md)', padding: '13px 16px', boxShadow: 'var(--shadow)', zIndex: 110 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--gain-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: '#fff' }}>file_save</span>
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--inverse-on-surface)' }}>{t.exportToastTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--inverse-on-surface)', opacity: 0.7 }}>{t.exportToastSub}</div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
