/**
 * lib/models/performanceEngine.ts
 *
 * Performance Engine — time-weighted return (TWR), money-weighted return
 * (XIRR) and the Wealth Change Waterfall decomposition, per PORTIFY-KNOWLEDGE
 * `04-financial-models/PERFORMANCE/PERFORMANCE-ENGINE-V1.md` (§18).
 *
 * Unlike Safety Reserve/Debt Adapter, these formulas are standard financial
 * math (XIRR is literally Excel/Sheets' XIRR function) — they don't depend
 * on any Portify-specific calibration.
 *
 * This module does no I/O, same rule as every other governed model
 * (recommendationEngine, portfolioState, ...): the caller must already have
 * assembled `valuationSeries` (dated portfolio market values) before calling
 * it. Building that series from historical prices across held-and-sold
 * tickers is a data-assembly job, deliberately out of scope here — see
 * docs/model-map.md.
 *
 * Also out of scope for this v1 (documented, not silently skipped):
 *   - Gross/Net/after-tax return layers (§18) — would need a `fee`
 *     transaction type that doesn't exist in this app's schema yet.
 *   - Funding Ratio / Plan Progress (§18) — depends on Glide Path, which is
 *     explicitly "ainda quantitativamente por fechar" in
 *     ALLOCATION-RISK-FEASIBILITY-V1.md §8.1.
 *   - Benchmark Relative Performance — needs a benchmark series, not provided.
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface CashFlow {
  /** ISO date. */
  date: string;
  /**
   * Signed from the investor's perspective: positive = money into the
   * account (contribution), negative = money out (withdrawal). Only
   * EXTERNAL flows — buy/sell/dividend/interest are internal to the
   * account and must not be included here (§18: "External cash flows
   * separados de internal flows").
   */
  amount: number;
}

export interface ValuationPoint {
  /** ISO date. */
  date: string;
  /** € portfolio market value at this date. */
  value: number;
}

export interface WealthChangeWaterfall {
  startValue: number;
  /** Sum of positive external flows in the period. */
  contributions: number;
  /** Sum of |negative external flows| in the period. */
  withdrawals: number;
  /** endValue − startValue − contributions + withdrawals. */
  investmentGainLoss: number;
  endValue: number;
}

export interface PerformanceInput {
  /** Dated valuations spanning the period — caller-assembled, see file header. */
  valuationSeries: ValuationPoint[];
  externalFlows: CashFlow[];
}

export interface PerformanceResult {
  /** Decimal, cumulative over the whole valuationSeries span (e.g. 0.07 = 7%). Null if not computable. */
  twr: number | null;
  /** Decimal, annualized. Null if not computable. */
  xirr: number | null;
  wealthChangeWaterfall: WealthChangeWaterfall;
  reasons: string[];
  /** Governance/versioning metadata — ver docs/model-governance.md. Campo aditivo. */
  meta?: ModelRunMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. calcXIRR — Newton-Raphson com fallback por bisseção
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86400000;
const XIRR_TOLERANCE = 1e-7;
const XIRR_MAX_ITERATIONS = 100;

function yearsBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY / 365;
}

function npv(cashFlows: CashFlow[], t0: string, rate: number): number {
  return cashFlows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, yearsBetween(t0, cf.date)), 0);
}

function npvDerivative(cashFlows: CashFlow[], t0: string, rate: number): number {
  return cashFlows.reduce((sum, cf) => {
    const t = yearsBetween(t0, cf.date);
    if (t === 0) return sum;
    return sum - t * cf.amount / Math.pow(1 + rate, t + 1);
  }, 0);
}

export function calcXIRR(cashFlows: CashFlow[], guess = 0.1): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some(cf => cf.amount > 0);
  const hasNegative = cashFlows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null; // no sign change -> no solution

  const t0 = cashFlows.reduce((min, cf) => (cf.date < min ? cf.date : min), cashFlows[0].date);

  // Newton-Raphson.
  let rate = guess;
  for (let i = 0; i < XIRR_MAX_ITERATIONS; i++) {
    const value = npv(cashFlows, t0, rate);
    if (Math.abs(value) < XIRR_TOLERANCE) return rate;

    const derivative = npvDerivative(cashFlows, t0, rate);
    if (derivative === 0) break;

    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -1) break; // diverged or left the valid domain
    rate = next;
  }

  // Fallback: bisection over a wide, economically-plausible rate range.
  let lo = -0.99;
  let hi = 10;
  let npvLo = npv(cashFlows, t0, lo);
  let npvHi = npv(cashFlows, t0, hi);
  if (Math.sign(npvLo) === Math.sign(npvHi)) return null; // no sign change in range -> no bracketed root

  for (let i = 0; i < XIRR_MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(cashFlows, t0, mid);
    if (Math.abs(npvMid) < XIRR_TOLERANCE) return mid;

    if (Math.sign(npvMid) === Math.sign(npvLo)) {
      lo = mid;
      npvLo = npvMid;
    } else {
      hi = mid;
      npvHi = npvMid;
    }
  }

  return (lo + hi) / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. calcTWR — sub-period chain-linking (unit-price method)
