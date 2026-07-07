// Canonical, pure representation of a user's portfolio financial state.
//
// This module intentionally does not call Supabase, fetch quotes, or import
// React — it only transforms data already fetched by the caller. See
// docs/current-state.md for why this exists (three divergent valuation
// implementations across the dashboard, portfolio tab, and recommendation
// engine).
//
// The project has no separate "cash movement" or "dividend" tables/structures
// — deposits, interest, taxes, and dividends are all rows in `transactions`
// distinguished by `type` (see supabase-schema.sql). So PortfolioStateInput
// takes a single `transactions` array rather than inventing cashMovements/
// dividends inputs that don't exist anywhere else in the codebase.

// ─────────────────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────────────────

export type PortfolioTransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'deposit'
  | 'interest'
  | 'withholding_tax'
  | 'interest_tax';

const KNOWN_TRANSACTION_TYPES = new Set<string>([
  'buy', 'sell', 'dividend', 'deposit', 'interest', 'withholding_tax', 'interest_tax',
]);

/**
 * A transaction row as sourced from `lib/db/transactions.ts` / the
 * `transactions` table. `type` is left as `string` (not the narrower
 * PortfolioTransactionType) because the DB column isn't a typed enum at the
 * TypeScript level — unrecognized values are treated as invalid transactions
 * and reported as a data-quality warning rather than throwing.
 */
export interface PortfolioTransactionLike {
  id?: string | null;
  ticker?: string | null;
  type: string;
  units?: number | null;
  price?: number | null;
  amount: number;
  currency?: string | null;
  executed_at?: string | null;
}

export interface PortfolioQuoteLike {
  price: number;
}

export interface PortfolioHoldingInput {
  ticker: string;
  units: number;
  avg_price: number;
  currency?: string | null;
  assetClass?: string | null;
  sector?: string | null;
}

