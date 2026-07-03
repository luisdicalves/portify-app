'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import Switch from '@/components/ui/Switch';
import TradeDateDialog from '@/components/ui/TradeDateDialog';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { parseFile } from '@/lib/holdingsImport';

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

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme, lang, setLang } = useApp();
  const t = useDict(lang);

  const [priceAlerts, setPriceAlerts] = useState(true);
  const [marketNews, setMarketNews] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteToast, setDeleteToast] = useState(false);

  async function deleteAccount() {
    if (deleteConfirmText !== t.deleteAccountConfirmWord) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) throw new Error('delete_failed');
      setDeleteOpen(false);
      setDeleteToast(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      setTimeout(() => router.push('/'), 1500);
    } catch {
      setDeleting(false);
      setDeleteError(t.deleteAccountError);
    }
  }

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
          ticker: tx.ticker ?? null,
          type: tx.type,
          units: tx.units ?? null,
          price: tx.price ?? null,
          amount: tx.amount,
          executed_at: tx.executed_at,
          notes: tx.notes ?? null,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t.settingsLabel}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

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

        {/* Notifications */}
        <div>
          <SectionLabel label={t.notificationsSection} />
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid var(--hairline)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>price_change</span>
                {t.notifPriceAlerts}
              </span>
              <Switch checked={priceAlerts} onChange={() => setPriceAlerts(v => !v)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid var(--hairline)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>newspaper</span>
                {t.notifMarketNews}
              </span>
              <Switch checked={marketNews} onChange={() => setMarketNews(v => !v)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>calendar_view_week</span>
                {t.notifWeeklySummary}
              </span>
              <Switch checked={weeklySummary} onChange={() => setWeeklySummary(v => !v)} />
            </div>
          </Card>
        </div>

        {/* Danger zone */}
        <div>
          <SectionLabel label={t.dangerZoneSection} />
          <Card>
            <div onClick={() => setDeleteOpen(true)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600, color: 'var(--loss)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--loss)' }}>delete_forever</span>
                {t.deleteAccount}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>chevron_right</span>
            </div>
          </Card>
        </div>

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
              <input type="file" accept=".csv,.xlsx" onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportError(''); }} style={{ display: 'none' }} />
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
              {importToast.holdings} {t.positionsUnit} · {importToast.transactions} {t.transactionsImportedUnit}
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

      {deleteToast && (
        <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--inverse-surface)', borderRadius: 'var(--radius-md)', padding: '13px 16px', boxShadow: 'var(--shadow)', zIndex: 110 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--gain-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: '#fff' }}>check</span>
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--inverse-on-surface)' }}>{t.deleteAccountToastTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--inverse-on-surface)', opacity: 0.7 }}>{t.deleteAccountToastSub}</div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div onClick={() => !deleting && setDeleteOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--loss)' }}>{t.deleteAccountTitle}</span>
              <span onClick={() => !deleting && setDeleteOpen(false)} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>close</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 18 }}>{t.deleteAccountWarning}</div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 8 }}>{t.deleteAccountConfirmLabel}</div>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={t.deleteAccountConfirmPh}
                style={{ width: '100%', background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', fontSize: 15, fontWeight: 600, color: 'var(--on-surface)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {deleteError && (
              <div style={{ fontSize: 13, color: 'var(--loss)', marginBottom: 12 }}>{deleteError}</div>
            )}

            <button
              onClick={deleteAccount}
              disabled={deleteConfirmText !== t.deleteAccountConfirmWord || deleting}
              style={{
                width: '100%', background: 'var(--loss)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                opacity: deleteConfirmText !== t.deleteAccountConfirmWord || deleting ? 0.5 : 1,
              }}
            >
              {deleting ? t.deleteAccountDeleting : t.deleteAccountButton}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
