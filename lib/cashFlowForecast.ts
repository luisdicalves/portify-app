/**
 * lib/cashFlowForecast.ts
 *
 * Prevê dividendos futuros e juros de fundos livres para os próximos N meses.
 *
 * Lógica:
 *   - Por cada ticker em carteira, analisa o histórico de dividendos recebidos
 *     para estimar a periodicidade (mensal, trimestral, semestral, anual) e
 *     o valor médio por pagamento.
 *   - Projecta as datas dos próximos pagamentos com base na última data recebida.
 *   - Aplica a taxa de WHT estimada por país de origem (via sufixo do ticker).
 *   - Adiciona os juros esperados de fundos livres (capital × taxa / 12 por mês).
 *
 * Outputs:
 *   ForecastDividend — dividendo previsto por ticker
 *   ForecastResult   — lista de dividendos + resumo de juros
 *   buildCashFlowForecast(holdings, history, cash, rate, opts) → ForecastResult
 */

import { createModelRunMeta, type ModelRunMeta } from '@/lib/models/modelMeta';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface ForecastDividend {
  ticker:       string;
  expectedDate: string;        // ISO date string
  grossAmount:  number;        // antes de WHT
  netAmount:    number;        // depois de WHT
  whtRate:      number;        // 0–1
  confidence:   'high' | 'low'; // high = ≥2 pagamentos históricos, low = estimativa
}

export interface ForecastResult {
  dividends:        ForecastDividend[];  // ordenados por expectedDate asc
  interestMonthly:  number;             // juro mensal esperado de fundos livres
  interestAnnual:   number;             // juro anual esperado
  /** Governance/versioning metadata — see docs/model-governance.md. Additive field, safe to ignore. */
  meta?:            ModelRunMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// WHT por país (sufixo do ticker ou mercado de origem)
// ─────────────────────────────────────────────────────────────────────────────

// Taxas de retenção na fonte típicas para investidores portugueses
const WHT_BY_SUFFIX: Record<string, number> = {
  US:  0.15,  // EUA (treaty PT-US)
  L:   0.00,  // Reino Unido
  PA:  0.125, // França
  DE:  0.00,  // Alemanha (0% com formulário correto, 26.375% sem)
  MI:  0.26,  // Itália
  LS:  0.00,  // Portugal
  SW:  0.35,  // Suíça
  T:   0.15,  // Japão
  HK:  0.00,  // Hong Kong
  TO:  0.25,  // Canadá
};

const DEFAULT_WHT = 0.15;

export function whtRateForTicker(ticker: string): number {
  const parts = ticker.split('.');
  const suffix = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'US';
  return WHT_BY_SUFFIX[suffix] ?? DEFAULT_WHT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estimativa de periodicidade
// ─────────────────────────────────────────────────────────────────────────────

type Frequency = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';

function inferFrequency(dates: Date[]): Frequency {
  if (dates.length < 2) return 'annual';
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (30 * 86400000)); // em meses
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg <= 1.8)  return 'monthly';
  if (avg <= 4.5)  return 'quarterly';
  if (avg <= 8)    return 'semi-annual';
  return 'annual';
}

function frequencyMonths(f: Frequency): number {
  return { monthly: 1, quarterly: 3, 'semi-annual': 6, annual: 12 }[f];
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────────────────────

export function buildCashFlowForecast(
  holdings: { ticker: string; units: number }[],
  history:  { ticker: string; amount: number; executed_at: string }[],
  uninvestedCash: number,
  freeFundsAnnualRatePct: number,
  opts: { horizonMonths?: number } = {},
): ForecastResult {
  const horizonMonths = opts.horizonMonths ?? 12;
  const now = new Date();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + horizonMonths);

  // Agrupar histórico por ticker
  const byTicker = new Map<string, { amount: number; date: Date }[]>();
  for (const row of history) {
    if (!row.ticker) continue;
    const list = byTicker.get(row.ticker) ?? [];
    list.push({ amount: row.amount, date: new Date(row.executed_at) });
    byTicker.set(row.ticker, list);
  }

  const dividends: ForecastDividend[] = [];

  for (const holding of holdings) {
    const { ticker, units } = holding;
    const hist = byTicker.get(ticker);
    if (!hist || hist.length === 0) continue;

    const sorted = hist.sort((a, b) => a.date.getTime() - b.date.getTime());
    const lastDate = sorted[sorted.length - 1].date;

    // Valor médio por unidade nos últimos pagamentos (máx. 4)
    const recent = sorted.slice(-4);
    const avgPerUnit = recent.reduce((s, r) => s + r.amount, 0) / recent.length / units;
    if (avgPerUnit <= 0) continue;

    const freq = inferFrequency(sorted.map(r => r.date));
    const intervalMonths = frequencyMonths(freq);
    const confidence: ForecastDividend['confidence'] = sorted.length >= 2 ? 'high' : 'low';
    const whtRate = whtRateForTicker(ticker);

    // Projectar pagamentos futuros
    let nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + intervalMonths);

    while (nextDate <= horizon) {
      if (nextDate > now) {
        const gross = avgPerUnit * units;
        dividends.push({
          ticker,
          expectedDate: nextDate.toISOString().split('T')[0],
          grossAmount:  parseFloat(gross.toFixed(2)),
          netAmount:    parseFloat((gross * (1 - whtRate)).toFixed(2)),
          whtRate,
          confidence,
        });
      }
      nextDate = new Date(nextDate);
      nextDate.setMonth(nextDate.getMonth() + intervalMonths);
    }
  }

  // Ordenar por data
  dividends.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  // Juros de fundos livres
  const annualRate = freeFundsAnnualRatePct / 100;
  const interestMonthly = parseFloat(((uninvestedCash * annualRate) / 12).toFixed(2));
  const interestAnnual  = parseFloat((uninvestedCash * annualRate).toFixed(2));

  const warnings: string[] = [];
  const lowConfidenceCount = dividends.filter(d => d.confidence === 'low').length;
  if (lowConfidenceCount > 0) {
    warnings.push(`${lowConfidenceCount} previsão(ões) de dividendo baseiam-se num único pagamento histórico (confiança baixa).`);
  }

  return {
    dividends,
    interestMonthly,
    interestAnnual,
    meta: createModelRunMeta({
      modelName: 'cashFlowForecast',
      input: { holdings, history, uninvestedCash, freeFundsAnnualRatePct, opts },
      assumptions: [
        'Periodicidade e valor futuro dos dividendos assumidos iguais ao padrão histórico observado; sem garantia de manutenção pela empresa emissora.',
        'WHT (retenção na fonte) estimada por sufixo do ticker/mercado de origem — ver WHT_BY_SUFFIX.',
      ],
      warnings,
    }),
  };
}
