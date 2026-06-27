'use client';

import { useState } from 'react';
import type { RiskReport as RiskReportData } from '@/lib/riskScore';

const GREEN = '#00ff88';
const BLUE = '#00aaff';
const RED = '#ff4d4d';
const YELLOW = '#ffd54a';
const BG = '#0d0d0f';

const TAG_COLOR: Record<string, string> = { LOCK: BLUE, FLEX: YELLOW, WATCH: RED };

function scoreColor(score: number) {
  if (score >= 70) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

function AsciiBar({ pct, color }: { pct: number; color: string }) {
  const total = 20;
  const filled = Math.round((pct / 100) * total);
  return (
    <span style={{ color, letterSpacing: -1 }}>
      {'█'.repeat(Math.max(0, filled))}{'░'.repeat(Math.max(0, total - filled))}
    </span>
  );
}

const LABELS = {
  pt: { score: 'SCORE GLOBAL', breakdown: 'BREAKDOWN DO SCORE', chart: 'RECEITA & EBITDA (5 TRIM.)', exec: 'ANÁLISE EXECUTIVA', risks: 'RISCOS CRÍTICOS', catalysts: 'CATALISADORES', action: 'GUIA DE AÇÃO', aggressive: 'Entrada agressiva', conservative: 'Entrada conservadora', current: 'Preço atual', trim: 'Trim', stop: 'Stop', beta: 'Beta', savings: 'Plano automático', lump: 'Lote único', plainEnglish: '💡 PLAIN ENGLISH' },
  en: { score: 'OVERALL SCORE', breakdown: 'SCORE BREAKDOWN', chart: 'REVENUE & EBITDA (5 QTRS)', exec: 'EXECUTIVE ANALYSIS', risks: 'CRITICAL RISKS', catalysts: 'CATALYSTS', action: 'ACTION GUIDE', aggressive: 'Aggressive entry', conservative: 'Conservative entry', current: 'Current price', trim: 'Trim', stop: 'Stop', beta: 'Beta', savings: 'Auto plan', lump: 'Lump sum', plainEnglish: '💡 PLAIN ENGLISH' },
};

function PillarBlock({ name, pillar, lang }: { name: string; pillar: RiskReportData['pillars']['valuation']; lang: 'pt' | 'en' }) {
  const [open, setOpen] = useState(false);
  const t = LABELS[lang];
  const color = scoreColor(pillar.score);
  return (
    <div style={{ border: '1px solid #1f1f24', borderRadius: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#8a8a92', fontSize: 11, letterSpacing: 1 }}>{name.toUpperCase()} · {pillar.weight}%</span>
          <span style={{ color, fontWeight: 700 }}>{pillar.score}/100 {open ? '▲' : '▼'}</span>
        </div>
        <AsciiBar pct={pillar.score} color={color} />
        <div style={{ color: '#e4e4e7', fontSize: 13 }}>{pillar.verdict}</div>
      </div>
      {open && (
        <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: '#a0a0a8', fontSize: 12, lineHeight: 1.5 }}>{pillar.description}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pillar.metrics.map(mt => (
              <div key={mt.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid #1a1a1e', padding: '4px 0' }}>
                <span style={{ color: '#8a8a92' }}>
                  <span style={{ color: TAG_COLOR[mt.tag], marginRight: 6 }}>[{mt.tag}]</span>{mt.label}
                </span>
                <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{mt.value}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#15151a', borderRadius: 4, padding: 10, fontSize: 12, color: '#c5c5cc', lineHeight: 1.5 }}>
            <div style={{ color: GREEN, marginBottom: 4, fontSize: 11 }}>{t.plainEnglish}</div>
            {pillar.plainEnglish}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RiskReport({ report, price, lang }: { report: RiskReportData; price: number; lang: 'pt' | 'en' }) {
  const t = LABELS[lang];
  const color = scoreColor(report.score);
  const eur = new Intl.NumberFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const maxAbs = Math.max(1, ...report.chart.flatMap(c => [Math.abs(c.revenue), Math.abs(c.ebitda)]));

  return (
    <div style={{ background: BG, borderRadius: 'var(--radius-lg)', padding: 16, fontFamily: "'SF Mono', 'Roboto Mono', monospace", display: 'flex', flexDirection: 'column', gap: 16, color: '#e4e4e7' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: BLUE, fontWeight: 700, fontSize: 16 }}>{report.ticker}</span>
          <span style={{ color: '#8a8a92', fontSize: 11 }}>{report.sector}</span>
        </div>
        <div style={{ fontSize: 13, color: '#a0a0a8' }}>{report.companyName}</div>
        <div style={{ fontSize: 11, color: '#5f5f68', marginTop: 4 }}>{report.tagline}</div>
      </div>

      {/* Score global */}
      <div>
        <div style={{ fontSize: 11, color: '#8a8a92', letterSpacing: 1, marginBottom: 6 }}>{t.score}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color }}>{report.score}</span>
          <span style={{ fontSize: 13, color }}>/100</span>
        </div>
        <div style={{ marginTop: 6 }}><AsciiBar pct={report.score} color={color} /></div>
      </div>

      {/* Pilares */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PillarBlock name="Valuation" pillar={report.pillars.valuation} lang={lang} />
        <PillarBlock name={lang === 'pt' ? 'Saúde Financeira' : 'Financial Health'} pillar={report.pillars.health} lang={lang} />
        <PillarBlock name={lang === 'pt' ? 'Crescimento' : 'Growth'} pillar={report.pillars.growth} lang={lang} />
      </div>

      {/* Gráfico trimestral */}
      {report.chart.length > 1 && (
        <div>
          <div style={{ fontSize: 11, color: '#8a8a92', letterSpacing: 1, marginBottom: 8 }}>{t.chart}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 70 }}>
            {report.chart.map(c => (
              <div key={c.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 50 }}>
                  <div style={{ flex: 1, background: BLUE, height: `${Math.max(4, (Math.abs(c.revenue) / maxAbs) * 50)}px`, borderRadius: 2 }} />
                  <div style={{ flex: 1, background: GREEN, height: `${Math.max(4, (Math.abs(c.ebitda) / maxAbs) * 50)}px`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, color: '#5f5f68' }}>{c.period.slice(5)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11 }}>
            <span style={{ color: BLUE }}>■ {t.chart.includes('RECEITA') ? 'Receita' : 'Revenue'}</span>
            <span style={{ color: GREEN }}>■ EBITDA</span>
          </div>
        </div>
      )}

      {/* Análise executiva */}
      <div>
        <div style={{ fontSize: 11, color: '#8a8a92', letterSpacing: 1, marginBottom: 6 }}>{t.exec}</div>
        <div style={{ fontSize: 12, color: '#c5c5cc', lineHeight: 1.6 }}>{report.executiveSummary}</div>
      </div>

      {/* Riscos e catalisadores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: RED, letterSpacing: 1, marginBottom: 6 }}>{t.risks}</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.risks.map((r, i) => <li key={i} style={{ fontSize: 11, color: '#c5c5cc' }}>{r}</li>)}
          </ul>
        </div>
        <div>
          <div style={{ fontSize: 11, color: GREEN, letterSpacing: 1, marginBottom: 6 }}>{t.catalysts}</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.catalysts.map((c, i) => <li key={i} style={{ fontSize: 11, color: '#c5c5cc' }}>{c}</li>)}
          </ul>
        </div>
      </div>

      {/* Guia de ação */}
      <div>
        <div style={{ fontSize: 11, color: '#8a8a92', letterSpacing: 1, marginBottom: 8 }}>{t.action}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            [t.aggressive, price * report.actionGuide.aggressiveEntry, GREEN],
            [t.conservative, price * report.actionGuide.conservativeEntry, GREEN],
            [t.current, price * report.actionGuide.current, BLUE],
            [t.trim, price * report.actionGuide.trim, YELLOW],
            [t.stop, price * report.actionGuide.stop, RED],
          ].map(([label, value, c]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
              <span style={{ color: '#8a8a92' }}>{label}</span>
              <span style={{ color: c as string, fontWeight: 600 }}>{eur.format(value as number)} €</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#a0a0a8', lineHeight: 1.5 }}>
          {t.beta}: <b style={{ color: '#e4e4e7' }}>{report.actionGuide.beta.toFixed(2)}</b> ·{' '}
          {report.actionGuide.savingsPlanSuitable ? t.savings : t.lump}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1f1f24', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5f5f68' }}>
        <span>{report.footer.tags.join(' · ')}</span>
        <span>{report.footer.source}</span>
      </div>
    </div>
  );
}