// ─────────────────────────────────────────────────────────────────────────────

export function calcTWR(
  valuationSeries: ValuationPoint[],
  externalFlows: CashFlow[],
): { twr: number | null; unalignedFlowCount: number } {
  if (valuationSeries.length < 2) return { twr: null, unalignedFlowCount: externalFlows.length };

  const sorted = [...valuationSeries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const seriesDates = new Set(sorted.map(p => p.date));
  const unalignedFlowCount = externalFlows.filter(f => !seriesDates.has(f.date)).length;

  const flowByDate = new Map<string, number>();
  for (const f of externalFlows) {
    if (!seriesDates.has(f.date)) continue;
    flowByDate.set(f.date, (flowByDate.get(f.date) ?? 0) + f.amount);
  }

  let cumulative = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.value <= 0) return { twr: null, unalignedFlowCount };

    const flow = flowByDate.get(curr.date) ?? 0;
    const subPeriodReturn = (curr.value - flow) / prev.value - 1;
    cumulative *= 1 + subPeriodReturn;
  }

  return { twr: cumulative - 1, unalignedFlowCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. calcWealthChangeWaterfall
// ─────────────────────────────────────────────────────────────────────────────

export function calcWealthChangeWaterfall(
  startValue: number,
  endValue: number,
  externalFlows: CashFlow[],
): WealthChangeWaterfall {
  const contributions = externalFlows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const withdrawals = externalFlows.filter(f => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0);
  const investmentGainLoss = endValue - startValue - contributions + withdrawals;

  return { startValue, contributions, withdrawals, investmentGainLoss, endValue };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. evaluatePerformance — orquestrador
// ─────────────────────────────────────────────────────────────────────────────

export function evaluatePerformance(input: PerformanceInput): PerformanceResult {
  const { valuationSeries, externalFlows } = input;
  const reasons: string[] = [];

  const sorted = [...valuationSeries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  let xirr: number | null = null;
  if (first && last) {
    // Treat the starting portfolio value as an implicit initial outflow and
    // the ending value as a terminal inflow — the standard framing for a
    // period money-weighted return (equivalent to "as if you bought in at
    // first.value and cashed out at last.value"), on top of whatever
    // external flows happened in between.
    const initialFlow: CashFlow = { date: first.date, amount: -first.value };
    const terminalFlow: CashFlow = { date: last.date, amount: last.value };
    xirr = calcXIRR([initialFlow, ...externalFlows, terminalFlow]);
    if (xirr === null) reasons.push('XIRR_NO_SOLUTION');
  } else {
    reasons.push('XIRR_NO_SOLUTION');
  }

  const { twr, unalignedFlowCount } = calcTWR(valuationSeries, externalFlows);
  if (twr === null) reasons.push('TWR_INSUFFICIENT_DATA');
  if (unalignedFlowCount > 0) reasons.push('UNALIGNED_EXTERNAL_FLOWS');

  const wealthChangeWaterfall = calcWealthChangeWaterfall(first?.value ?? 0, last?.value ?? 0, externalFlows);

  return {
    twr,
    xirr,
    wealthChangeWaterfall,
    reasons,
    meta: createModelRunMeta({
      modelName: 'performanceEngine',
      input,
      assumptions: [
        'calcTWR assume que cada fluxo externo coincide exatamente com um ponto de valuationSeries (unit-price method); fluxos sem ponto correspondente ficam de fora do ajuste de sub-período e são contados em unalignedFlowCount.',
        'xirr trata o valor inicial de valuationSeries como uma saída implícita e o valor final como uma entrada terminal, além dos externalFlows — enquadramento standard de um money-weighted return "desde o início do período".',
        'Gross/Net/after-tax layers, Funding Ratio/Plan Progress e Benchmark Relative Performance não estão implementados nesta versão — ver docs/model-map.md.',
      ],
      warnings: reasons,
    }),
  };
}
