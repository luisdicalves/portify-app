'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';
import type { RecommendationResult, Recommendation } from '@/lib/recommendationEngine';

// ─── Confiança dos dados (explanation.dataConfidence) ──────────────────────

const CONFIDENCE_LABEL: Record<string, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' };

// ─── Badge de score ────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 78 ? 'var(--gain)' :
    score >= 62 ? '#22C55E' :
    score >= 48 ? 'var(--on-surface-variant)' :
    '#F59E0B';

  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      border: `1px solid ${color}`, borderRadius: 'var(--radius-xs)',
      padding: '2px 6px', whiteSpace: 'nowrap',
    }}>
      {score}/100
    </span>
  );
}

// ─── Badge new / reinforce ─────────────────────────────────────────────────

function TypeBadge({ type, labels }: { type: 'new' | 'reinforce'; labels: { recNew: string; recReinforce: string } }) {
  const isNew = type === 'new';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 7px', borderRadius: 'var(--radius-xs)',
      background: isNew ? 'var(--primary-container)' : 'var(--surface-low)',
      color: isNew ? 'var(--primary)' : 'var(--on-surface-variant)',
      textTransform: 'uppercase',
    }}>
      {isNew ? labels.recNew : labels.recReinforce}
    </span>
  );
}

// ─── Linha de alocação ─────────────────────────────────────────────────────

function AllocationBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 3, background: 'var(--hairline)', borderRadius: 99, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: 'var(--primary)', borderRadius: 99 }} />
    </div>
  );
}

// ─── Card de recomendação ──────────────────────────────────────────────────

function RecCard({ rec, t }: { rec: Recommendation; t: ReturnType<typeof useDict> }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  function goInvest(e: React.MouseEvent) {
    e.stopPropagation();
    router.push(`/portfolio/${rec.asset.ticker.toLowerCase()}?action=buy`);
  }

  const classLabel =
    rec.asset.assetClass === 'stock'    ? 'Ação' :
    rec.asset.assetClass === 'etf'      ? 'ETF' :
    'Bond ETF';

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        background: 'var(--surface-lowest)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Linha principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
        {/* Avatar */}
        <div style={{
          width: 42, height: 42, flex: 'none', borderRadius: 'var(--radius-md)',
          background: 'var(--primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
            {rec.asset.ticker.split('.')[0].slice(0, 3)}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>
              {rec.asset.ticker.split('.')[0]}
            </span>
            <span style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>{classLabel}</span>
            <TypeBadge type={rec.type} labels={t} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rec.asset.name}
          </div>
        </div>

        {/* Montante */}
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
            {rec.suggestedAmount} €
          </div>
          <div style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>{t.recPerMonth}</div>
        </div>
      </div>

      {/* Barra de alocação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 10px' }}>
        <AllocationBar pct={rec.allocationPct} />
        <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>
          {Math.round(rec.allocationPct * 100)}%
        </span>
        <ScoreBadge score={rec.finalScore} />
      </div>

      {/* Razão */}
      <div style={{
        padding: '0 14px 12px',
        fontSize: 11, color: 'var(--on-surface-variant)',
        borderTop: expanded ? '1px solid var(--hairline)' : undefined,
        paddingTop: expanded ? 10 : 0,
      }}>
        {rec.explanation.primaryReason}
      </div>

      {/* Detalhe expandido */}
      {expanded && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Match score</span>
            <span style={{ fontWeight: 600 }}>{rec.matchScore}/100</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Quality score</span>
            <span style={{ fontWeight: 600 }}>{rec.qualityScore}/100</span>
          </div>
          {rec.alreadyOwned && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>Peso atual</span>
              <span style={{ fontWeight: 600 }}>{Math.round(rec.currentWeight * 100)}%</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Peso ideal</span>
            <span style={{ fontWeight: 600 }}>{Math.round(rec.targetWeight * 100)}%</span>
          </div>
          {rec.asset.dividendYield > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>Dividendo</span>
              <span style={{ fontWeight: 600 }}>{rec.asset.dividendYield.toFixed(1)}%</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Confiança dos dados</span>
            <span style={{ fontWeight: 600 }}>{CONFIDENCE_LABEL[rec.explanation.dataConfidence]}</span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', lineHeight: 1.4, marginTop: 2 }}>
            {rec.explanation.portfolioEffect}
          </div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
            {rec.explanation.riskNote}
          </div>

          <button
            onClick={goInvest}
            style={{
              marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '10px 0', border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)', color: 'var(--on-primary)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>bolt</span>
            {t.recInvestNow}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 82, borderRadius: 'var(--radius-lg)',
          background: 'var(--surface-low)',
          animation: 'pulse 1.4s ease-in-out infinite',
          opacity: 0.6,
        }} />
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ForYouPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();

  const [result, setResult]   = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const storedETag = sessionStorage.getItem('rec-etag');
    const headers: Record<string, string> = {};
    if (storedETag) headers['If-None-Match'] = storedETag;

    fetch('/api/recommendations', { headers })
      .then(async r => {
        if (r.status === 401) { router.replace('/auth/login'); return; }
        if (r.status === 304) { setLoading(false); return; } // profile unchanged
        const etag = r.headers.get('etag');
        if (etag) sessionStorage.setItem('rec-etag', etag);
        const data = await r.json();
        if (data.error) setError(data.error as string);
        else setResult(data as RecommendationResult);
      })
      .catch(() => setError('network_error'))
      .finally(() => setLoading(false));
  }, [router]);

  const recs = result?.recommendations ?? [];

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span className="material-symbols-outlined icf" style={{ fontSize: 22, color: 'var(--primary)' }}>auto_awesome</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{t.navFor}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Banner de introdução */}
        {!loading && result && (
          <div style={{
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            background: 'linear-gradient(135deg, var(--primary-strong), color-mix(in oklab, var(--primary-strong) 70%, #000))',
            padding: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              {t.recSectionTitle}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginBottom: 10 }}>
              {t.recSectionSub}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{t.recMonthlyPlan}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{result.monthlyAmount} €</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{t.recScore}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{result.riskScore}/100</div>
              </div>
            </div>
          </div>
        )}

        {/* Alerta de ritmo */}
        {result?.paceAlert && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: 'color-mix(in oklab, #F59E0B 12%, var(--surface-lowest))',
            border: '1px solid #F59E0B',
            borderRadius: 'var(--radius-lg)', padding: '12px 16px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#F59E0B', flex: 'none', marginTop: 1 }}>warning</span>
            <span style={{ fontSize: 12, color: 'var(--on-surface)', lineHeight: 1.4 }}>{t.recPaceAlert}</span>
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Erro */}
        {!loading && (error === 'incomplete_profile') && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--on-surface-variant)', fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, color: 'var(--primary)' }}>person_edit</span>
            {t.recCompleteProfile}
          </div>
        )}

        {!loading && error && error !== 'incomplete_profile' && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--on-surface-variant)', fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, color: 'var(--loss)' }}>error</span>
            {t.recEmpty}
          </div>
        )}

        {/* Lista vazia */}
        {!loading && !error && recs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--on-surface-variant)', fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>inbox</span>
            {t.recEmpty}
          </div>
        )}

        {/* Cards */}
        {!loading && recs.map(rec => (
          <RecCard key={rec.asset.ticker} rec={rec} t={t} />
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
