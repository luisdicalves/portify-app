// lib/engines/riskEngine.ts
//
// Risk Engine — Portify Investment Engine v1.0, secção 2.
// Mede o risco real de um ativo: Beta 25% / Volatilidade 1y 25% / Max Drawdown 20% /
// Debt Ratio 15% / Liquidez 15%. Resultado onde 100 = muito seguro, 0 = muito
// arriscado — deliberadamente NÃO reaproveita o "risk score" atual (lib/riskScore.ts),
// que é estruturalmente um score de qualidade fundamental (valuation/health/growth),
// não um score de risco de mercado.

import { band } from '@/lib/riskScore';
import { toFinnhubSymbol } from '@/lib/riskScore';
import { getHistory } from '@/lib/marketData';
import type { RiskEngineInput, RiskEngineResult } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Cálculos puros sobre a série de preços
// ─────────────────────────────────────────────────────────────────────────────

// Volatilidade anualizada (%) a partir dos retornos diários — desvio-padrão dos
// retornos diários * sqrt(252 dias de negociação/ano) * 100.
export function calcAnnualizedVolatilityPct(dailyCloses: number[]): number | undefined {
  if (dailyCloses.length < 2) return undefined;
  const returns: number[] = [];
  for (let i = 1; i < dailyCloses.length; i++) {
    const prev = dailyCloses[i - 1];
    if (prev > 0) returns.push((dailyCloses[i] - prev) / prev);
  }
  if (returns.length < 2) return undefined;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// Maior queda peak-to-trough (%) observada na série.
export function calcMaxDrawdownPct(dailyCloses: number[]): number | undefined {
  if (dailyCloses.length < 2) return undefined;
  let peak = dailyCloses[0];
  let maxDrawdown = 0;
  for (const price of dailyCloses) {
    if (price > peak) peak = price;
    if (peak > 0) {
      const drawdown = (peak - price) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }
  return maxDrawdown * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score composto
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  beta: 0.25,
  volatility: 0.25,
  drawdown: 0.20,
  debt: 0.15,
  liquidity: 0.15,
} as const;

export function calcRiskEngineScore(input: RiskEngineInput): RiskEngineResult {
  // Beta baixo = mais seguro
  const betaScore = band(input.beta, [[0.7, 100], [1.0, 80], [1.3, 60], [1.8, 40], [Infinity, 20]]);

  // Volatilidade anualizada baixa = mais seguro
  const volatilityPct = input.dailyCloses ? calcAnnualizedVolatilityPct(input.dailyCloses) : undefined;
  const volatilityScore = band(volatilityPct, [[15, 100], [25, 80], [35, 60], [50, 40], [Infinity, 20]]);

  // Drawdown máximo baixo = mais seguro
  const drawdownPct = input.dailyCloses ? calcMaxDrawdownPct(input.dailyCloses) : undefined;
  const drawdownScore = band(drawdownPct, [[10, 100], [20, 80], [35, 60], [50, 40], [Infinity, 20]]);

  // Dívida/capital próprio baixa = mais seguro (mesmos thresholds do quality engine)
  const debtScore = band(input.debtToEquityAnnual, [[0.3, 100], [0.7, 85], [1.2, 65], [2, 45], [Infinity, 25]]);

  // Liquidez: sem endpoint de volume médio diário integrado no codebase — usa
  // market cap como proxy (empresas maiores tendem a ter mais liquidez de negociação).
  // Trocar por volume médio diário real se/quando esse dado ficar disponível.
  const liquidityScore = band(input.marketCapUsd, [
    [300_000_000, 20],
    [2_000_000_000, 40],
    [10_000_000_000, 60],
    [200_000_000_000, 80],
    [Infinity, 100],
  ]);

  const total = Math.round(
    betaScore * WEIGHTS.beta +
    volatilityScore * WEIGHTS.volatility +
    drawdownScore * WEIGHTS.drawdown +
    debtScore * WEIGHTS.debt +
    liquidityScore * WEIGHTS.liquidity,
  );

  return { betaScore, volatilityScore, drawdownScore, debtScore, liquidityScore, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do input (I/O) — não testado por unit test, à semelhança de fetchRiskReport
// ─────────────────────────────────────────────────────────────────────────────

export async function buildRiskEngineInput(
  ticker: string,
  keys: { finnhubApiKey?: string; twelveDataApiKey?: string },
): Promise<RiskEngineInput | null> {
  const symbol = toFinnhubSymbol(ticker);

  const [history, metricRes] = await Promise.all([
    getHistory(ticker, '260', keys.twelveDataApiKey),
    keys.finnhubApiKey
      ? fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${keys.finnhubApiKey}`)
      : Promise.resolve(null),
  ]);

  const metricData = metricRes && metricRes.ok ? await metricRes.json() : null;
  const m = metricData?.metric ?? {};

  return {
    beta: m.beta,
    dailyCloses: history?.map((p: { close: number }) => p.close),
    debtToEquityAnnual: m['totalDebt/totalEquityAnnual'],
    marketCapUsd: m.marketCapitalization ? m.marketCapitalization * 1_000_000 : undefined,
  };
}
