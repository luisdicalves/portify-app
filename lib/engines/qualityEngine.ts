// lib/engines/qualityEngine.ts
//
// Quality Engine — Portify Investment Engine v1.0, secção 1.
// Mede a qualidade fundamental de um ativo: Valuation 35% / Financial Health 35% /
// Growth 30%. Pura, sem I/O — quem busca os fundamentais é buildQualityEngineInput
// (ou o caller, via lib/marketData.ts / Finnhub /stock/metric).
//
// Reaproveita band() de lib/riskScore.ts (utilitário genérico de interpolação por
// degraus) para manter os mesmos thresholds já validados em produção para
// valuation/health/growth, em vez de reimplementar.

import { band, toFinnhubSymbol } from '@/lib/riskScore';
import type { QualityEngineInput, QualityEngineResult, QualityLabel } from './types';

export function calcQualityEngineScore(input: QualityEngineInput): QualityEngineResult {
  // ---- Valuation (35%) ----
  const peScore = band(input.peTTM, [[15, 100], [25, 80], [35, 60], [50, 40], [Infinity, 20]]);
  const psScore = band(input.psTTM, [[2, 100], [5, 80], [10, 60], [15, 40], [Infinity, 20]]);
  const evRevScore = band(input.evRevenueTTM ?? input.psTTM, [[2, 100], [5, 80], [10, 60], [15, 40], [Infinity, 20]]);
  const valuationScore = Math.round((peScore + psScore + evRevScore) / 3);

  // ---- Financial Health (35%) ----
  const currentRatioScore = band(input.currentRatioAnnual, [[0.7, 30], [1, 50], [1.5, 70], [2, 85], [Infinity, 100]]);
  const debtEquityScore = band(input.debtToEquityAnnual, [[0.3, 100], [0.7, 85], [1.2, 65], [2, 45], [Infinity, 25]]);
  const roeScore = band(input.roeTTM, [[0, 20], [10, 50], [20, 75], [40, 90], [Infinity, 100]]);
  const marginScore = band(input.operatingMarginTTM, [[0, 20], [10, 50], [20, 75], [30, 90], [Infinity, 100]]);
  const financialHealthScore = Math.round((currentRatioScore + debtEquityScore + roeScore + marginScore) / 4);

  // ---- Growth (30%) ----
  const revGrowthScore = band(input.revenueGrowthTTMYoy, [[0, 20], [5, 50], [15, 75], [30, 90], [Infinity, 100]]);
  const epsGrowthScore = band(input.epsGrowthTTMYoy, [[0, 20], [5, 50], [15, 75], [30, 90], [Infinity, 100]]);
  const surpriseScore = (input.avgEarningsSurprisePct ?? 0) >= 0 ? 70 : 40;
  const growthScore = Math.round((revGrowthScore + epsGrowthScore + surpriseScore) / 3);

  const total = Math.round(valuationScore * 0.35 + financialHealthScore * 0.35 + growthScore * 0.30);

  return {
    valuationScore,
    financialHealthScore,
    growthScore,
    total,
    label: qualityEngineLabel(total),
  };
}

export function qualityEngineLabel(total: number): QualityLabel {
  if (total >= 80) return 'excellent';
  if (total >= 65) return 'good';
  if (total >= 50) return 'average';
  if (total >= 35) return 'weak';
  return 'poor';
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do input (I/O) — não testado por unit test, à semelhança de fetchRiskReport
// ─────────────────────────────────────────────────────────────────────────────

export async function buildQualityEngineInput(
  ticker: string,
  finnhubApiKey: string | undefined,
): Promise<QualityEngineInput | null> {
  if (!finnhubApiKey) return null;
  const symbol = toFinnhubSymbol(ticker);

  const [metricRes, earningsRes] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubApiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${finnhubApiKey}`),
  ]);

  if (!metricRes.ok) return null;
  const metricData = await metricRes.json();
  const earnings = earningsRes.ok ? await earningsRes.json() : [];

  const m = metricData.metric ?? {};
  const avgEarningsSurprisePct = Array.isArray(earnings) && earnings.length
    ? earnings.slice(0, 4).reduce((s: number, e: { surprisePercent?: number }) => s + (e.surprisePercent ?? 0), 0) / Math.min(4, earnings.length)
    : undefined;

  return {
    peTTM: m.peTTM,
    psTTM: m.psTTM,
    evRevenueTTM: m['evRevenueTTM'],
    currentRatioAnnual: m.currentRatioAnnual,
    debtToEquityAnnual: m['totalDebt/totalEquityAnnual'],
    roeTTM: m.roeTTM,
    operatingMarginTTM: m.operatingMarginTTM,
    revenueGrowthTTMYoy: m.revenueGrowthTTMYoy,
    epsGrowthTTMYoy: m.epsGrowthTTMYoy,
    avgEarningsSurprisePct,
  };
}
