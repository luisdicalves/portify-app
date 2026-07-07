// lib/engines/convictionEngine.ts
//
// Conviction Engine — Portify Investment Engine v1.0, secção 3.
// Mede a confiança na tese de investimento: Earnings Surprise Consistency 30% /
// Revenue Growth Stability 25% / Margin Stability 20% / Analyst Consensus 15% /
// EPS Stability 10%.
//
// "Consistency"/"Stability" = inverso do coeficiente de variação (desvio-padrão /
// |média|) da série trimestral — menos variação ao longo dos trimestres implica
// mais confiança na tese.

import { toFinnhubSymbol } from '@/lib/riskScore';
import type { ConvictionEngineInput, ConvictionEngineResult } from './types';

const NEUTRAL = 50;

// Converte uma série trimestral num score 0–100: baixo coeficiente de variação
// (série estável) → score alto; série errática → score baixo.
function stabilityScore(series: number[] | undefined): number {
  if (!series || series.length < 2) return NEUTRAL;
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  if (mean === 0) return NEUTRAL;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
  const cv = Math.sqrt(variance) / Math.abs(mean);
  // cv 0 → 100 (perfeitamente estável); cv ≥ 1.5 → 0 (muito errático)
  return Math.round(Math.max(0, Math.min(100, 100 - (cv / 1.5) * 100)));
}

function analystConsensusScore(buy = 0, hold = 0, sell = 0): number {
  const total = buy + hold + sell;
  if (total === 0) return NEUTRAL;
  const net = (buy - sell) / total; // -1..1
  return Math.round(((net + 1) / 2) * 100);
}

export function calcConvictionEngineScore(input: ConvictionEngineInput): ConvictionEngineResult {
  const surpriseConsistency = stabilityScore(input.quarterlyEarningsSurprisesPct);
  const revenueGrowthStability = stabilityScore(input.quarterlyRevenueGrowthPct);
  const marginStability = stabilityScore(input.quarterlyMarginsPct);
  const analystConsensus = analystConsensusScore(input.analystBuy, input.analystHold, input.analystSell);
  const epsStability = stabilityScore(input.quarterlyEpsGrowthPct);

  const total = Math.round(
    surpriseConsistency * 0.30 +
    revenueGrowthStability * 0.25 +
    marginStability * 0.20 +
    analystConsensus * 0.15 +
    epsStability * 0.10,
  );

  return { surpriseConsistency, revenueGrowthStability, marginStability, analystConsensus, epsStability, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do input (I/O) — não testado por unit test
// ─────────────────────────────────────────────────────────────────────────────

export async function buildConvictionEngineInput(
  ticker: string,
  finnhubApiKey: string | undefined,
): Promise<ConvictionEngineInput | null> {
  if (!finnhubApiKey) return null;
  const symbol = toFinnhubSymbol(ticker);

  const [metricRes, recRes, earningsRes] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubApiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${finnhubApiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${finnhubApiKey}`),
  ]);

  if (!metricRes.ok) return null;
  const metricData = await metricRes.json();
  const recommendations = recRes.ok ? await recRes.json() : [];
  const earnings = earningsRes.ok ? await earningsRes.json() : [];

  const quarterly = metricData.series?.quarterly ?? {};
  // NOTA: a disponibilidade destas séries trimestrais no plano gratuito do Finnhub
  // varia por ticker — quando ausentes, stabilityScore() cai para NEUTRAL (50),
  // o mesmo padrão de fallback usado em lib/qualityScore.ts.
  const quarterlyRevenueGrowthPct = (quarterly.revenueGrowth ?? []).map((p: { v: number }) => p.v);
  const quarterlyMarginsPct = (quarterly.netMargin ?? quarterly.grossMargin ?? []).map((p: { v: number }) => p.v);

  const quarterlyEarningsSurprisesPct = Array.isArray(earnings)
    ? earnings.slice(0, 8).map((e: { surprisePercent?: number }) => e.surprisePercent ?? 0)
    : [];
  const quarterlyEpsGrowthPct = Array.isArray(earnings)
    ? earnings.slice(0, 8).map((e: { actual?: number; estimate?: number }) =>
        e.estimate ? (((e.actual ?? 0) - e.estimate) / Math.abs(e.estimate)) * 100 : 0)
    : [];

  const latestRec = recommendations[0];

  return {
    quarterlyEarningsSurprisesPct,
    quarterlyRevenueGrowthPct: quarterlyRevenueGrowthPct.length ? quarterlyRevenueGrowthPct : undefined,
    quarterlyMarginsPct: quarterlyMarginsPct.length ? quarterlyMarginsPct : undefined,
    analystBuy: latestRec ? latestRec.strongBuy + latestRec.buy : undefined,
    analystHold: latestRec?.hold,
    analystSell: latestRec ? latestRec.sell + latestRec.strongSell : undefined,
    quarterlyEpsGrowthPct: quarterlyEpsGrowthPct.length ? quarterlyEpsGrowthPct : undefined,
  };
}