export interface PortfolioStateInput {
  holdings: PortfolioHoldingInput[];
  transactions: PortfolioTransactionLike[];
  /** Keyed by ticker. Missing/undefined/null means "no live quote available". */
  latestQuotes: Record<string, PortfolioQuoteLike | null | undefined>;
  userCurrency: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────

export interface PortfolioHoldingState {
  ticker: string;
  units: number;
  averageCost: number;
  costBasis: number;
  currency: string;
  assetClass: string;
  sector: string;
  price: number;
  priceSource: 'quote' | 'average_cost_fallback';
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
}

export interface PortfolioAllocationSlice {
  key: string;
  value: number;
  pct: number;
}

export type PortfolioAllocation = PortfolioAllocationSlice[];

export type PortfolioDataQualityWarningCode =
  | 'invalid_transaction'
  | 'unknown_ticker'
  | 'missing_quote'
  | 'unknown_currency'
  | 'multi_currency_no_fx';

export interface PortfolioDataQualityWarning {
  code: PortfolioDataQualityWarningCode;
  message: string;
  ticker?: string;
  transactionId?: string;
}

export interface PortfolioState {
  holdings: PortfolioHoldingState[];
  marketValue: number;
  costBasis: number;
  /**
   * Portfolio-wide cost-basis-per-unit, i.e. costBasis / sum(units) across
   * every holding. Units aren't a comparable quantity across different
   * tickers, so this number is only strictly meaningful for a single-position
   * portfolio — it's included because the spec calls for it, but per-holding
   * `averageCost` is what UI code should normally use.
   */
  averageCost: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  realizedGain: number;
  totalDividendsGross: number;
  totalDividendsNet: number;
  taxWithheld: number;
  cashBalance: number;
  totalPortfolioValue: number;
  allocationByAsset: PortfolioAllocation;
  allocationByAssetClass: PortfolioAllocation;
  allocationBySector: PortfolioAllocation;
  allocationByCurrency: PortfolioAllocation;
  dataQualityWarnings: PortfolioDataQualityWarning[];
}

// ─────────────────────────────────────────────────────────────────────────
// Internal normalization
// ─────────────────────────────────────────────────────────────────────────

const UNKNOWN = 'unknown';

interface NormalizedCashTxn {
  type: 'deposit' | 'interest' | 'interest_tax' | 'dividend' | 'withholding_tax';
  amount: number; // magnitude, always >= 0 — sign is derived from `type`, not trusted from input
}

interface NormalizedTradeTxn {
  type: 'buy' | 'sell';
  ticker: string;
  units: number; // > 0
  price: number; // > 0
  executedAt: string;
  currency: string | null;
}

// Splits raw transactions into cash-flow rows and trade rows, dropping and
// warning on anything malformed instead of throwing. Amount sign in the raw
// data is intentionally ignored (Math.abs'd) — the sign is instead derived
// from `type` later on, since manual entry and imported data (see
// lib/holdingsImport.ts) don't agree on a sign convention for tax/dividend
// rows.
function normalizeTransactions(
  transactions: PortfolioTransactionLike[],
  warnings: PortfolioDataQualityWarning[],
): { cashTxns: NormalizedCashTxn[]; tradeTxns: NormalizedTradeTxn[] } {
  const cashTxns: NormalizedCashTxn[] = [];
  const tradeTxns: NormalizedTradeTxn[] = [];

  transactions.forEach((raw, index) => {
    const transactionId = raw.id ?? `#${index}`;
    const type = raw.type;

    if (!KNOWN_TRANSACTION_TYPES.has(type)) {
      warnings.push({ code: 'invalid_transaction', message: `Unrecognized transaction type "${type}"`, transactionId });
      return;
    }

    const amountRaw = Number(raw.amount);
    if (!Number.isFinite(amountRaw)) {
      warnings.push({ code: 'invalid_transaction', message: 'Transaction amount is not a finite number', transactionId });
      return;
    }
    const amount = Math.abs(amountRaw);
    const ticker = (raw.ticker ?? '').trim();

    if (type === 'buy' || type === 'sell') {
      if (!ticker) {
        warnings.push({ code: 'unknown_ticker', message: `${type} transaction is missing a ticker`, transactionId });
        return;
      }
      const unitsRaw = Number(raw.units);
      if (!Number.isFinite(unitsRaw) || unitsRaw <= 0) {
        warnings.push({ code: 'invalid_transaction', message: `${type} transaction has an invalid unit quantity`, ticker, transactionId });
        return;
      }
      const priceRaw = Number(raw.price);
      const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : amount / unitsRaw;
      if (!Number.isFinite(price) || price <= 0) {
        warnings.push({ code: 'invalid_transaction', message: `${type} transaction has no usable price`, ticker, transactionId });
        return;
      }
      tradeTxns.push({ type, ticker, units: unitsRaw, price, executedAt: raw.executed_at ?? '', currency: raw.currency?.trim() || null });
      return;
    }

    if (type === 'dividend' || type === 'withholding_tax') {
      if (!ticker) {
        warnings.push({ code: 'unknown_ticker', message: `${type} transaction is missing a ticker`, transactionId });
        return;
      }
      cashTxns.push({ type, amount });
      return;
    }

    // deposit, interest, interest_tax — not tied to a specific ticker.
    cashTxns.push({ type: type as 'deposit' | 'interest' | 'interest_tax', amount });
  });

  return { cashTxns, tradeTxns };
}

function dateMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

interface TickerLedger {
  units: number;
  averageCost: number;
  realizedGain: number;
}

// Replays buy/sell transactions per ticker in chronological order using the
// weighted-average-cost method (matches lib/hooks/useTrade.ts and
// lib/holdingsImport.ts: a sale reduces units and cost basis but never
// changes the average cost of the units that remain held).
function computeLedgers(
  tradeTxns: NormalizedTradeTxn[],
  warnings: PortfolioDataQualityWarning[],
): { ledgers: Map<string, TickerLedger>; realizedGain: number; tradeCashDelta: number } {
  const byTicker = new Map<string, NormalizedTradeTxn[]>();
  for (const t of tradeTxns) {
    const list = byTicker.get(t.ticker) ?? [];
    list.push(t);
    byTicker.set(t.ticker, list);
  }

  const ledgers = new Map<string, TickerLedger>();
  let realizedGainTotal = 0;
  let tradeCashDelta = 0;

  for (const [ticker, list] of Array.from(byTicker)) {
    const sorted = [...list].sort((a, b) => dateMs(a.executedAt) - dateMs(b.executedAt));
    let units = 0;
    let averageCost = 0;
    let realizedGain = 0;

    for (const t of sorted) {
      if (t.type === 'buy') {
        const newUnits = units + t.units;
        averageCost = newUnits > 0 ? (units * averageCost + t.units * t.price) / newUnits : 0;
        units = newUnits;
        tradeCashDelta -= t.units * t.price;
      } else {
        let sellUnits = t.units;
        if (sellUnits > units) {
          warnings.push({
            code: 'invalid_transaction',
            message: `Sell of ${sellUnits} ${ticker} exceeds the ${units} units held; clamped to available units`,
            ticker,
          });
          sellUnits = units;
        }
        realizedGain += sellUnits * (t.price - averageCost);
        units -= sellUnits;
        tradeCashDelta += sellUnits * t.price;
      }
    }

    realizedGainTotal += realizedGain;
    ledgers.set(ticker, { units, averageCost, realizedGain });
  }

  return { ledgers, realizedGain: realizedGainTotal, tradeCashDelta };
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function buildAllocation(holdings: PortfolioHoldingState[], keyFn: (h: PortfolioHoldingState) => string, total: number): PortfolioAllocation {
  const byKey = new Map<string, number>();
  for (const h of holdings) {
    const key = keyFn(h);
    byKey.set(key, (byKey.get(key) ?? 0) + h.marketValue);
  }
  return Array.from(byKey.entries())
    .map(([key, value]) => ({ key, value, pct: total !== 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

export function buildPortfolioState(input: PortfolioStateInput): PortfolioState {
  const warnings: PortfolioDataQualityWarning[] = [];
  const userCurrency = (input.userCurrency ?? '').trim() || UNKNOWN;

  const { cashTxns, tradeTxns } = normalizeTransactions(input.transactions ?? [], warnings);
  const { ledgers, realizedGain, tradeCashDelta } = computeLedgers(tradeTxns, warnings);

  // Transactions carry a currency too — used as a fallback when the holdings
  // snapshot doesn't specify one for a ticker (first non-empty value wins).
  const tradeCurrencyByTicker = new Map<string, string>();
  for (const t of tradeTxns) {
    if (t.currency && !tradeCurrencyByTicker.has(t.ticker)) tradeCurrencyByTicker.set(t.ticker, t.currency);
  }

  let cashBalance = tradeCashDelta;
  let totalDividendsGross = 0;
  let taxWithheld = 0;
  for (const t of cashTxns) {
    if (t.type === 'deposit' || t.type === 'interest') cashBalance += t.amount;
    else if (t.type === 'interest_tax') cashBalance -= t.amount;
    else if (t.type === 'dividend') { totalDividendsGross += t.amount; cashBalance += t.amount; }
    else if (t.type === 'withholding_tax') { taxWithheld += t.amount; cashBalance -= t.amount; }
  }
  const totalDividendsNet = totalDividendsGross - taxWithheld;

  const holdingMeta = new Map<string, PortfolioHoldingInput>();
  for (const h of input.holdings ?? []) {
    const ticker = (h.ticker ?? '').trim();
    if (!ticker) {
      warnings.push({ code: 'unknown_ticker', message: 'Holding is missing a ticker' });
      continue;
    }
    holdingMeta.set(ticker, h);
  }

  const tickers = new Set<string>(Array.from(ledgers.keys()).concat(Array.from(holdingMeta.keys())));
  const holdingStates: PortfolioHoldingState[] = [];
  const currenciesSeen = new Set<string>();

  for (const ticker of Array.from(tickers)) {
    const ledger = ledgers.get(ticker);
    const meta = holdingMeta.get(ticker);

    let units: number;
    let averageCost: number;
    if (ledger && ledger.units > 0) {
      units = ledger.units;
      averageCost = ledger.averageCost;
    } else if (!ledger && meta) {
      // No buy/sell transactions for this ticker at all — trust the holdings
      // snapshot as-is (e.g. bulk CSV import with no per-trade history).
      units = meta.units;
      averageCost = meta.avg_price;
    } else {
      continue; // fully sold, or no usable data at all
    }
    if (!(units > 0)) continue;

    const costBasis = units * averageCost;

    let currency = (meta?.currency ?? '').trim() || tradeCurrencyByTicker.get(ticker) || '';
    if (!currency) {
      warnings.push({ code: 'unknown_currency', message: `No currency known for ${ticker}`, ticker });
      currency = UNKNOWN;
    }
    currenciesSeen.add(currency);

    const assetClass = (meta?.assetClass ?? '').trim() || UNKNOWN;
    const sector = (meta?.sector ?? '').trim() || UNKNOWN;

    const quote = input.latestQuotes?.[ticker];
    let price: number;
    let priceSource: PortfolioHoldingState['priceSource'];
    if (quote && Number.isFinite(quote.price) && quote.price > 0) {
      price = quote.price;
      priceSource = 'quote';
    } else {
      price = averageCost;
      priceSource = 'average_cost_fallback';
      warnings.push({ code: 'missing_quote', message: `No live quote for ${ticker}; using average cost as a fallback`, ticker });
    }

    const marketValue = units * price;
    const unrealizedGain = marketValue - costBasis;
    const unrealizedGainPct = costBasis !== 0 ? unrealizedGain / costBasis : 0;

    holdingStates.push({
      ticker, units, averageCost, costBasis, currency, assetClass, sector,
      price, priceSource, marketValue, unrealizedGain, unrealizedGainPct,
    });
  }

  holdingStates.sort((a, b) => b.marketValue - a.marketValue);

  const marketValue = sum(holdingStates.map(h => h.marketValue));
  const costBasisTotal = sum(holdingStates.map(h => h.costBasis));
  const totalUnits = sum(holdingStates.map(h => h.units));
  const averageCost = totalUnits > 0 ? costBasisTotal / totalUnits : 0;
  const unrealizedGain = marketValue - costBasisTotal;
  const unrealizedGainPct = costBasisTotal !== 0 ? unrealizedGain / costBasisTotal : 0;
  const totalPortfolioValue = marketValue + cashBalance;

  const allCurrencies = new Set(currenciesSeen);
  allCurrencies.add(userCurrency);
  if (allCurrencies.size > 1) {
    warnings.push({
      code: 'multi_currency_no_fx',
      message: `Portfolio holds multiple currencies (${Array.from(allCurrencies).sort().join(', ')}) with no FX conversion applied; totals are a naive sum across currencies`,
    });
  }

  return {
    holdings: holdingStates,
    marketValue,
    costBasis: costBasisTotal,
    averageCost,
    unrealizedGain,
    unrealizedGainPct,
    realizedGain,
    totalDividendsGross,
    totalDividendsNet,
    taxWithheld,
    cashBalance,
    totalPortfolioValue,
    allocationByAsset: buildAllocation(holdingStates, h => h.ticker, totalPortfolioValue),
    allocationByAssetClass: buildAllocation(holdingStates, h => h.assetClass, totalPortfolioValue),
    allocationBySector: buildAllocation(holdingStates, h => h.sector, totalPortfolioValue),
    allocationByCurrency: buildAllocation(holdingStates, h => h.currency, totalPortfolioValue),
    dataQualityWarnings: warnings,
  };
}
